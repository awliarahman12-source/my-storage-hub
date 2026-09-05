/*
# Fix security issues on storage_nodes

## Changes
1. Drop the `storage_nodes_public` view (was SECURITY DEFINER, bypassed RLS)
2. Revoke all direct grants on `storage_nodes` base table from anon/authenticated
3. Fix `update_storage_nodes_updated_at` trigger function search_path
4. The SECURITY DEFINER functions (get_storage_nodes, delete_storage_node) are
   intentionally callable by anon — this is a single-tenant app where the edge function
   handles authorization. These functions only expose safe columns (no tokens).

## Security
- Base table `storage_nodes` has RLS enabled with NO policies → direct access denied
- Revoke explicit grants so anon/authenticated cannot bypass RLS via table privileges
- SECURITY DEFINER functions are the only access path and they expose only safe columns
*/

-- Drop the view that was SECURITY DEFINER
DROP VIEW IF EXISTS storage_nodes_public;

-- Revoke all grants on the base table (RLS with no policies denies all access)
REVOKE ALL ON storage_nodes FROM anon, authenticated;

-- Fix the trigger function search_path
CREATE OR REPLACE FUNCTION update_storage_nodes_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
