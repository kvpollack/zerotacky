-- 033_mail_reservations.sql (10/29, Astra EM-02 / EM-03 / EM-04): the mail bookkeeping moves out of the browser's reach.
--
-- 031 let any signed-in registrant call zt_registration_email_payload (which returned the promoter's account email)
-- and zt_mark_registration_notified (which stamped email_log with no proof a mail went out), and the route checked the
-- log in application code, so two requests could both read an empty log and both send. From here on:
--
--   * zt_server_config holds the sha256 of a key only the Next.js server knows (ZT_MAIL_KEY). No role but the table
--     owner can read it; security definer functions compare against it. A browser bearer without the key gets nothing.
--   * zt_registration_email_payload(p_reg, p_key) needs the key, so recipient addresses never reach a browser.
--   * zt_reserve_registration_email(p_reg, p_kind, p_force, p_key) is the atomic claim: it locks the registration row,
--     applies the rules (registrant may ask for received + notice once, or the accepted mail on an auto-accepted entry,
--     never force; promoter may force, at most 5
--     attempts per kind per registration, 10 minutes between forced sends) and writes an attempt marker before the
--     route talks to Resend. A second request inside two minutes sees the marker and skips (in_flight).
--   * zt_confirm_registration_email(p_reg, p_kind, p_ok, p_key) turns the marker into a sent stamp or clears it.
--   * zt_mark_registration_notified is dropped.
--
-- email_log[kind] becomes {"sent": iso | null, "count": n, "attempt": iso | null}. Older string values (031 stamps)
-- read as one completed send.
--
-- Operator step per database: insert the key hash, e.g.
--   insert into zt_server_config(key, value) values ('mail_key_sha256', encode(sha256(convert_to('<ZT_MAIL_KEY>', 'UTF8')), 'hex'))
--   on conflict (key) do update set value = excluded.value, updated_at = now();
-- and set ZT_MAIL_KEY on the matching Vercel environment (Preview -> staging, Production -> prod).

create table if not exists zt_server_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
revoke all on zt_server_config from public, anon, authenticated;
alter table zt_server_config enable row level security;   -- no policies on purpose: owner and service_role only

create or replace function zt_mail_key_ok(p_key text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v text;
begin
  if p_key is null or length(p_key) < 32 then return false; end if;
  select value into v from zt_server_config where key = 'mail_key_sha256';
  if v is null then return false; end if;
  return v = encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
end $$;
revoke all on function zt_mail_key_ok(text) from public, anon, authenticated;

drop function if exists zt_registration_email_payload(uuid);
drop function if exists zt_mark_registration_notified(uuid, text);

create or replace function zt_registration_email_payload(p_reg uuid, p_key text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r registrations%rowtype; m meets%rowtype; v_uid uuid; v_role text;
  v_ath_email text; v_ath_display text; v_prom_email text; v_prom_display text; v_div text;
begin
  if not zt_mail_key_ok(p_key) then
    raise exception 'Server key required.' using errcode = 'P0001';
  end if;
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

  if r.user_id is not null then
    select case when u.email_confirmed_at is not null then u.email end, p.display_name
      into v_ath_email, v_ath_display
      from auth.users u left join profiles p on p.id = u.id where u.id = r.user_id;
  end if;
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
revoke all on function zt_registration_email_payload(uuid, text) from public, anon;
grant execute on function zt_registration_email_payload(uuid, text) to authenticated, service_role;

-- Returns {"decision": "go"} or {"decision": "skip", "reason": "already_notified" | "in_flight" | "limit" | "wait"}.
create or replace function zt_reserve_registration_email(p_reg uuid, p_kind text, p_force boolean, p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r registrations%rowtype; v_uid uuid; v_role text; e jsonb; v_sent timestamptz; v_attempt timestamptz; v_count int;
  v_now timestamptz := now();
begin
  if not zt_mail_key_ok(p_key) then raise exception 'Server key required.' using errcode = 'P0001'; end if;
  v_uid := auth.uid();
  if v_uid is null then raise exception 'Sign in required.' using errcode = 'P0001'; end if;
  if p_kind is null or p_kind not in ('received', 'notice', 'decision_accepted', 'decision_declined') then
    raise exception 'bad kind' using errcode = 'P0001';
  end if;

  select * into r from registrations where id = p_reg for update;
  if not found then raise exception 'unknown registration' using errcode = 'P0001'; end if;
  if zt_is_owner_or_member(r.meet_id) then v_role := 'promoter';
  elsif r.user_id = v_uid then v_role := 'athlete';
  else raise exception 'You do not have access to this registration.' using errcode = 'P0001';
  end if;
  -- a registrant may ask once for their own confirmation and the promoter's notice; on an auto-accepted entry (032)
  -- the confirmation is the accepted mail. Never a forced resend, never a declined mail.
  if v_role = 'athlete' and (coalesce(p_force, false)
       or p_kind not in ('received', 'notice', 'decision_accepted')
       or (p_kind = 'decision_accepted' and r.status <> 'accepted')) then
    raise exception 'Not allowed.' using errcode = 'P0001';
  end if;

  e := coalesce(r.email_log, '{}'::jsonb) -> p_kind;
  if e is null or jsonb_typeof(e) = 'null' then
    v_sent := null; v_attempt := null; v_count := 0;
  elsif jsonb_typeof(e) = 'string' then                        -- 031 stamp: one completed send
    v_sent := (e #>> '{}')::timestamptz; v_attempt := null; v_count := 1;
  else
    v_sent := (e ->> 'sent')::timestamptz; v_attempt := (e ->> 'attempt')::timestamptz; v_count := coalesce((e ->> 'count')::int, 0);
  end if;

  if v_attempt is not null and v_attempt > v_now - interval '2 minutes' then
    return jsonb_build_object('decision', 'skip', 'reason', 'in_flight');
  end if;
  if v_sent is not null and not coalesce(p_force, false) then
    return jsonb_build_object('decision', 'skip', 'reason', 'already_notified');
  end if;
  if v_count >= 5 then
    return jsonb_build_object('decision', 'skip', 'reason', 'limit');
  end if;
  if v_sent is not null and v_sent > v_now - interval '10 minutes' then
    return jsonb_build_object('decision', 'skip', 'reason', 'wait');
  end if;

  update registrations
     set email_log = coalesce(email_log, '{}'::jsonb) || jsonb_build_object(p_kind, jsonb_build_object(
           'sent', case when v_sent is null then null else to_char(v_sent at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end,
           'count', v_count + 1,
           'attempt', to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))
   where id = p_reg;
  return jsonb_build_object('decision', 'go');
end $$;
revoke all on function zt_reserve_registration_email(uuid, text, boolean, text) from public, anon;
grant execute on function zt_reserve_registration_email(uuid, text, boolean, text) to authenticated, service_role;

create or replace function zt_confirm_registration_email(p_reg uuid, p_kind text, p_ok boolean, p_key text) returns void
language plpgsql security definer set search_path = public as $$
declare e jsonb; v_count int; v_sent text;
begin
  if not zt_mail_key_ok(p_key) then raise exception 'Server key required.' using errcode = 'P0001'; end if;
  if auth.uid() is null then raise exception 'Sign in required.' using errcode = 'P0001'; end if;
  if p_kind is null or p_kind not in ('received', 'notice', 'decision_accepted', 'decision_declined') then
    raise exception 'bad kind' using errcode = 'P0001';
  end if;
  select coalesce(email_log, '{}'::jsonb) -> p_kind into e from registrations where id = p_reg for update;
  if not found then raise exception 'unknown registration' using errcode = 'P0001'; end if;
  if e is null or jsonb_typeof(e) <> 'object' then return; end if;   -- nothing reserved
  v_count := coalesce((e ->> 'count')::int, 0);
  v_sent := case when coalesce(p_ok, false) then to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') else e ->> 'sent' end;
  update registrations
     set email_log = email_log || jsonb_build_object(p_kind, jsonb_build_object('sent', v_sent, 'count', v_count, 'attempt', null))
   where id = p_reg;
end $$;
revoke all on function zt_confirm_registration_email(uuid, text, boolean, text) from public, anon;
grant execute on function zt_confirm_registration_email(uuid, text, boolean, text) to authenticated, service_role;
