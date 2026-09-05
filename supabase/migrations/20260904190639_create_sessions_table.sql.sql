CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  revoked boolean NOT NULL DEFAULT false
);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON sessions FROM anon, authenticated, PUBLIC;

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at) WHERE revoked = false;
