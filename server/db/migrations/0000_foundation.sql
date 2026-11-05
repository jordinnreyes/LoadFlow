-- Schema is owned by the dedicated migration principal, never the runtime.
CREATE SCHEMA IF NOT EXISTS app;
REVOKE ALL ON SCHEMA app FROM public, anon, authenticated;
GRANT USAGE ON SCHEMA app TO cw_runtime, cw_identity;
