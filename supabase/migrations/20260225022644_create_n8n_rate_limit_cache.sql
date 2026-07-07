/*
  # Create n8n Rate Limit Cache Table

  ## Purpose
  Stores a cache of recent webhook call signatures to prevent n8n workflows
  from processing duplicate events within a short time window.

  ## New Tables
  - `n8n_rate_limit_cache`
    - `id` (uuid, primary key)
    - `cache_key` (text, unique) - hash/identifier of the webhook payload
    - `created_at` (timestamptz) - when this entry was cached
    - `expires_at` (timestamptz) - when this cache entry expires

  ## Security
  - RLS enabled; only service role can read/write (n8n uses service key)
  - Public access is fully blocked
*/

CREATE TABLE IF NOT EXISTS n8n_rate_limit_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL
);

ALTER TABLE n8n_rate_limit_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only - select"
  ON n8n_rate_limit_cache FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role only - insert"
  ON n8n_rate_limit_cache FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role only - delete"
  ON n8n_rate_limit_cache FOR DELETE
  TO service_role
  USING (true);

CREATE INDEX IF NOT EXISTS idx_n8n_rate_limit_cache_key ON n8n_rate_limit_cache (cache_key);
CREATE INDEX IF NOT EXISTS idx_n8n_rate_limit_cache_expires ON n8n_rate_limit_cache (expires_at);
