import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function sendEmail(to: string, subject: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL") || "Igloo <noreply@igloo.scot>";
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY not configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html: message.replace(/\n/g, "<br/>"),
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      return { ok: false, error: `Resend error: ${txt}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
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

    const { issue_id } = await req.json() as { issue_id: string };
    if (!issue_id) {
      return new Response(JSON.stringify({ ok: false, error: "issue_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: issue, error: issueErr } = await supabase
      .from("issue_reports")
      .select("id, property_id, property_name, title, description, severity, photos, reporter_name, created_at, contractor_name, contractor_logged_at")
      .eq("id", issue_id)
      .maybeSingle();
    if (issueErr || !issue) throw issueErr ?? new Error("issue not found");

    let ownerEmail = "";
    let ownerName = "";
    if (issue.property_id) {
      const { data: mapping } = await supabase
        .from("property_owner_mapping")
        .select("owner_id")
        .eq("property_id", issue.property_id)
        .maybeSingle();
      if (mapping?.owner_id) {
        const { data: owner } = await supabase
          .from("owners")
          .select("email, full_name")
          .eq("id", mapping.owner_id)
          .maybeSingle();
        if (owner) {
          ownerEmail = owner.email ?? "";
          ownerName = owner.full_name ?? "";
        }
      }
    }

    if (!ownerEmail) {
      return new Response(JSON.stringify({ ok: false, error: "no owner email on file for this property" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const when = new Date(issue.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
    const severity = String(issue.severity || "normal").toUpperCase();
    const subject = `[${severity}] Issue at ${issue.property_name || "your property"}: ${issue.title}`;

    const photos: string[] = Array.isArray(issue.photos) ? issue.photos : [];
    const publicBase = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/turnover-photos/`;
    const photoLines = photos.length
      ? "\n\nPhotos:\n" + photos.map((p) => publicBase + p).join("\n")
      : "";

    const contractorLine = issue.contractor_logged_at && issue.contractor_name
      ? `\n\nContractor: ${issue.contractor_name} (logged ${new Date(issue.contractor_logged_at).toLocaleString("en-GB")}).`
      : "";

    const message =
      `Hi ${ownerName || "there"},\n\n` +
      `We've logged an issue at ${issue.property_name || "your property"} reported by ${issue.reporter_name || "our team"} on ${when}.\n\n` +
      `Issue: ${issue.title}\n` +
      (issue.description ? `\nDetails:\n${issue.description}\n` : "") +
      contractorLine +
      photoLines +
      `\n\nWe'll keep you posted as it's resolved.\n\nBest wishes,\nThe Igloo Team`;

    const result = await sendEmail(ownerEmail, subject, message);

    return new Response(JSON.stringify({
      ok: result.ok,
      email: result.ok ? ownerEmail : undefined,
      error: result.error,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
