-- 018 (10/21, function-grant sweep after the 016 finding): Supabase's default privileges hand EXECUTE to anon and
-- authenticated on every new function. The signed-in dashboard RPCs below all refuse a null auth.uid() internally, so
-- this is defence in depth, not a fix for a hole: anon simply should not be able to reach them. Everything else keeps
-- its grants on purpose: check-constraint helpers (zt_check_venue, zt_known_equipment, zt_profile_*_ok), RLS helpers
-- (zt_is_member, zt_is_owner_or_member, zt_has_grant, zt_has_join, zt_grant_token, zt_join_code, zt_client_ip) and the
-- trigger functions run as the calling role and break without EXECUTE; the phone/anon RPCs (zt_check_admin_pin,
-- zt_meet_by_join_code, zt_public_meet_by_slug, zt_publish_meet, zt_submit_registration, zt_file_gym_claim,
-- zt_revoke_grant) are anon by design. Same file for staging and prod.
-- The default grant is to PUBLIC (which anon inherits), so revoking from anon alone changes nothing: revoke from
-- public and anon, then grant authenticated and service_role back explicitly.
revoke execute on function zt_create_meet(text, date, text) from public, anon;
grant execute on function zt_create_meet(text, date, text) to authenticated, service_role;
revoke execute on function zt_get_my_meet(uuid) from public, anon;
grant execute on function zt_get_my_meet(uuid) to authenticated, service_role;
revoke execute on function zt_list_meet_registrations(uuid) from public, anon;
grant execute on function zt_list_meet_registrations(uuid) to authenticated, service_role;
revoke execute on function zt_my_meets() from public, anon;
grant execute on function zt_my_meets() to authenticated, service_role;
revoke execute on function zt_rotate_join_code(uuid) from public, anon;
grant execute on function zt_rotate_join_code(uuid) to authenticated, service_role;
revoke execute on function zt_save_meet_config(uuid, jsonb, jsonb, jsonb, jsonb, timestamptz) from public, anon;
grant execute on function zt_save_meet_config(uuid, jsonb, jsonb, jsonb, jsonb, timestamptz) to authenticated, service_role;
revoke execute on function zt_set_registration_status(uuid, text) from public, anon;
grant execute on function zt_set_registration_status(uuid, text) to authenticated, service_role;
revoke execute on function zt_transfer_ownership(uuid, uuid) from public, anon;
grant execute on function zt_transfer_ownership(uuid, uuid) to authenticated, service_role;
revoke execute on function zt_update_listing(uuid, jsonb, timestamptz) from public, anon;
grant execute on function zt_update_listing(uuid, jsonb, timestamptz) to authenticated, service_role;
