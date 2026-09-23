-- ============================================================
-- Phase 11: DB Search + Analytics + API Keys + Webhooks + Encryption
-- ============================================================

-- ============ 1. API Keys (K) ============

CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT ARRAY['files:read']::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked boolean NOT NULL DEFAULT false
);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON api_keys FROM anon, authenticated, PUBLIC;

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash) WHERE revoked = false;
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);

-- ============ 2. Webhooks (J) ============

CREATE TABLE IF NOT EXISTS webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  secret text NOT NULL,
  events text[] NOT NULL DEFAULT ARRAY[]::text[],
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_triggered_at timestamptz,
  failure_count integer NOT NULL DEFAULT 0
);

ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON webhooks FROM anon, authenticated, PUBLIC;

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id uuid NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  response_code integer,
  response_body text,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);

ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON webhook_deliveries FROM anon, authenticated, PUBLIC;

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_hook ON webhook_deliveries(webhook_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status) WHERE status = 'pending';

-- ============ 3. Search Index (D) ============

-- Ekstensi untuk full text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Tambahkan kolom search vector ke file_mappings
ALTER TABLE file_mappings
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(filename, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_file_mappings_search ON file_mappings USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_file_mappings_filename_trgm ON file_mappings USING GIN(filename gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_file_mappings_mime ON file_mappings(mime_type);
CREATE INDEX IF NOT EXISTS idx_file_mappings_size ON file_mappings(size);
CREATE INDEX IF NOT EXISTS idx_file_mappings_modified ON file_mappings(updated_at DESC);

-- ============ 4. Analytics (F) ============

CREATE TABLE IF NOT EXISTS storage_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_node_id uuid NOT NULL REFERENCES storage_nodes(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  cap_gb numeric NOT NULL DEFAULT 0,
  used_gb numeric NOT NULL DEFAULT 0,
  file_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(storage_node_id, snapshot_date)
);

ALTER TABLE storage_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON storage_snapshots FROM anon, authenticated, PUBLIC;

CREATE INDEX IF NOT EXISTS idx_storage_snapshots_date ON storage_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_storage_snapshots_node ON storage_snapshots(storage_node_id, snapshot_date DESC);

-- ============ 5. Encryption metadata (I) ============

ALTER TABLE file_mappings
  ADD COLUMN IF NOT EXISTS is_encrypted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS encryption_iv text,
  ADD COLUMN IF NOT EXISTS original_size bigint;

CREATE INDEX IF NOT EXISTS idx_file_mappings_encrypted ON file_mappings(is_encrypted) WHERE is_encrypted = true;