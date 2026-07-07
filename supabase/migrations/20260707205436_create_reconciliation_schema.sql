-- ═══════════════════════════════════════════════════════════════════
-- IGLOO RECONCILIATION — SUPABASE SCHEMA
-- ═══════════════════════════════════════════════════════════════════

create table if not exists recon_avantio_bookings (
  booking_number text primary key,
  code text not null,
  portal text not null check (portal in ('airbnb','booking.com','other')),
  property text not null,
  checkin date,
  checkout date,
  paid numeric(10,2) not null default 0,
  commission numeric(10,2) not null default 0,
  extras numeric(10,2) not null default 0,
  expected numeric(10,2) not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists idx_avantio_code on recon_avantio_bookings (code);
create index if not exists idx_avantio_checkout on recon_avantio_bookings (checkout);

create table if not exists recon_bank_transactions (
  monzo_tx_id text primary key,
  tx_date date not null,
  counterparty text not null,
  amount numeric(10,2) not null,
  raw jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_bank_date on recon_bank_transactions (tx_date);
create index if not exists idx_bank_counterparty on recon_bank_transactions (counterparty);

create table if not exists recon_airbnb_payouts (
  id uuid primary key default gen_random_uuid(),
  payout_date date not null,
  arriving_date date,
  amount numeric(10,2) not null,
  airbnb_ref text unique,
  source text not null check (source in ('email','csv')),
  superseded boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_ab_payout_date on recon_airbnb_payouts (payout_date);

create table if not exists recon_airbnb_payout_items (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references recon_airbnb_payouts(id) on delete cascade,
  item_type text not null,
  code text not null,
  listing text,
  amount numeric(10,2) not null,
  pass_through numeric(10,2) not null default 0,
  unique (payout_id, code, item_type)
);
create index if not exists idx_ab_item_code on recon_airbnb_payout_items (code);

create table if not exists recon_bcom_reservations (
  ref text not null,
  payout_date date not null,
  statement_descriptor text,
  property text,
  checkin date,
  checkout date,
  payout_type text not null check (payout_type in ('Gross','Net')),
  gross numeric(10,2) not null default 0,
  commission numeric(10,2) not null default 0,
  commission_invoiced boolean not null default false,
  service_fee numeric(10,2) not null default 0,
  payable numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  primary key (ref, payout_date)
);
create index if not exists idx_bcom_payout_date on recon_bcom_reservations (payout_date);

create or replace function recon_supersede_email_payouts()
returns trigger language plpgsql as $$
begin
  if new.source = 'csv' then
    update recon_airbnb_payouts
      set superseded = true
      where source = 'email'
        and superseded = false
        and payout_date between new.payout_date - 2 and new.payout_date + 2
        and amount = new.amount;
  end if;
  return new;
end $$;

drop trigger if exists trg_supersede_email on recon_airbnb_payouts;
create trigger trg_supersede_email
  after insert on recon_airbnb_payouts
  for each row execute function recon_supersede_email_payouts();

alter table recon_avantio_bookings enable row level security;
alter table recon_bank_transactions enable row level security;
alter table recon_airbnb_payouts enable row level security;
alter table recon_airbnb_payout_items enable row level security;
alter table recon_bcom_reservations enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'recon_avantio_bookings','recon_bank_transactions',
    'recon_airbnb_payouts','recon_airbnb_payout_items','recon_bcom_reservations']
  loop
    execute format('drop policy if exists "recon_all_%s" on %I', t, t);
    execute format(
      'create policy "recon_all_%s" on %I for all using (true) with check (true)', t, t);
  end loop;
end $$;

alter table recon_avantio_bookings add column if not exists extras numeric(10,2) not null default 0;
