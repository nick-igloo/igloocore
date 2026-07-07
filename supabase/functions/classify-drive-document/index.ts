import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ClassificationResult {
  property_name: string | null;
  doc_type: string | null;
  expiry_date: string | null;
  confidence: number;
  reasoning: string;
}

const CLASSIFICATION_PROMPT = `You are a document classifier for a property management company called Igloo (based in Scotland).
Analyze this document and determine:
1. Which property it belongs to (fuzzy match against the provided list)
2. What type of safety/compliance document it is
3. The expiry or next-due date (look for "valid until", "next test due", "expiry", "renewal date" etc.)

DOCUMENT TYPES (pick one or null):
- stl_licence (Short-term Let licence)
- eicr (Electrical Installation Condition Report)
- pat (Portable Appliance Testing certificate)
- gas_safety (Gas Safety Certificate / CP12)
- fire_risk_assessment (Fire Risk Assessment)
- insurance (Property insurance documents)
- inventory (Property inventory/check-in report)
- other (Any other compliance document)

Respond in JSON only:
{
  "property_name": "exact name from properties list or null",
  "doc_type": "type from list above or null",
  "expiry_date": "YYYY-MM-DD or null",
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation"
}`;

async function getGoogleAccessToken(): Promise<string> {
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN");
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error("Google OAuth credentials not configured");
  }

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Failed to refresh Google token: ${err}`);
  }

  const data = await resp.json();
  return data.access_token;
}

async function downloadDriveFile(
  accessToken: string,
  fileId: string,
  mimeType: string
): Promise<{ buffer: ArrayBuffer; exportMime: string }> {
  let url: string;
  let exportMime = mimeType;

  if (mimeType === "application/vnd.google-apps.document") {
    url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/pdf`;
    exportMime = "application/pdf";
  } else if (mimeType === "application/vnd.google-apps.spreadsheet") {
    url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/pdf`;
    exportMime = "application/pdf";
  } else {
    url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  }

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!resp.ok) {
    throw new Error(`Failed to download file ${fileId}: ${resp.statusText}`);
  }

  return { buffer: await resp.arrayBuffer(), exportMime };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function classifyWithVision(
  fileName: string,
  fileBase64: string,
  mimeType: string,
  propertyNames: string[],
  subfolderPath?: string
): Promise<ClassificationResult> {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) throw new Error("OPENAI_API_KEY not configured");

  const folderHint = subfolderPath
    ? `\n\nFOLDER PATH HINT: This file was found in the subfolder "${subfolderPath}". The first segment of this path is very likely the property name — use it as a strong signal for matching.`
    : "";

  const fullPrompt = `${CLASSIFICATION_PROMPT}

PROPERTIES LIST:
${propertyNames.join("\n")}

The filename is: "${fileName}"${folderHint}`;

  const content: any[] = [{ type: "text", text: fullPrompt }];

  if (mimeType === "application/pdf") {
    content.push({
      type: "file",
      file: {
        filename: fileName,
        file_data: `data:application/pdf;base64,${fileBase64}`,
      },
    });
  } else if (mimeType.startsWith("image/")) {
    content.push({
      type: "image_url",
      image_url: {
        url: `data:${mimeType};base64,${fileBase64}`,
        detail: "high",
      },
    });
  }

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [{ role: "user", content }],
      temperature: 0.1,
      response_format: { type: "json_object" },
      max_tokens: 500,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI API error: ${err}`);
  }

  const data = await resp.json();
  const result = data.choices[0]?.message?.content;
  return JSON.parse(result);
}

