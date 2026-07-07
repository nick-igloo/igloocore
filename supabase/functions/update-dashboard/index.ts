import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));

    if (body.dashboard_data !== undefined) {
      const { error } = await supabase.from("dashboard_data").upsert(
        {
          metric_key: "executive_dashboard",
          metric_value: 0,
          metric_label: "Executive Dashboard",
          data: body.dashboard_data,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "metric_key" }
      );
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.metric_key !== undefined && body.metric_value !== undefined) {
      const { error } = await supabase.from("dashboard_data").upsert(
        {
          metric_key: body.metric_key,
          metric_value: body.metric_value,
          metric_label: body.metric_label ?? body.metric_key,
          metric_sublabel: body.metric_sublabel ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "metric_key" }
      );
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const statsUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/get-dashboard-stats`;
    const statsRes = await fetch(statsUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
    });

    const statsData = await statsRes.json();

    return new Response(JSON.stringify({ success: true, refreshed: true, metrics: statsData.metrics }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
