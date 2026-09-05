CREATE TABLE IF NOT EXISTS activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  filename text,
  storage_node_id uuid REFERENCES storage_nodes(id) ON DELETE SET NULL,
  storage_node_name text,
  status text NOT NULL DEFAULT 'info',
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON activity_logs FROM anon, authenticated, PUBLIC;

CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_type ON activity_logs(event_type);
