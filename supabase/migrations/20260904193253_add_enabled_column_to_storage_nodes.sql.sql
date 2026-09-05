-- Add enabled column to storage_nodes
ALTER TABLE storage_nodes ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;

-- Update the public view to include the enabled column
CREATE OR REPLACE VIEW storage_nodes_public AS
SELECT
  id,
  provider,
  provider_account_id,
  email,
  display_name,
  avatar,
  status,
  cap,
  used,
  priority,
  enabled,
  connected_at,
  last_checked_at
FROM storage_nodes;

-- Drop and recreate the SECURITY DEFINER function with enabled column
DROP FUNCTION IF EXISTS get_storage_nodes();

CREATE OR REPLACE FUNCTION get_storage_nodes()
RETURNS TABLE (
  id uuid,
  provider text,
  provider_account_id text,
  email text,
  display_name text,
  avatar text,
  status text,
  cap numeric,
  used numeric,
  priority integer,
  enabled boolean,
  connected_at timestamptz,
  last_checked_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT
    sn.id, sn.provider, sn.provider_account_id, sn.email,
    sn.display_name, sn.avatar, sn.status, sn.cap, sn.used,
    sn.priority, sn.enabled, sn.connected_at, sn.last_checked_at
  FROM storage_nodes sn
  ORDER BY sn.priority ASC, sn.connected_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_storage_nodes() TO anon, authenticated;
