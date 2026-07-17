/*
  # Operations rebuild, phase 1 — align existing tables for the
  # issue lifecycle + Avantio API sync

  Extends what already exists (issue_reports, issue_status_events,
  properties, property_bookings_cache) rather than creating parallel
  tables. All DDL is defensive: safe to run on production and on a
  fresh demo project that has had prior migrations applied.

  1. issue_reports — adds the 'contractor_attending' stage between
     contractor_logged and resolution, plus guest-message tracking.
     Full lifecycle: open → contractor_logged → contractor_attending
     → owner_notified (optional, any point) → resolved / cancelled.
  2. issue_status_events — new event types: contractor_attending,
     guest_message, status_change.
  3. message_templates — owner + guest wording with {placeholders},
     freeform-editable at send time.
  4. properties / property_bookings_cache — Avantio linkage columns
     for the n8n sync (accommodations import, booking-updates feed,
     nightly sweep, clean write-back).
*/

-- 1. issue_reports lifecycle extension
alter table issue_reports drop constraint if exists issue_reports_status_check;
alter table issue_reports add constraint issue_reports_status_check check (
  status in ('open','contractor_logged','contractor_attending','owner_notified','resolved','cancelled')
);
alter table issue_reports add column if not exists contractor_attending_at timestamptz;
alter table issue_reports add column if not exists guest_message_at timestamptz;
alter table issue_reports add column if not exists guest_message_body text default '';

-- 2. issue_status_events event types
alter table issue_status_events drop constraint if exists issue_events_type_check;
alter table issue_status_events add constraint issue_events_type_check check (
  event_type in ('created','status_note','status_change','contractor_logged',
                 'contractor_attending','owner_notified','guest_message',
                 'resolved','reopened','cancelled')
);

-- 3. Message templates
create table if not exists message_templates (
  id uuid primary key default gen_random_uuid(),
  audience text not null check (audience in ('owner','guest')),
  label text not null,
  body text not null,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
alter table message_templates enable row level security;
drop policy if exists "Authenticated read templates" on message_templates;
create policy "Authenticated read templates" on message_templates
  for select to authenticated using (true);
drop policy if exists "Admin manage templates" on message_templates;
create policy "Admin manage templates" on message_templates
  for all to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false))
  with check (coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false));

insert into message_templates (audience, label, body, sort)
select * from (values
  ('owner', 'Issue reported',
   'Hi, just to let you know an issue was reported at {property} on {date}: {description}. We are dealing with it and will keep you posted. — Igloo', 1),
  ('owner', 'Contractor attending',
   'Update on {property}: {contractor} is attending to sort the reported issue ({description}). We''ll confirm once resolved. — Igloo', 2),
  ('owner', 'Issue resolved',
   'Good news — the issue at {property} ({description}) has been resolved. {note} — Igloo', 3),
  ('guest', 'Contractor scheduled',
   'Hello! A contractor is scheduled to attend the property shortly to sort a small maintenance matter. They''ll knock first and keep any disruption to a minimum.', 1),
  ('guest', 'Contractor attended — resolved',
   'Hello! The contractor has attended and the issue is now resolved. Apologies for any inconvenience — enjoy the rest of your stay!', 2)
) as v(audience, label, body, sort)
where not exists (select 1 from message_templates);

-- 4. Avantio linkage for the n8n sync
alter table properties add column if not exists avantio_property_id text;
create unique index if not exists properties_avantio_id_unique
  on properties (avantio_property_id) where avantio_property_id is not null;

alter table property_bookings_cache add column if not exists avantio_booking_id text;
create unique index if not exists pbc_avantio_booking_unique
  on property_bookings_cache (avantio_booking_id) where avantio_booking_id is not null;
alter table property_bookings_cache add column if not exists booking_status text;
alter table property_bookings_cache add column if not exists pax int;
alter table property_bookings_cache add column if not exists synced_at timestamptz;
alter table property_bookings_cache add column if not exists clean_pushed_at timestamptz;
