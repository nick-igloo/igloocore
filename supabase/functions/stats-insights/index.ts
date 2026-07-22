// stats-insights — receives the Director Stats payload, asks Claude for
// a structured analyst read, returns JSON. The Anthropic key lives only
// here (edge secret), never in the browser.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const stats = await req.json();

    const system = `You are the analytics director for Igloo, a short-term rental property management company in Aviemore in the Cairngorms, Scotland. You are given the live booking dataset summary: monthly performance for the current year (departures-based revenue, management commission, occupancy vs last year's booking pace and last year's final), sales pulse (bookings created in the last 24h/7d/30d), and per-property year figures.

Write a sharp internal read for the two directors. British English, plain and direct, no fluff, no restating the obvious numbers back — interpret them. Look for: pacing anomalies (months materially ahead/behind), momentum shifts in the pulse, standout and lagging properties relative to the portfolio, seasonal risks (soft months approaching), and where attention or pricing action would pay.

CRITICAL reasoning rules:
1. The portfolio has GROWN year on year (see the portfolio object: active counts, newThisYear). Portfolio-level occupancy percentages are DILUTED by newly onboarded properties still ramping up — never conclude performance declined from a lower blended occupancy % alone. Use the same-store figures (sameStoreNights/Revenue vs their Last equivalents — properties active in both years) as the honest like-for-like comparison, and say explicitly when growth dilution explains a headline percentage.
2. Judge each property against ITS OWN prior year (each property's lastYear object), not only against the portfolio average. A property behind the portfolio average but well up on its own last year is improving; call out properties materially DOWN on their own last year as the real attention list. Ignore last-year comparisons for properties with no prior-year data (new stock) — judge those on ramp-up instead.

Respond ONLY with valid JSON, no markdown fences, in this shape:
{
  "headline": "one-sentence overall read",
  "insights": [ { "title": "short label", "body": "2-3 sentences" } ],   // 3 to 5 items
  "actions": [ "specific recommended action" ]                            // 2 to 4 items
}`;

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system,
        messages: [{ role: "user", content: JSON.stringify(stats) }],
      }),
    });

    if (!anthropicRes.ok) {
      const t = await anthropicRes.text();
      return new Response(JSON.stringify({ error: `Anthropic ${anthropicRes.status}: ${t.slice(0, 300)}` }), {
        status: 502, headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const data = await anthropicRes.json();
    const text = (data.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("\n")
      .replace(/```json|```/g, "")
      .trim();

    const parsed = JSON.parse(text);
    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
