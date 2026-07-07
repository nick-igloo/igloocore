import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CreatePayload {
  email: string;
  password: string;
  full_name?: string;
  make_admin?: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return json({ error: "Missing authorization" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "Invalid session" }, 401);
    }

    const callerRole = (userData.user.app_metadata as Record<string, unknown> | undefined)?.role;
    if (callerRole !== "admin") {
      return json({ error: "Admin access required" }, 403);
    }

    const body = (await req.json()) as CreatePayload;
    if (!body?.email || !body?.password) {
      return json({ error: "email and password are required" }, 400);
    }
    if (body.password.length < 8) {
      return json({ error: "Password must be at least 8 characters" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: body.email.trim().toLowerCase(),
      password: body.password,
      email_confirm: true,
      user_metadata: body.full_name ? { full_name: body.full_name } : {},
      app_metadata: body.make_admin ? { role: "admin" } : {},
    });

    if (createErr) {
      return json({ error: createErr.message }, 400);
    }

    return json({ user: created.user }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
