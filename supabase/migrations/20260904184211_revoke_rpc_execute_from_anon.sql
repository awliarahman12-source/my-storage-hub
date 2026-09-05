/*
# Revoke direct RPC access from anon/authenticated

## Purpose
The frontend communicates with storage nodes exclusively through the
`google-drive-auth` edge function, which uses the service role key.
The SECURITY DEFINER functions (get_storage_nodes, delete_storage_node)
should not be callable directly via the PostgREST RPC endpoint by anon
or authenticated roles.

## Changes
- Revoke EXECUTE on get_storage_nodes() and delete_storage_node(uuid) from anon and authenticated
- The service role (used by the edge function) retains EXECUTE privilege
*/

REVOKE EXECUTE ON FUNCTION get_storage_nodes() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION delete_storage_node(uuid) FROM anon, authenticated;
