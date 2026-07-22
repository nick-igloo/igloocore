-- ═══════════════════════════════════════════════════════════════════
-- Labs: Property Publisher (photo uploader / gallery / AI tagger)
-- Demo of Avantio PMS v2 gallery + accommodation APIs.
-- Images live in a PUBLIC bucket because Avantio's Upload Image
-- endpoint pulls from a public URL (no multipart upload exists).
-- ═══════════════════════════════════════════════════════════════════

-- ── Tables ──────────────────────────────────────────────────────────

create table if not exists labs_property_drafts (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  accommodation_type text not null default 'HOUSE',
  country_code text not null default 'GB',
  city text,
  status text not null default 'draft'
    check (status in ('draft', 'publishing', 'published', 'error')),
  avantio_accommodation_id text,
  avantio_gallery_id text,
  drive_folder_url text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists labs_images (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references labs_property_drafts(id) on delete cascade,
  storage_path text not null,
  public_url text not null,
  file_name text not null,
  file_size integer,
  sort_order integer not null default 1,
  category text,                -- Avantio image category enum value
  description text,             -- AI or manually written description
  ai_tagged boolean not null default false,
  avantio_image_id text,
  created_at timestamptz not null default now()
);

create index if not exists labs_images_draft_idx on labs_images (draft_id, sort_order);

-- ── RLS: directors only (same pattern as other admin tables) ────────

alter table labs_property_drafts enable row level security;
alter table labs_images enable row level security;

create policy "authenticated full access drafts"
  on labs_property_drafts for all
  to authenticated
  using (true) with check (true);

create policy "authenticated full access labs images"
  on labs_images for all
  to authenticated
  using (true) with check (true);

-- n8n uses the service role key and bypasses RLS for status writes.

-- ── Storage: public bucket for property photos ──────────────────────

insert into storage.buckets (id, name, public)
values ('labs-property-photos', 'labs-property-photos', true)
on conflict (id) do nothing;

create policy "authenticated upload labs photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'labs-property-photos');

create policy "authenticated delete labs photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'labs-property-photos');

create policy "public read labs photos"
  on storage.objects for select
  to public
  using (bucket_id = 'labs-property-photos');
