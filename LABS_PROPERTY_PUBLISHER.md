# Labs · Property Publisher

Demo of the Avantio PMS v2 gallery/accommodation APIs, live at
`hq.igloo.scot/labs/property-publisher`. Drag-drop photos → AI tags and
descriptions → one click creates the accommodation + gallery in Avantio
(test credentials) and mirrors the photos to Google Drive.

## Why the architecture looks like this

**Avantio has no file upload.** `POST .../gallery/{galleryId}/images` takes a
**public URL** and pulls the file (jpg/jpeg/png/webp/gif, 50 KB – 11 MB). So
photos land in a public Supabase Storage bucket first — that public URL is
what Avantio ingests, and it's also what n8n fetches to mirror to Drive.

**The browser never calls Avantio or Anthropic.** Everything goes through one
n8n webhook (`POST https://igloo.app.n8n.cloud/webhook/photo-upload`), routed
by an `action` field:

- `tag_images` → Claude vision reads each photo, returns `{category, description}`
  constrained to the category list the frontend sends.
- `publish` → create accommodation → create gallery → upload each image (URL
  pull) → create Drive folder → mirror photos → mark the draft published in
  Supabase → respond with the new IDs.

**Plug and play:** swapping test → live Avantio is ONE credential change in
n8n. Zero frontend changes.

## Setup (one-off)

1. **Supabase** — run `supabase/migrations/20260722200000_labs_property_publisher.sql`
   (SQL editor or CLI). Creates `labs_property_drafts`, `labs_images`, and the
   public `labs-property-photos` bucket.
2. **n8n** — import `n8n/labs-photo-upload-workflow.json`, then attach four
   credentials (all placeholders in the JSON):
   - `Anthropic x-api-key` — Header Auth, header name `x-api-key`, value = API key
   - `Avantio X-Avantio-Auth (TEST)` — Header Auth, header name `X-Avantio-Auth`,
     value = the test token
   - `Google Drive (Igloo)` — existing Drive OAuth credential
   - `Supabase (service role)` — existing service-role credential
   Then **Activate** the workflow.
3. **Netlify (optional)** — `VITE_N8N_LABS_WEBHOOK_URL` overrides the default
   webhook URL baked into the page.

## Things to verify against the Avantio docs

Two enum lists are collapsed in the API reference PDF ("Show 20/30 enum
values") so the exact values couldn't be read out:

- **Image categories** (`IMAGE_CATEGORIES` in
  `src/pages/labs/PropertyPublisher.tsx`) — KITCHEN is confirmed; the other 19
  are educated guesses. Open Upload Image in the API portal, expand the enum,
  and correct the list. It's the single source of truth: the UI dropdown and
  the AI tagger prompt both read from it.
- **Accommodation types** (`ACCOMMODATION_TYPES`, same file) — APARTMENT
  confirmed; expand the enum on Create Accommodation and correct.

Also check the **localized description shape** on Upload Image — the workflow
sends `[{ languageCode: 'en', text: ... }]`; the PDF shows it's an "array of
objects" but the field names are collapsed. A 400 from the sandbox will state
the expected shape; adjust the `Avantio: upload image` node body to match.

## Swapping to live later

1. Duplicate the n8n workflow, attach the live `X-Avantio-Auth` credential.
2. Change the webhook path (e.g. `photo-upload-live`) and point
   `VITE_N8N_LABS_WEBHOOK_URL` at it — or just swap the credential in place.
3. Nothing else changes.

## Future Labs entries

Add a route under `/labs/*` in `App.tsx` and an item to the `Labs` group in
`src/components/AppShell.tsx`. Convention: each Labs page is self-contained,
talks to external APIs only via n8n, and states clearly in its header whether
it touches live data.
