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
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }
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

    const { completion_id } = await req.json() as { completion_id: string };
    if (!completion_id) {
      return new Response(JSON.stringify({ ok: false, error: "completion_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: completion, error: compErr } = await supabase
      .from("property_owner_task_completions")
      .select("id, task_id, property_id, performed_by_name, performed_at, value, notes")
      .eq("id", completion_id)
      .maybeSingle();
    if (compErr || !completion) throw compErr ?? new Error("completion not found");

    const { data: task } = await supabase
      .from("property_owner_tasks")
      .select("id, name, value_label, notify_owner_email")
      .eq("id", completion.task_id)
      .maybeSingle();
    if (!task) throw new Error("task not found");
    if (!task.notify_owner_email) {
      return new Response(JSON.stringify({ ok: true, skipped: "notify_owner_email disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: property } = await supabase
      .from("properties")
      .select("id, name")
      .eq("id", completion.property_id)
      .maybeSingle();

    const { data: mapping } = await supabase
      .from("property_owner_mapping")
      .select("owner_id")
      .eq("property_id", completion.property_id)
      .maybeSingle();

    let ownerEmail = "";
    let ownerName = "";
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

    if (!ownerEmail) {
      return new Response(JSON.stringify({ ok: false, error: "no owner email on file" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const when = new Date(completion.performed_at).toLocaleString("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    });
    const subject = `${task.name} completed at ${property?.name ?? "your property"}`;
    const valueLine = completion.value
      ? `\n${task.value_label || "Reading"}: ${completion.value}`
      : "";
    const notesLine = completion.notes ? `\n\nNotes:\n${completion.notes}` : "";
    const message =
      `Hi ${ownerName || "there"},\n\n` +
      `${task.name} was completed at ${property?.name ?? "your property"} on ${when} ` +
      `by ${completion.performed_by_name || "our team"}.${valueLine}${notesLine}\n\n` +
      `Best wishes,\nThe Igloo Team`;

    const result = await sendEmail(ownerEmail, subject, message);

    if (result.ok) {
      await supabase
        .from("property_owner_task_completions")
        .update({ owner_notified_at: new Date().toISOString() })
        .eq("id", completion.id);
    }

    return new Response(JSON.stringify({ ok: result.ok, error: result.error }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
