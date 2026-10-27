-- 027_claim_email.sql (10/27, Kurt's post-meet item 5): the claim-approved email.
--
-- The app's /api/claim-approved route (server, Resend) asks the database what to send and to whom, so the recipient
-- is never a value the browser chose. Both RPCs are admin-only (zt_require_admin from 017). `notified_at` records a
-- successful send so a second click does not mail twice; the route can pass force=true to resend on purpose.

alter table gym_claims add column if not exists notified_at timestamptz;

create or replace function zt_claim_email_payload(p_claim uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c gym_claims%rowtype; g gyms%rowtype; v_email text; v_display text;
begin
  perform zt_require_admin();
  select * into c from gym_claims where id = p_claim;
  if not found then raise exception 'unknown claim'; end if;
  select * into g from gyms where id = c.gym_id;
  -- recipient: the account's confirmed sign-in email; the address typed into the form only when there is no account
  if c.user_id is not null then
    select case when u.email_confirmed_at is not null then u.email end, p.display_name
      into v_email, v_display
      from auth.users u left join profiles p on p.id = u.id
      where u.id = c.user_id;
  end if;
  return jsonb_build_object(
    'claim_id', c.id,
    'kind', c.kind,
    'status', c.status,
    'to_email', coalesce(nullif(trim(v_email), ''), nullif(trim(c.email), '')),
    'to_name', coalesce(nullif(trim(c.name), ''), nullif(trim(v_display), ''), ''),
    'gym_id', g.id,
    'gym_name', g.name,
    'gym_slug', g.slug,
    'gym_status', g.status,
    'notified_at', c.notified_at
  );
end $$;
revoke all on function zt_claim_email_payload(uuid) from public, anon;
grant execute on function zt_claim_email_payload(uuid) to authenticated, service_role;

create or replace function zt_mark_claim_notified(p_claim uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform zt_require_admin();
  update gym_claims set notified_at = now() where id = p_claim;
end $$;
revoke all on function zt_mark_claim_notified(uuid) from public, anon;
grant execute on function zt_mark_claim_notified(uuid) to authenticated, service_role;
