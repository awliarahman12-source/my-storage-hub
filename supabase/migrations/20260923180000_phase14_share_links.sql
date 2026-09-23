-- ============================================================
-- Phase 14: Share Links (folder + file, dengan 3 role)
-- ============================================================

-- ============ Share Links Table ============

CREATE TABLE IF NOT EXISTS share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  name text NOT NULL DEFAULT 'Shared',
  kind text NOT NULL CHECK (kind IN ('folder', 'file')) DEFAULT 'folder',
  node_id uuid NOT NULL REFERENCES storage_nodes(id) ON DELETE CASCADE,
  folder_id text,            -- Google Drive folder ID (untuk kind=folder)
  file_id text,              -- Google Drive file ID (untuk kind=file)
  role text NOT NULL CHECK (role IN ('viewer', 'commenter', 'editor')) DEFAULT 'viewer',
  password_hash text,
  expires_at timestamptz,
  max_downloads integer,
  download_count integer NOT NULL DEFAULT 0,
  view_count integer NOT NULL DEFAULT 0,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE share_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON share_links FROM anon, authenticated, PUBLIC;

CREATE INDEX IF NOT EXISTS idx_share_links_token ON share_links(token) WHERE revoked = false;
CREATE INDEX IF NOT EXISTS idx_share_links_node ON share_links(node_id);

-- ============ Share Views Tracking ============

CREATE TABLE IF NOT EXISTS share_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_link_id uuid NOT NULL REFERENCES share_links(id) ON DELETE CASCADE,
  ip_address text,
  user_agent text,
  path text,
  viewed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE share_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON share_views FROM anon, authenticated, PUBLIC;

CREATE INDEX IF NOT EXISTS idx_share_views_link ON share_views(share_link_id, viewed_at DESC);

-- ============ Share Comments ============

CREATE TABLE IF NOT EXISTS share_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_link_id uuid NOT NULL REFERENCES share_links(id) ON DELETE CASCADE,
  file_id text NOT NULL,
  author_name text NOT NULL DEFAULT 'Anonymous',
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE share_comments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON share_comments FROM anon, authenticated, PUBLIC;

CREATE INDEX IF NOT EXISTS idx_share_comments_file ON share_comments(share_link_id, file_id, created_at DESC);

-- ============ Updated_at Trigger ============

CREATE OR REPLACE FUNCTION update_share_links_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS share_links_updated_at ON share_links;
CREATE TRIGGER share_links_updated_at
  BEFORE UPDATE ON share_links
  FOR EACH ROW
  EXECUTE FUNCTION update_share_links_updated_at();