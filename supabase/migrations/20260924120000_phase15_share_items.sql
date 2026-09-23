-- ============================================================
-- Phase 15: Multi-node share items
-- Satu share link bisa berisi banyak file dari banyak node
-- ============================================================

-- Tabel items yang di-share (bisa dari node berbeda)
CREATE TABLE IF NOT EXISTS share_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_link_id uuid NOT NULL REFERENCES share_links(id) ON DELETE CASCADE,
  node_id uuid NOT NULL REFERENCES storage_nodes(id) ON DELETE CASCADE,
  file_id text NOT NULL,           -- Google Drive file ID
  file_name text NOT NULL,
  mime_type text,
  size bigint DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(share_link_id, node_id, file_id)
);

ALTER TABLE share_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON share_items FROM anon, authenticated, PUBLIC;

CREATE INDEX IF NOT EXISTS idx_share_items_link ON share_items(share_link_id);
CREATE INDEX IF NOT EXISTS idx_share_items_node ON share_items(node_id);

-- Update share_links: kind boleh 'items' sekarang
ALTER TABLE share_links DROP CONSTRAINT IF EXISTS share_links_kind_check;
ALTER TABLE share_links ADD CONSTRAINT share_links_kind_check
  CHECK (kind IN ('folder', 'file', 'items'));