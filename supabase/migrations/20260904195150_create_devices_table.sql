-- Phase 8: Device/session management table
-- Tracks browser sessions for "My Device" feature
-- No secrets stored — only device metadata

CREATE TABLE IF NOT EXISTS devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  device_name text,
  browser text,
  os text,
  user_agent text,
  status text NOT NULL DEFAULT 'active',
  last_active timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE devices ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON devices FROM anon, authenticated, PUBLIC;

CREATE INDEX IF NOT EXISTS idx_devices_device_id ON devices(device_id);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