async function classifyByFilenameOnly(
  fileName: string,
  propertyNames: string[],
  subfolderPath?: string
): Promise<ClassificationResult> {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) throw new Error("OPENAI_API_KEY not configured");

  const folderHint = subfolderPath
    ? `\n\nFOLDER PATH HINT: This file was found in the subfolder "${subfolderPath}". The first segment of this path is very likely the property name — use it as a strong signal for matching.`
    : "";

  const fullPrompt = `${CLASSIFICATION_PROMPT}

PROPERTIES LIST:
${propertyNames.join("\n")}

You only have the filename to work with (no file content available).
FILENAME: "${fileName}"${folderHint}`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: fullPrompt }],
      temperature: 0.1,
      response_format: { type: "json_object" },
      max_tokens: 500,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI API error: ${err}`);
  }

  const data = await resp.json();
  const result = data.choices[0]?.message?.content;
  return JSON.parse(result);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { action, queueItemIds, useVision = true } = await req.json();

    // Get property names for matching
    const { data: properties } = await supabase
      .from("properties")
      .select("id, name")
      .eq("active", true);

    const propertyNames = (properties || []).map(
      (p: { name: string }) => p.name
    );
    const propertyMap = new Map(
      (properties || []).map((p: { id: string; name: string }) => [
        p.name,
        p.id,
      ])
    );

    if (action === "classify_batch") {
      const { data: items } = await supabase
        .from("drive_sync_queue")
        .select("*")
        .in("id", queueItemIds)
        .in("status", ["pending", "needs_review"]);

      if (!items || items.length === 0) {
        return new Response(
          JSON.stringify({ processed: 0, message: "No pending items found" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Get Google access token once for the batch if using vision
      let accessToken: string | null = null;
      if (useVision) {
        try {
          accessToken = await getGoogleAccessToken();
        } catch (e) {
          // Fall back to filename-only classification
          accessToken = null;
        }
      }

      const results = [];

      for (const item of items) {
        try {
          await supabase
            .from("drive_sync_queue")
            .update({ status: "processing" })
            .eq("id", item.id);

          let classification: ClassificationResult;

          if (useVision && accessToken) {
            // Download the file from Drive and send to Vision
            const { buffer, exportMime } = await downloadDriveFile(
              accessToken,
              item.drive_file_id,
              item.mime_type
            );

            const base64 = arrayBufferToBase64(buffer);
            classification = await classifyWithVision(
              item.file_name,
              base64,
              exportMime,
              propertyNames,
              item.subfolder_path || undefined
            );
          } else {
            // Fallback: classify by filename only
            classification = await classifyByFilenameOnly(
              item.file_name,
              propertyNames,
              item.subfolder_path || undefined
            );
          }

          const newStatus =
            classification.confidence >= 0.7 && classification.property_name
              ? "matched"
              : "needs_review";

          const propertyId = classification.property_name
            ? propertyMap.get(classification.property_name) || null
            : null;

          await supabase
            .from("drive_sync_queue")
            .update({
              status: newStatus,
              matched_property_id: propertyId,
              matched_property_name: classification.property_name,
              detected_doc_type: classification.doc_type,
              detected_expiry_date: classification.expiry_date,
              confidence_score: classification.confidence,
              error_message: classification.reasoning,
              processed_at: new Date().toISOString(),
            })
            .eq("id", item.id);

          results.push({
            id: item.id,
            file_name: item.file_name,
            status: newStatus,
            ...classification,
          });
        } catch (err) {
          await supabase
            .from("drive_sync_queue")
            .update({
              status: "error",
              error_message: (err as Error).message,
            })
            .eq("id", item.id);

          results.push({
            id: item.id,
            file_name: item.file_name,
            status: "error",
            error: (err as Error).message,
          });
        }
      }

      return new Response(
        JSON.stringify({ processed: results.length, results }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "reclassify") {
      const { data: item } = await supabase
        .from("drive_sync_queue")
        .select("*")
        .eq("id", queueItemIds[0])
        .maybeSingle();

      if (!item) {
        return new Response(JSON.stringify({ error: "Item not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let classification: ClassificationResult;

      if (useVision) {
        try {
          const accessToken = await getGoogleAccessToken();
          const { buffer, exportMime } = await downloadDriveFile(
            accessToken,
            item.drive_file_id,
            item.mime_type
          );
          const base64 = arrayBufferToBase64(buffer);
          classification = await classifyWithVision(
            item.file_name,
            base64,
            exportMime,
            propertyNames,
            item.subfolder_path || undefined
          );
        } catch {
          classification = await classifyByFilenameOnly(
            item.file_name,
            propertyNames,
            item.subfolder_path || undefined
          );
        }
      } else {
        classification = await classifyByFilenameOnly(
          item.file_name,
          propertyNames,
          item.subfolder_path || undefined
        );
      }

      const propertyId = classification.property_name
        ? propertyMap.get(classification.property_name) || null
        : null;

      await supabase
        .from("drive_sync_queue")
        .update({
          status:
            classification.confidence >= 0.7 && classification.property_name
              ? "matched"
              : "needs_review",
          matched_property_id: propertyId,
          matched_property_name: classification.property_name,
          detected_doc_type: classification.doc_type,
          detected_expiry_date: classification.expiry_date,
          confidence_score: classification.confidence,
          error_message: classification.reasoning,
          processed_at: new Date().toISOString(),
        })
        .eq("id", item.id);

      return new Response(
        JSON.stringify({ success: true, ...classification }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        error: "Unknown action. Use: classify_batch, reclassify",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
