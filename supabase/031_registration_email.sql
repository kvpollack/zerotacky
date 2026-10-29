-- 031_registration_email.sql (10/28, registration emails, ROADMAP medium item): three mails ride on two moments.
--   received  (athlete)   after zt_submit_registration: pending or waitlisted wording
--   notice    (promoter)  same moment: who registered for what
--   decision  (athlete)   after zt_set_registration_status to accepted or declined
--
-- Same shape as 027: the app's /api/registration-email route (server, Resend) asks the database what to send and to
-- whom with the caller's own token, so recipients are never values the browser chose and the route holds no service
-- key. zt_registration_email_payload answers for the registrant (their own row) and for the meet's owner/members;
-- anyone else gets an exception. `email_log` records each successful send by kind so a retry does not mail twice.

alter table registrations add column if not exists email_log jsonb not null default '{}'::jsonb;

create or replace function zt_registration_email_payload(p_reg uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r registrations%rowtype; m meets%rowtype; v_uid uuid; v_role text;
  v_ath_email text; v_ath_display text; v_prom_email text; v_prom_display text; v_div text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Sign in required.' using errcode = 'P0001';
  end if;
  select * into r from registrations where id = p_reg;
  if not found then raise exception 'unknown registration' using errcode = 'P0001'; end if;
  select * into m from meets where id = r.meet_id;
  if not found then raise exception 'meet no longer exists' using errcode = 'P0001'; end if;

  if zt_is_owner_or_member(m.id) then v_role := 'promoter';
  elsif r.user_id = v_uid then v_role := 'athlete';
  else raise exception 'You do not have access to this registration.' using errcode = 'P0001';
  end if;

  -- athlete recipient: the account's confirmed sign-in email, else the address typed into the form
  if r.user_id is not null then
    select case when u.email_confirmed_at is not null then u.email end, p.display_name
      into v_ath_email, v_ath_display
      from auth.users u left join profiles p on p.id = u.id where u.id = r.user_id;
  end if;
  -- promoter recipient: the meet owner's confirmed sign-in email (members get nothing; one notice per registration)
  if m.owner_id is not null then
    select case when u.email_confirmed_at is not null then u.email end, p.display_name
      into v_prom_email, v_prom_display
      from auth.users u left join profiles p on p.id = u.id where u.id = m.owner_id;
  end if;
  select d.name into v_div from divisions d where d.meet_id = m.id and d.id = r.division_id;

  return jsonb_build_object(
    'registration_id', r.id,
    'caller_role', v_role,
    'status', r.status,
    'waitlisted', r.waitlisted,
    'athlete_name', r.name,
    'athlete_email', coalesce(nullif(trim(v_ath_email), ''), nullif(trim(r.email), '')),
    'division_name', coalesce(v_div, 'a division that has since been removed'),
    'meet_id', m.id,
    'meet_slug', m.slug,
    'meet_name', m.name,
    'meet_date', m.date,
    'is_demo', m.is_demo,
    'venue', m.venue,
    'entry_fee_display', m.entry_fee_display,
    'promoter_contact', m.promoter_contact,
    'promoter_email', nullif(trim(v_prom_email), ''),
    'promoter_name', coalesce(nullif(trim(v_prom_display), ''), ''),
    'email_log', coalesce(r.email_log, '{}'::jsonb)
  );
end $$;
revoke all on function zt_registration_email_payload(uuid) from public, anon;
grant execute on function zt_registration_email_payload(uuid) to authenticated, service_role;

-- p_kind is a short token such as 'received', 'notice', 'decision_accepted', 'decision_declined'.
create or replace function zt_mark_registration_notified(p_reg uuid, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
declare r registrations%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode = 'P0001'; end if;
  if p_kind is null or p_kind !~ '^[a-z_]{1,40}$' then raise exception 'bad kind' using errcode = 'P0001'; end if;
  select * into r from registrations where id = p_reg;
  if not found then raise exception 'unknown registration' using errcode = 'P0001'; end if;
  if not (zt_is_owner_or_member(r.meet_id) or r.user_id = auth.uid()) then
    raise exception 'You do not have access to this registration.' using errcode = 'P0001';
  end if;
  update registrations
     set email_log = coalesce(email_log, '{}'::jsonb) || jsonb_build_object(p_kind, to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
   where id = p_reg;
end $$;
revoke all on function zt_mark_registration_notified(uuid, text) from public, anon;
grant execute on function zt_mark_registration_notified(uuid, text) to authenticated, service_role;
