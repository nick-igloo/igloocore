import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface NotifyRequest {
  session_id?: string;
  property_name: string;
  guest_name?: string;
  guest_email?: string;
  guest_phone?: string;
  channel: "email" | "sms" | "both";
  subject?: string;
  message?: string;
}

async function sendEmail(to: string, subject: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL") || "Igloo <noreply@igloo.scot>";
  if (!apiKey) {
    console.log("[notify-guest] RESEND_API_KEY not set - email not sent", { to, subject });
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

async function sendSms(to: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_FROM_NUMBER");
  if (!sid || !token || !from) {
    console.log("[notify-guest] Twilio not configured - sms not sent", { to });
    return { ok: false, error: "TWILIO credentials not configured" };
  }
  try {
    const body = new URLSearchParams({ To: to, From: from, Body: message });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${btoa(`${sid}:${token}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    if (!res.ok) {
      const txt = await res.text();
      return { ok: false, error: `Twilio error: ${txt}` };
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

    const body = await req.json() as NotifyRequest;
    const {
      session_id,
      property_name,
      guest_name = "",
      guest_email = "",
      guest_phone = "",
      channel,
      subject = `Your stay at ${property_name} is ready`,
      message = `Hi ${guest_name || "there"},\n\nGreat news - ${property_name} has been checked, cleaned and is ready for your arrival. We hope you have a wonderful stay.\n\nBest wishes,\nThe Igloo Team`,
    } = body;

    const results: any = {};

    if (channel === "email" || channel === "both") {
      if (!guest_email) {
        results.email = { ok: false, error: "guest_email missing" };
      } else {
        results.email = await sendEmail(guest_email, subject, message);
        await supabase.from("guest_notifications").insert({
          session_id: session_id ?? null,
          property_name,
          guest_name,
          channel: "email",
          recipient: guest_email,
          subject,
          message,
          status: results.email.ok ? "sent" : "failed",
          error_message: results.email.error ?? "",
        });
      }
    }

    if (channel === "sms" || channel === "both") {
      if (!guest_phone) {
        results.sms = { ok: false, error: "guest_phone missing" };
      } else {
        results.sms = await sendSms(guest_phone, message);
        await supabase.from("guest_notifications").insert({
          session_id: session_id ?? null,
          property_name,
          guest_name,
          channel: "sms",
          recipient: guest_phone,
          subject: "",
          message,
          status: results.sms.ok ? "sent" : "failed",
          error_message: results.sms.error ?? "",
        });
      }
    }

    if (session_id) {
      await supabase
        .from("guest_ready_sessions")
        .update({ status: "notified", updated_at: new Date().toISOString() })
        .eq("id", session_id);
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[notify-guest] error", err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
