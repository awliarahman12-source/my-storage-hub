/*
# Revoke RPC execute from PUBLIC role

PostgreSQL functions are executable by PUBLIC by default.
Revoke EXECUTE from PUBLIC so only the service role can call these functions.
*/

REVOKE EXECUTE ON FUNCTION get_storage_nodes() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION delete_storage_node(uuid) FROM PUBLIC;
