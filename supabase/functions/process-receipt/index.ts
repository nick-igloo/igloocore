import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ReceiptResult {
  amount: number | null;
  description: string | null;
  date: string | null;
  has_vat: boolean;
  vat_amount: number | null;
  zero_rated_amount: number | null;
  standard_rated_amount: number | null;
  vendor: string | null;
  property_name: string | null;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function buildPrompt(propertyNames: string[]): string {
  const propertyList = propertyNames.length > 0
    ? `\nProperty name list (match if receipt mentions one):\n${propertyNames.map((n) => `- ${n}`).join("\n")}\n`
    : "";

  return `You are an expert receipt/invoice reader for a holiday-let property management company. Analyze this document and extract the following information as JSON:

{
  "amount": <total amount as a number in GBP, or null if unclear>,
  "vat_amount": <the actual VAT amount in GBP shown on the receipt, or null if no VAT line visible>,
  "zero_rated_amount": <total of zero-rated items (0% VAT) in GBP, or null if not distinguishable>,
  "standard_rated_amount": <total of standard-rated items (20% VAT, net excl. VAT) in GBP, or null if not distinguishable>,
  "description": <short description including vendor name, max 60 chars>,
  "date": <date in YYYY-MM-DD format, or null if not visible>,
  "has_vat": <true if VAT is shown on the receipt, false otherwise>,
  "category": <"purchase_for_property" or "service_for_property" or "purchase_for_igloo">,
  "vendor": <name of the shop/vendor/person, or null if unclear>,
  "property_name": <matched property name from list below, or null if no match>
}

Rules:
- For amount, use the final TOTAL (including VAT if present). Convert pence to pounds.
- For vat_amount: Read the EXACT VAT figure PRINTED on the receipt. NEVER calculate VAT yourself (do NOT divide by 6, do NOT multiply by 0.2). Look for lines labelled "VAT", "V.A.T", "Tax", or a VAT summary table. On supermarket receipts look near the bottom for the VAT summary (shows rate, net, VAT columns). Return the actual number printed, or null if no VAT figure is printed anywhere.
- For zero_rated_amount: this is the TOTAL value of items charged at 0% VAT. On supermarket receipts, look for the VAT summary section which usually lists "0.00%" or "A" rate with a "Gross" or "Net" figure — that figure is the zero_rated_amount. Return null if the receipt doesn't show a VAT breakdown table.
- For standard_rated_amount: this is the NET value of items charged at 20% VAT (BEFORE VAT is added). On supermarket receipts, look in the VAT summary for the "20.00%" or "B" rate row — the "Net" column is what you want. If only the gross taxable amount is shown, subtract the vat_amount from it to get the net. Return null if the receipt doesn't show a VAT breakdown table.
- For has_vat: set true if a VAT amount or VAT summary is printed anywhere on the receipt. Set false only if there is genuinely no VAT information shown (no VAT number, no VAT line, no VAT summary). Most UK retail receipts from VAT-registered businesses (supermarkets, Screwfix, B&Q, etc.) DO show VAT — look carefully.
- For date, look for any date on the receipt. Use YYYY-MM-DD format.

DESCRIPTION rules:
- Start with the vendor/company name, then a dash, then what was bought. e.g. "Screwfix - door handles", "Tesco - welcome pack supplies", "B&Q - paint and brushes".
- NEVER use "groceries" or "food shopping". This is a holiday-let business. Supermarket purchases are either "welcome pack supplies" (wine, biscuits, tea, coffee, kitchen roll, bin bags) or "cleaning supplies" (bleach, cloths, sprays, mops).
- Be specific about what was purchased based on line items visible.

CATEGORY rules — the key distinction is BUYING A THING vs PAYING FOR LABOUR:
- "purchase_for_property": you are buying a physical product that is FIXED to or stays permanently in a specific property. Examples: appliances (toaster, kettle), furniture, bedding, firewood, lightbulbs, paint, hardware, keys, fixtures.
- "service_for_property": you are paying a person or company to PERFORM WORK on or for a property. The receipt/invoice is from a tradesperson, contractor, or service provider. Examples: grass cutting, window cleaning, plumbing, electrical work, carpet cleaning, chimney sweeping, laundry services, pest control, decorating labour.
- "purchase_for_igloo": a company-level purchase OR any consumable/stock purchase that is not permanently fixed to one property. This includes: welcome pack supplies (wine, biscuits, tea, coffee, consumables), cleaning products/supplies, kitchen roll, bin bags, office supplies, software, accountancy fees, company equipment, postage.

Key rule: if it gets USED UP or restocked regularly (consumables, cleaning supplies, welcome pack items) it is "purchase_for_igloo". If it STAYS in the property permanently (an appliance, a piece of furniture, a fixture) it is "purchase_for_property".

If a receipt contains both materials and labour (e.g. a plumber supplying and fitting a tap), classify as "service_for_property" since the primary cost is the service.

- For property_name, check if the receipt mentions any address, property name, or reference that matches one of the properties listed below. Return the EXACT name from the list, or null if no match.
- Return ONLY valid JSON, no markdown or explanation.
${propertyList}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const formData = await req.formData();
    const file = formData.get("receipt") as File | null;
    if (!file) {
      return new Response(
        JSON.stringify({ error: "No receipt file provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const propertyNamesRaw = formData.get("property_names") as string | null;
    const propertyNames: string[] = propertyNamesRaw
      ? JSON.parse(propertyNamesRaw)
      : [];

    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = file.type || "application/octet-stream";
    const isPdf = mimeType === "application/pdf" || file.name?.toLowerCase().endsWith(".pdf");

    const base64 = toBase64(bytes);
    const prompt = buildPrompt(propertyNames);

    const contentParts: unknown[] = [{ type: "text", text: prompt }];

    if (isPdf) {
      contentParts.push({
        type: "file",
        file: { filename: file.name || "receipt.pdf", file_data: `data:application/pdf;base64,${base64}` },
      });
    } else {
      const imgMime = mimeType.startsWith("image/") ? mimeType : "image/jpeg";
      contentParts.push({
        type: "image_url",
        image_url: { url: `data:${imgMime};base64,${base64}`, detail: "low" },
      });
    }

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: contentParts }],
        max_tokens: 400,
        temperature: 0,
      }),
    });

    if (!openaiRes.ok) {
      const errBody = await openaiRes.text();
      return new Response(
        JSON.stringify({ error: `AI API error: ${openaiRes.status}`, details: errBody }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aiData = await openaiRes.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    let result: ReceiptResult;
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```/g, "").trim();
      result = JSON.parse(cleaned);
    } catch {
      return new Response(
        JSON.stringify({ error: "Could not parse AI response", raw: content }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
