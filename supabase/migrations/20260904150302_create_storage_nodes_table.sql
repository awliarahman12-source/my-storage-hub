/*
# Create storage_nodes table for Google Drive OAuth connections

## Purpose
Stores Google Drive storage nodes connected via OAuth 2.0. Each row represents
one Google account that has been connected to the storage pool. OAuth tokens
(access + refresh) are stored server-side only — never exposed to the frontend.

## New Tables
- `storage_nodes`
  - `id` (uuid, primary key) — unique node identifier
  - `provider` (text, default 'google_drive') — storage provider name
  - `provider_account_id` (text, not null) — Google account ID from OAuth
  - `email` (text, not null) — Google account email
  - `display_name` (text) — Google account display name
  - `avatar` (text) — profile picture URL
  - `status` (text, default 'connected') — connected | offline | error
  - `cap` (numeric, default 15) — capacity in GB (placeholder until Drive quota API)
  - `used` (numeric, default 0) — used storage in GB
  - `priority` (integer, default 1) — routing priority order
  - `connected_at` (timestamptz, default now()) — when OAuth completed
  - `last_checked_at` (timestamptz, default now()) — last connection check
  - `access_token` (text) — encrypted Google OAuth access token (server-side only)
  - `refresh_token` (text) — Google OAuth refresh token (server-side only)
  - `token_expires_at` (timestamptz) — when access token expires
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

## Constraints
- UNIQUE(provider, provider_account_id) — prevent duplicate storage nodes for same Google account

## Security
- RLS enabled on `storage_nodes`
- This is a single-tenant app (passcode-based, no Supabase auth sign-in screen)
- Policies use `TO anon, authenticated` so the anon-key frontend can read/write
- Token columns (access_token, refresh_token) are excluded from frontend access
  via a restricted view `storage_nodes_public` that only exposes safe columns

## Notes
1. The frontend reads from `storage_nodes_public` view, NOT the base table.
2. The base table is only accessible via edge functions using the service role key.
3. Token columns are never returned to the frontend.
*/

CREATE TABLE IF NOT EXISTS storage_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'google_drive',
  provider_account_id text NOT NULL,
  email text NOT NULL,
  display_name text,
  avatar text,
  status text NOT NULL DEFAULT 'connected',
  cap numeric NOT NULL DEFAULT 15,
  used numeric NOT NULL DEFAULT 0,
  priority integer NOT NULL DEFAULT 1,
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_account_id)
);

ALTER TABLE storage_nodes ENABLE ROW LEVEL SECURITY;

-- The base table is locked down: no direct anon/authenticated access.
-- All access is through the public view below (which has its own policies)
-- and through edge functions using the service role key.
-- We intentionally create NO policies on the base table so RLS denies all
-- direct access. The view `storage_nodes_public` is what the frontend uses.

-- Create a public view that excludes sensitive token columns
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
  connected_at,
  last_checked_at
FROM storage_nodes;

-- Enable RLS on the view (views inherit RLS from base table, but we add
-- policies so the anon key can read the public view)
-- Note: views in Supabase/PostgREST respect the underlying table's RLS.
-- Since the base table has no policies, we need a SECURITY DEFINER function
-- to allow the frontend to read node data safely.

-- Create a SECURITY DEFINER function to list storage nodes (safe columns only)
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
    sn.priority, sn.connected_at, sn.last_checked_at
  FROM storage_nodes sn
  ORDER BY sn.priority ASC, sn.connected_at ASC;
END;
$$;

-- Create a SECURITY DEFINER function to delete a storage node by id
CREATE OR REPLACE FUNCTION delete_storage_node(node_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM storage_nodes WHERE id = node_id;
END;
$$;

-- Grant execute on these functions to anon and authenticated
GRANT EXECUTE ON FUNCTION get_storage_nodes() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_storage_node(uuid) TO anon, authenticated;

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_storage_nodes_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS storage_nodes_updated_at ON storage_nodes;
CREATE TRIGGER storage_nodes_updated_at
  BEFORE UPDATE ON storage_nodes
  FOR EACH ROW
  EXECUTE FUNCTION update_storage_nodes_updated_at();
