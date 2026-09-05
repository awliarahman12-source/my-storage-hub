-- Add rate limiting columns to sessions table
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS device_id text;

-- Create login_attempts table for rate limiting
CREATE TABLE IF NOT EXISTS login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  success boolean NOT NULL DEFAULT false
);

ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON login_attempts FROM anon, authenticated, PUBLIC;

-- Index for quick rate limit queries
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time ON login_attempts(ip_address, attempted_at DESC);

-- Auto-cleanup old login attempts (keep 1 hour)
CREATE INDEX IF NOT EXISTS idx_login_attempts_old ON login_attempts(attempted_at) WHERE success = false;
