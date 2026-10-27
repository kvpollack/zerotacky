-- 028_drop_publish_key_shim.sql (10/27): drop the zt_publish_meet(p_key, ...) shim that 024 kept for phones still on
-- the pre-10/26 build. No client code sends p_key any more (lib/sync and hooks/useMeetSync.js call the 5-argument
-- form); once every phone has reloaded past the 10/26 build, a stale phone that still posts p_key gets PostgREST's
-- "function not found" error and reloads, instead of silently publishing through the shim.
--
-- Verify (staging, then prod with Kurt's go):
--   select proname, pg_get_function_identity_arguments(oid) from pg_proc where proname = 'zt_publish_meet';
--   -- one row: p_meet jsonb, p_divisions jsonb, p_events jsonb, p_athletes jsonb, p_results jsonb

drop function if exists zt_publish_meet(text, jsonb, jsonb, jsonb, jsonb, jsonb);
