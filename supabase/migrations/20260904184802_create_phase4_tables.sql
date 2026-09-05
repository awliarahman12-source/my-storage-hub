/*
# Phase 4: File mappings, upload sessions, app settings, passcode hash

## New Tables
- `file_mappings` — maps internal file IDs to Google Drive file IDs per storage node
- `upload_sessions` — tracks upload queue items with status and progress
- `app_settings` — single-row table for app-level config (routing mode, passcode hash)

## Security
- All tables have RLS enabled with no direct policies (locked down)
- Access only through edge functions using service role key
- Passcode stored as SHA-256 hash, never plaintext
*/

-- File mappings table
CREATE TABLE IF NOT EXISTS file_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_node_id uuid NOT NULL REFERENCES storage_nodes(id) ON DELETE CASCADE,
  google_file_id text NOT NULL,
  filename text NOT NULL,
  mime_type text,
  size bigint DEFAULT 0,
  parent_google_id text,
  is_folder boolean NOT NULL DEFAULT false,
  starred boolean NOT NULL DEFAULT false,
  trashed boolean NOT NULL DEFAULT false,
  shared boolean NOT NULL DEFAULT false,
  access_level text DEFAULT 'private',
  thumbnail_link text,
  web_view_link text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(storage_node_id, google_file_id)
);

ALTER TABLE file_mappings ENABLE ROW LEVEL SECURITY;

-- Upload sessions table
CREATE TABLE IF NOT EXISTS upload_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_node_id uuid NOT NULL REFERENCES storage_nodes(id) ON DELETE CASCADE,
  upload_id text,
  google_file_id text,
  filename text NOT NULL,
  mime_type text NOT NULL,
  size bigint NOT NULL DEFAULT 0,
  parent_google_id text,
  status text NOT NULL DEFAULT 'queued',
  progress integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE upload_sessions ENABLE ROW LEVEL SECURITY;

-- App settings table (single row)
CREATE TABLE IF NOT EXISTS app_settings (
  id integer PRIMARY KEY DEFAULT 1,
  passcode_hash text NOT NULL,
  routing_mode text NOT NULL DEFAULT 'automatic',
  use_all_drives boolean NOT NULL DEFAULT true,
  warn_low_storage boolean NOT NULL DEFAULT true,
  low_storage_threshold integer NOT NULL DEFAULT 10,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Insert default settings with passcode hash (SHA-256 of "110106")
-- Using pgcrypto's digest function
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO app_settings (id, passcode_hash)
VALUES (1, encode(digest('110106', 'sha256'), 'hex'))
ON CONFLICT (id) DO NOTHING;

-- Grant no direct access to any table — all through edge functions
REVOKE ALL ON file_mappings FROM anon, authenticated, PUBLIC;
REVOKE ALL ON upload_sessions FROM anon, authenticated, PUBLIC;
REVOKE ALL ON app_settings FROM anon, authenticated, PUBLIC;

-- Grant usage on sequences (needed for inserts via service role)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- Updated_at triggers
CREATE OR REPLACE FUNCTION update_file_mappings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS file_mappings_updated_at ON file_mappings;
CREATE TRIGGER file_mappings_updated_at
  BEFORE UPDATE ON file_mappings
  FOR EACH ROW
  EXECUTE FUNCTION update_file_mappings_updated_at();

CREATE OR REPLACE FUNCTION update_upload_sessions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS upload_sessions_updated_at ON upload_sessions;
CREATE TRIGGER upload_sessions_updated_at
  BEFORE UPDATE ON upload_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_upload_sessions_updated_at();

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_file_mappings_node ON file_mappings(storage_node_id);
CREATE INDEX IF NOT EXISTS idx_file_mappings_parent ON file_mappings(parent_google_id);
CREATE INDEX IF NOT EXISTS idx_file_mappings_trashed ON file_mappings(trashed) WHERE trashed = true;
CREATE INDEX IF NOT EXISTS idx_upload_sessions_node ON upload_sessions(storage_node_id);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_status ON upload_sessions(status);
