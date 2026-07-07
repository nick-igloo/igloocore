import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

    const [
      { data: storedMetrics },
      { count: totalReports },
      { count: totalProperties },
      { count: totalOwners },
      { count: safetyDocsExpiring },
      { count: reportsThisMonth },
      { data: nightsData },
    ] = await Promise.all([
      supabase.from("dashboard_data").select("*"),
      supabase.from("generated_reports").select("*", { count: "exact", head: true }),
      supabase
        .from("generated_reports")
        .select("property_name", { count: "exact", head: false })
        .then(async ({ data }) => {
          const unique = new Set((data || []).map((r: { property_name: string }) => r.property_name));
          return { count: unique.size };
        }),
      supabase.from("owner_properties").select("*", { count: "exact", head: true }),
      supabase
        .from("generated_reports")
        .select("*", { count: "exact", head: true })
        .eq("is_safety_document", true)
        .not("expiry_date", "is", null)
        .lte("expiry_date", new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
        .gte("expiry_date", new Date().toISOString().slice(0, 10)),
      supabase
        .from("generated_reports")
        .select("*", { count: "exact", head: true })
        .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
      supabase
        .from("generated_reports")
        .select("total_nights")
        .eq("file_type", "csv"),
    ]);

    const totalNights = (nightsData || []).reduce(
      (sum: number, r: { total_nights: number }) => sum + (r.total_nights || 0),
      0
    );

    const metrics = [
      { metric_key: "total_properties", metric_value: totalProperties ?? 0, metric_label: "Properties", metric_sublabel: "active listings" },
      { metric_key: "total_reports", metric_value: totalReports ?? 0, metric_label: "Reports Generated", metric_sublabel: "all time" },
      { metric_key: "total_owners", metric_value: totalOwners ?? 0, metric_label: "Owner Accounts", metric_sublabel: "with portal access" },
      { metric_key: "safety_docs_expiring", metric_value: safetyDocsExpiring ?? 0, metric_label: "Docs Expiring Soon", metric_sublabel: "within 30 days" },
      { metric_key: "total_nights", metric_value: totalNights, metric_label: "Total Nights", metric_sublabel: "across all bookings" },
      { metric_key: "reports_this_month", metric_value: reportsThisMonth ?? 0, metric_label: "Reports This Month", metric_sublabel: new Date().toLocaleString("en-GB", { month: "long" }) },
    ];

    for (const m of metrics) {
      await supabase.from("dashboard_data").upsert(
        { ...m, updated_at: new Date().toISOString() },
        { onConflict: "metric_key" }
      );
    }

    return new Response(JSON.stringify({ metrics }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
