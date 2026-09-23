-- ============================================================
-- Phase 10: File versioning + deduplication
-- ============================================================

-- 1. File versions table
CREATE TABLE IF NOT EXISTS file_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_node_id uuid NOT NULL REFERENCES storage_nodes(id) ON DELETE CASCADE,
  google_file_id text NOT NULL,
  version_number integer NOT NULL DEFAULT 1,
  filename text NOT NULL,
  mime_type text,
  size bigint DEFAULT 0,
  content_hash text,
  archived_google_file_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(storage_node_id, google_file_id, version_number)
);

ALTER TABLE file_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON file_versions FROM anon, authenticated, PUBLIC;

CREATE INDEX IF NOT EXISTS idx_file_versions_file ON file_versions(storage_node_id, google_file_id);
CREATE INDEX IF NOT EXISTS idx_file_versions_hash ON file_versions(content_hash);

-- 2. Content hashes table (untuk deduplication)
CREATE TABLE IF NOT EXISTS content_hashes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hash text NOT NULL,
  storage_node_id uuid NOT NULL REFERENCES storage_nodes(id) ON DELETE CASCADE,
  google_file_id text NOT NULL,
  filename text NOT NULL,
  size bigint NOT NULL DEFAULT 0,
  mime_type text,
  reference_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(hash, storage_node_id, google_file_id)
);

ALTER TABLE content_hashes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON content_hashes FROM anon, authenticated, PUBLIC;

CREATE INDEX IF NOT EXISTS idx_content_hashes_hash ON content_hashes(hash);
CREATE INDEX IF NOT EXISTS idx_content_hashes_size ON content_hashes(size);

-- 3. Add columns to upload_sessions
ALTER TABLE upload_sessions
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS resume_offset bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dedup_of text;

CREATE INDEX IF NOT EXISTS idx_upload_sessions_hash ON upload_sessions(content_hash);

-- 4. Add dedup stats to file_mappings (optional)
ALTER TABLE file_mappings
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS is_dedup_ref boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dedup_target_id text;