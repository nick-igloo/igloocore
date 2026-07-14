/*
  # Tier A lockdown — financial / PII / reconciliation tables → admin only

  PREREQUISITES — DO NOT APPLY BEFORE:
    1. n8n Supabase credential switched to the service_role key
       (service_role bypasses RLS; all recon workflows keep working).
    2. Optionally set app_metadata {"role":"admin"} on the two director
       users in Supabase Auth (the email fallback below covers them anyway).

  Effect: these tables become invisible and immutable to the anon key and
  to any authenticated non-admin (owners, future cleaners). The two
  directors (by role claim or email) retain full access. Edge functions
  and n8n using service_role are unaffected.

  Rollback: drop the admin_all_* policies and recreate previous ones,
  or disable RLS per table (not recommended).
*/

-- Admin check: role claim first, director emails as fallback
create or replace function public.is_igloo_admin()
returns boolean
language sql
stable
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or lower(coalesce(auth.jwt() ->> 'email', '')) in
      ('nick@igloo.scot', 'erin@igloo.scot'),
    false
  );
$$;

do $$
declare
  t text;
  pol record;
  tier_a text[] := array[
    'owner_bank_details',
    'owners',
    'director_expenses',
    'director_access',
    'director_dashboard_prefs',
    'settlement_config',
    'recon_avantio_bookings',
    'recon_bank_transactions',
    'recon_airbnb_payouts',
    'recon_airbnb_payout_items',
    'recon_bcom_reservations',
    'recon_dismissed'
  ];
begin
  foreach t in array tier_a loop
    -- skip tables that don't exist in this project
    if to_regclass('public.' || t) is null then
      raise notice 'skipping missing table %', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    -- drop every existing policy (blanket anon/true policies included)
    for pol in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;

    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.is_igloo_admin())
         with check (public.is_igloo_admin())',
      'admin_all_' || t, t);
  end loop;
end $$;
