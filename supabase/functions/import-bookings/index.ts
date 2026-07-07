import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface BookingRow {
  property_name: string;
  guest_name?: string;
  guest_email?: string;
  guest_phone?: string;
  check_in: string;
  check_out: string;
  source?: string;
  external_id?: string;
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

    const body = await req.json();
    const rows: BookingRow[] = Array.isArray(body) ? body : body?.bookings ?? [];
    if (!rows.length) {
      return new Response(JSON.stringify({ ok: false, error: "No bookings provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: properties } = await supabase.from("properties").select("id, name");
    const propMap = new Map<string, string>();
    (properties ?? []).forEach((p: any) => propMap.set(p.name.toLowerCase(), p.id));

    const toUpsert = rows
      .filter((r) => r.property_name && r.check_in && r.check_out)
      .map((r) => ({
        property_id: propMap.get(r.property_name.toLowerCase()) ?? null,
        property_name: r.property_name,
        guest_name: r.guest_name ?? "",
        guest_email: r.guest_email ?? "",
        guest_phone: r.guest_phone ?? "",
        check_in: r.check_in,
        check_out: r.check_out,
        source: r.source ?? "csv",
        external_id: r.external_id ?? "",
        updated_at: new Date().toISOString(),
      }));

    if (!toUpsert.length) {
      return new Response(JSON.stringify({ ok: false, error: "No valid rows" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error } = await supabase.from("property_bookings_cache").insert(toUpsert);
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, inserted: toUpsert.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
