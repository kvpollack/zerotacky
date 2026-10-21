-- 021 (10/21, Kurt): registering for a show needs a ZeroTacky account. The entry belongs to the athlete (user_id is
-- what My Meets, the athlete page and show history hang off), and it is how the user base grows. The 009 body is kept
-- as-is under a private name; the public name becomes a thin wrapper that refuses a null auth.uid() and anon loses
-- execute. Both run as security definer, so the body keeps working when called from the wrapper. Same file for
-- staging and prod. Reverse: rename back and re-grant anon.
alter function zt_submit_registration(text, jsonb) rename to zt_submit_registration_body;
revoke execute on function zt_submit_registration_body(text, jsonb) from public, anon, authenticated;

create or replace function zt_submit_registration(p_slug text, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to your ZeroTacky account to register for this show.' using errcode = 'P0001';
  end if;
  return zt_submit_registration_body(p_slug, p_input);
end;
$$;
revoke execute on function zt_submit_registration(text, jsonb) from public, anon;
grant execute on function zt_submit_registration(text, jsonb) to authenticated, service_role;
