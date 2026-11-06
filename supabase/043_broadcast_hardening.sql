-- 043 (11/6): hardening of 042 after the Astra audit of feature gaps #10 (BC-01..BC-11). 042 stays as applied; this
-- replaces its functions and widens two tables.
--
-- BC-01  payload/mark took a null uid as "the cron". Now a null uid is only accepted with p_server = true, which the cron
--        route passes and the promoter route never does; a signed-in caller must be the owner or a member for every call.
-- BC-02  the claim is in chunks (p_limit) ordered by id, so a retried batch has the same members and the same
--        idempotency key on the provider side; provider ids are kept per recipient. Outcome recording failures leave the
--        rows queued and visible as unresolved.
-- BC-03  claim rechecks opt-out and registration status; an opt-out skips everything still queued for that address.
-- BC-04  opt-out is show-wide by effective address (zt_mail_suppressed); create/queue/claim all consult it.
-- BC-05  quotas count under an advisory lock (meet scope for real sends, promoter scope for tests).
-- BC-06  a reminder's meet is rechecked at claim (reminders on, listed, not demo, live status, date not past); when it
--        fails, the queued rows are skipped and the broadcast closed. The cron's "still queued" lookup applies the same.
-- BC-07  transient provider failures keep the row queued with the error noted (p_retry); five attempts, then failed.
-- BC-11  zt_list_broadcasts returns skipped/queued counts; the opted-out number is reported, never subtracted.
-- Also: ON CONFLICT on the reminder insert; control characters refused in subjects.

alter table meet_broadcast_recipients drop constraint if exists meet_broadcast_recipients_status_check;
alter table meet_broadcast_recipients add constraint meet_broadcast_recipients_status_check
  check (status in ('queued', 'sent', 'failed', 'skipped'));
alter table meet_broadcast_recipients add column if not exists attempts int not null default 0;
alter table meet_broadcast_recipients add column if not exists provider_id text null;
alter table meet_broadcasts add column if not exists skipped_count int not null default 0;

-- ---------------------------------------------------------------------------------------------------------------
-- Show-wide suppression (BC-04): true when any registration for the meet that opted out has this effective address.
create or replace function zt_mail_suppressed(p_meet uuid, p_email text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from registrations o
     where o.meet_id = p_meet and o.mail_opt_out
       and (lower(nullif(trim(o.email), '')) = lower(p_email)
            or lower((select u.email from auth.users u where u.id = o.user_id)) = lower(p_email))
  );
$$;
revoke all on function zt_mail_suppressed(uuid, text) from public, anon, authenticated;

-- Effective address of a registration: the confirmed account email, else the one typed at registration.
create or replace function zt_reg_mail_address(p_reg registrations) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select u.email from auth.users u where u.id = p_reg.user_id and u.email_confirmed_at is not null), nullif(trim(p_reg.email), ''));
$$;
revoke all on function zt_reg_mail_address(registrations) from public, anon, authenticated;

-- Reminder eligibility of a meet, shared by queue and claim (BC-06). p_today = today in New York.
create or replace function zt_reminder_meet_ok(m meets, p_today date) returns boolean
language sql immutable as $$
  select m.reminders_enabled and m.is_public_listed and not m.is_demo
     and m.competition_status not in ('cancelled', 'postponed', 'completed')
     and m.date is not null and m.date >= p_today;
$$;

-- ---------------------------------------------------------------------------------------------------------------
create or replace function zt_create_broadcast(p_meet uuid, p_subject text, p_body text, p_audience text, p_test boolean, p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m meets%rowtype; v_uid uuid; v_id uuid; v_count int; v_recent int; v_me text; v_subject text; v_body text;
begin
  if not zt_mail_key_ok(p_key) then raise exception 'Server key required.' using errcode = 'P0001'; end if;
  v_uid := auth.uid();
  if v_uid is null then raise exception 'Sign in required.' using errcode = 'P0001'; end if;
  select * into m from meets where id = p_meet;
  if not found then raise exception 'unknown meet' using errcode = 'P0001'; end if;
  if not zt_is_owner_or_member(m.id) then raise exception 'You do not have access to this meet.' using errcode = 'P0001'; end if;
  if m.is_demo then raise exception 'Demo meets do not send email.' using errcode = 'P0001'; end if;
  if p_audience is null or p_audience not in ('accepted', 'all_active') then raise exception 'bad audience' using errcode = 'P0001'; end if;
  v_subject := nullif(trim(coalesce(p_subject, '')), '');
  v_body := nullif(trim(coalesce(p_body, '')), '');
  if v_subject is null then raise exception 'Give the message a subject.' using errcode = 'P0001'; end if;
  if v_subject ~ '[[:cntrl:]]' then raise exception 'The subject cannot contain line breaks or control characters.' using errcode = 'P0001'; end if;
  if v_body is null then raise exception 'Write the message first.' using errcode = 'P0001'; end if;
  if length(v_subject) > 120 then raise exception 'Subject is limited to 120 characters.' using errcode = 'P0001'; end if;
  if length(v_body) > 2000 then raise exception 'Message is limited to 2,000 characters.' using errcode = 'P0001'; end if;

  if coalesce(p_test, false) then
    perform pg_advisory_xact_lock(hashtext('zt_broadcast_test'), hashtext(v_uid::text));   -- BC-05
    select count(*) into v_recent from meet_broadcasts
      where created_by = v_uid and test_only and created_at > now() - interval '24 hours';
    if v_recent >= 10 then raise exception 'You have sent 10 test messages today; try again tomorrow.' using errcode = 'P0001'; end if;
    select case when u.email_confirmed_at is not null then u.email end into v_me from auth.users u where u.id = v_uid;
    if v_me is null then raise exception 'Your account has no confirmed email to send the test to.' using errcode = 'P0001'; end if;
    insert into meet_broadcasts(meet_id, kind, audience, subject, body, test_only, created_by, recipient_count)
      values (m.id, 'broadcast', p_audience, v_subject, v_body, true, v_uid, 1) returning id into v_id;
    insert into meet_broadcast_recipients(broadcast_id, registration_id, email, athlete_name, division_name, mail_token)
      values (v_id, null, v_me, 'Test send', '', null);
    return jsonb_build_object('id', v_id, 'recipients', 1);
  end if;

  perform pg_advisory_xact_lock(hashtext('zt_broadcast_meet'), hashtext(m.id::text));   -- BC-05
  select count(*) into v_recent from meet_broadcasts
    where meet_id = m.id and kind = 'broadcast' and not test_only and created_at > now() - interval '24 hours';
  if v_recent >= 3 then raise exception 'Three broadcasts have gone out for this meet in the last 24 hours; wait before sending another.' using errcode = 'P0001'; end if;

  insert into meet_broadcasts(meet_id, kind, audience, subject, body, test_only, created_by)
    values (m.id, 'broadcast', p_audience, v_subject, v_body, false, v_uid) returning id into v_id;
  insert into meet_broadcast_recipients(broadcast_id, registration_id, email, athlete_name, division_name, mail_token)
    select v_id, r.id, x.email, r.name, coalesce(d.name, ''), r.mail_token
      from registrations r
      left join divisions d on d.id = r.division_id and d.meet_id = r.meet_id
      cross join lateral (select zt_reg_mail_address(r) as email) x
     where r.meet_id = m.id
       and not r.mail_opt_out
       and x.email is not null
       and not zt_mail_suppressed(m.id, x.email)                                   -- BC-04
       and (r.status = 'accepted' or (p_audience = 'all_active' and r.status in ('pending', 'waitlist')))
     order by lower(x.email), r.created_at
     limit 500;
  -- the same address twice (two registrations, one person): keep the first
  delete from meet_broadcast_recipients a using meet_broadcast_recipients b
    where a.broadcast_id = v_id and b.broadcast_id = v_id and lower(a.email) = lower(b.email) and a.id > b.id;
  select count(*) into v_count from meet_broadcast_recipients where broadcast_id = v_id;
  if v_count = 0 then
    delete from meet_broadcasts where id = v_id;
    raise exception 'No one to send to: no athletes in that audience have an email address (or they opted out).' using errcode = 'P0001';
  end if;
  update meet_broadcasts set recipient_count = v_count where id = v_id;
  return jsonb_build_object('id', v_id, 'recipients', v_count);
end $$;
revoke all on function zt_create_broadcast(uuid, text, text, text, boolean, text) from public, anon;
grant execute on function zt_create_broadcast(uuid, text, text, text, boolean, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Who may drive a broadcast (BC-01): the owner/member when signed in; nobody anonymous unless the server says so.
create or replace function zt_broadcast_caller_ok(p_meet uuid, p_server boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    if not coalesce(p_server, false) then raise exception 'Sign in required.' using errcode = 'P0001'; end if;
  elsif not zt_is_owner_or_member(p_meet) then
    raise exception 'You do not have access to this meet.' using errcode = 'P0001';
  end if;
end $$;
revoke all on function zt_broadcast_caller_ok(uuid, boolean) from public, anon, authenticated;

-- Roll up one broadcast's counters; close it when nothing is queued.
create or replace function zt_broadcast_rollup(p_bc uuid) returns void
language sql security definer set search_path = public as $$
  update meet_broadcasts b set
      sent_count = (select count(*) from meet_broadcast_recipients where broadcast_id = b.id and status = 'sent'),
      failed_count = (select count(*) from meet_broadcast_recipients where broadcast_id = b.id and status = 'failed'),
      skipped_count = (select count(*) from meet_broadcast_recipients where broadcast_id = b.id and status = 'skipped'),
      finished_at = case when exists (select 1 from meet_broadcast_recipients where broadcast_id = b.id and status = 'queued')
                         then null else coalesce(b.finished_at, now()) end
    where b.id = p_bc;
$$;
revoke all on function zt_broadcast_rollup(uuid) from public, anon, authenticated;

drop function if exists zt_broadcast_payload(uuid, text);
create or replace function zt_broadcast_payload(p_broadcast uuid, p_key text, p_server boolean default false, p_limit int default 100) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b meet_broadcasts%rowtype; m meets%rowtype; v_prom_email text; v_prom_name text; v_recips jsonb; v_remaining int; v_today date;
begin
  if not zt_mail_key_ok(p_key) then raise exception 'Server key required.' using errcode = 'P0001'; end if;
  select * into b from meet_broadcasts where id = p_broadcast for update;
  if not found then raise exception 'unknown broadcast' using errcode = 'P0001'; end if;
  perform zt_broadcast_caller_ok(b.meet_id, p_server);
  select * into m from meets where id = b.meet_id;
  if not found then raise exception 'meet no longer exists' using errcode = 'P0001'; end if;
  v_today := (now() at time zone 'America/New_York')::date;

  -- BC-06: a reminder whose meet is no longer eligible is closed, not sent
  if b.kind <> 'broadcast' and not zt_reminder_meet_ok(m, v_today) then
    update meet_broadcast_recipients set status = 'skipped', error = 'meet no longer eligible for reminders'
      where broadcast_id = b.id and status = 'queued';
    perform zt_broadcast_rollup(b.id);
    return jsonb_build_object('id', b.id, 'kind', b.kind, 'audience', b.audience, 'subject', b.subject, 'body', b.body, 'test_only', b.test_only,
      'meet_id', m.id, 'meet_name', m.name, 'meet_date', m.date, 'meet_slug', m.slug, 'venue', m.venue,
      'promoter_email', null, 'promoter_name', '', 'promoter_contact', m.promoter_contact, 'recipients', '[]'::jsonb, 'remaining', 0, 'closed', 'ineligible');
  end if;

  -- BC-03/BC-04: rows whose registration opted out, changed status, or whose address is suppressed show-wide are skipped
  update meet_broadcast_recipients rc set status = 'skipped', error = 'no longer eligible'
    from registrations r
   where rc.broadcast_id = b.id and rc.status = 'queued' and rc.registration_id = r.id
     and (r.mail_opt_out
          or not (r.status = 'accepted' or (b.kind = 'broadcast' and b.audience = 'all_active' and r.status in ('pending', 'waitlist')))
          or zt_mail_suppressed(b.meet_id, rc.email));
  update meet_broadcast_recipients rc set status = 'skipped', error = 'registration removed'
   where rc.broadcast_id = b.id and rc.status = 'queued' and rc.registration_id is null and not b.test_only;
  -- BC-07: five attempts, then it is a failure
  update meet_broadcast_recipients set status = 'failed', error = coalesce(error, 'gave up after 5 attempts')
   where broadcast_id = b.id and status = 'queued' and attempts >= 5;

  if m.owner_id is not null then
    select case when u.email_confirmed_at is not null then u.email end, p.display_name
      into v_prom_email, v_prom_name from auth.users u left join profiles p on p.id = u.id where u.id = m.owner_id;
  end if;

  -- BC-02/BC-08: claim one chunk, in id order, so a retry of the same chunk has the same members
  with pick as (
    select id from meet_broadcast_recipients
     where broadcast_id = b.id and status = 'queued'
       and (attempt_at is null or attempt_at < now() - interval '2 minutes')
     order by id limit greatest(1, least(coalesce(p_limit, 100), 100))
     for update skip locked
  ), claimed as (
    update meet_broadcast_recipients rc set attempt_at = now(), attempts = rc.attempts + 1
      from pick where rc.id = pick.id
    returning rc.id, rc.registration_id, rc.email, rc.athlete_name, rc.division_name, rc.mail_token
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'registration_id', c.registration_id, 'email', c.email, 'athlete_name', c.athlete_name,
      'division_name', c.division_name, 'division_id', r.division_id, 'mail_token', c.mail_token) order by c.id), '[]'::jsonb)
    into v_recips from claimed c left join registrations r on r.id = c.registration_id;
  select count(*) into v_remaining from meet_broadcast_recipients
   where broadcast_id = b.id and status = 'queued' and (attempt_at is null or attempt_at < now() - interval '2 minutes');
  perform zt_broadcast_rollup(b.id);

  return jsonb_build_object(
    'id', b.id, 'kind', b.kind, 'audience', b.audience, 'subject', b.subject, 'body', b.body, 'test_only', b.test_only,
    'meet_id', m.id, 'meet_name', m.name, 'meet_date', m.date, 'meet_slug', m.slug, 'venue', m.venue,
    'promoter_email', nullif(trim(v_prom_email), ''), 'promoter_name', coalesce(nullif(trim(v_prom_name), ''), ''),
    'promoter_contact', m.promoter_contact,
    'recipients', v_recips, 'remaining', v_remaining
  );
end $$;
revoke all on function zt_broadcast_payload(uuid, text, boolean, int) from public;
grant execute on function zt_broadcast_payload(uuid, text, boolean, int) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Outcome of one chunk: p_results = [{id, ok, retry, error, provider_id}, ...]. ok -> sent; retry -> stays queued with
-- the error noted (the next claim after two minutes tries again, up to five times); else failed. Same caller rule.
drop function if exists zt_broadcast_mark(uuid, boolean, text, text);
drop function if exists zt_broadcast_mark_many(jsonb, text);
create or replace function zt_broadcast_mark_many(p_results jsonb, p_key text, p_server boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare v_bc uuid;
begin
  if not zt_mail_key_ok(p_key) then raise exception 'Server key required.' using errcode = 'P0001'; end if;
  if auth.uid() is null and not coalesce(p_server, false) then raise exception 'Sign in required.' using errcode = 'P0001'; end if;
  if p_results is null or jsonb_typeof(p_results) <> 'array' then return; end if;
  create temp table if not exists t_zt_marks (id uuid, ok boolean, retry boolean, err text, provider_id text) on commit drop;
  delete from t_zt_marks;
  insert into t_zt_marks
    select (x->>'id')::uuid, coalesce((x->>'ok')::boolean, false), coalesce((x->>'retry')::boolean, false),
           left(coalesce(x->>'error', 'send failed'), 300), left(x->>'provider_id', 100)
      from jsonb_array_elements(p_results) x where (x->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  for v_bc in select distinct rc.broadcast_id from meet_broadcast_recipients rc join t_zt_marks t on t.id = rc.id loop
    perform zt_broadcast_caller_ok((select meet_id from meet_broadcasts where id = v_bc), p_server);
  end loop;
  update meet_broadcast_recipients rc
     set status = case when t.ok then 'sent' when t.retry then 'queued' else 'failed' end,
         sent_at = case when t.ok then now() else null end,
         provider_id = case when t.ok then coalesce(t.provider_id, rc.provider_id) else rc.provider_id end,
         error = case when t.ok then null else t.err end
    from t_zt_marks t where rc.id = t.id and rc.status = 'queued';
  for v_bc in select distinct rc.broadcast_id from meet_broadcast_recipients rc join t_zt_marks t on t.id = rc.id loop
    perform zt_broadcast_rollup(v_bc);
  end loop;
end $$;
revoke all on function zt_broadcast_mark_many(jsonb, text, boolean) from public;
grant execute on function zt_broadcast_mark_many(jsonb, text, boolean) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
create or replace function zt_list_broadcasts(p_meet uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_on boolean; v_list jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode = 'P0001'; end if;
  if not zt_is_owner_or_member(p_meet) then raise exception 'You do not have access to this meet.' using errcode = 'P0001'; end if;
  select reminders_enabled into v_on from meets where id = p_meet;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'kind', s.kind, 'audience', s.audience, 'subject', s.subject, 'test_only', s.test_only,
      'created_at', to_char(s.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'finished_at', case when s.finished_at is null then null else to_char(s.finished_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end,
      'recipient_count', s.recipient_count, 'sent_count', s.sent_count, 'failed_count', s.failed_count, 'skipped_count', s.skipped_count,
      'queued_count', (select count(*) from meet_broadcast_recipients where broadcast_id = s.id and status = 'queued')) order by s.created_at desc), '[]'::jsonb)
    into v_list from (select * from meet_broadcasts where meet_id = p_meet order by created_at desc limit 30) s;
  return jsonb_build_object('reminders_enabled', coalesce(v_on, true), 'broadcasts', v_list,
    'opted_out', (select count(*) from registrations where meet_id = p_meet and mail_opt_out));
end $$;
revoke all on function zt_list_broadcasts(uuid) from public, anon;
grant execute on function zt_list_broadcasts(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
create or replace function zt_queue_due_reminders(p_today date, p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m record; v_id uuid; v_count int; v_ids jsonb := '[]'::jsonb;
begin
  if not zt_mail_key_ok(p_key) then raise exception 'Server key required.' using errcode = 'P0001'; end if;
  for m in
    select mm.*, case when mm.date = p_today + 7 then 'reminder_7d' else 'reminder_1d' end as kind
      from meets mm
     where zt_reminder_meet_ok(mm, p_today) and (mm.date = p_today + 7 or mm.date = p_today + 1)
  loop
    insert into meet_broadcasts(meet_id, kind, audience, subject, body, test_only, created_by)
      values (m.id, m.kind, 'accepted',
              case when m.kind = 'reminder_7d' then m.name || ' is one week away' else m.name || ' is tomorrow' end,
              '', false, null)
      on conflict (meet_id, kind) where kind <> 'broadcast' do nothing
      returning id into v_id;
    if v_id is null then continue; end if;     -- already queued on an earlier pass (or by a concurrent one)
    insert into meet_broadcast_recipients(broadcast_id, registration_id, email, athlete_name, division_name, mail_token)
      select v_id, r.id, x.email, r.name, coalesce(d.name, ''), r.mail_token
        from registrations r
        left join divisions d on d.id = r.division_id and d.meet_id = r.meet_id
        cross join lateral (select zt_reg_mail_address(r) as email) x
       where r.meet_id = m.id and r.status = 'accepted' and not r.mail_opt_out and x.email is not null
         and not zt_mail_suppressed(m.id, x.email)
       order by lower(x.email), r.created_at limit 500;
    delete from meet_broadcast_recipients a using meet_broadcast_recipients b
      where a.broadcast_id = v_id and b.broadcast_id = v_id and lower(a.email) = lower(b.email) and a.id > b.id;
    select count(*) into v_count from meet_broadcast_recipients where broadcast_id = v_id;
    update meet_broadcasts set recipient_count = v_count, finished_at = case when v_count = 0 then now() else null end where id = v_id;
    if v_count > 0 then v_ids := v_ids || to_jsonb(v_id); end if;
    v_id := null;
  end loop;
  -- a reminder still holding queued rows from an earlier pass (BC-07 retry, or a pass that stopped early); the
  -- idempotency key on the provider side expires after 24 h, so the window is one day. Eligibility is rechecked at claim.
  select v_ids || coalesce(jsonb_agg(distinct b.id), '[]'::jsonb) into v_ids
    from meet_broadcasts b join meets mm on mm.id = b.meet_id join meet_broadcast_recipients rc on rc.broadcast_id = b.id
   where b.kind <> 'broadcast' and rc.status = 'queued' and b.created_at > now() - interval '20 hours'
     and zt_reminder_meet_ok(mm, p_today) and not (v_ids @> to_jsonb(b.id));
  return v_ids;
end $$;
revoke all on function zt_queue_due_reminders(date, text) from public;
grant execute on function zt_queue_due_reminders(date, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Opt-out is show-wide (BC-04) and reaches anything still queued (BC-03).
create or replace function zt_mail_opt_out(p_reg uuid, p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_meet uuid; v_meet_name text; v_addr text; v_reg registrations%rowtype;
begin
  if p_reg is null or p_token is null then raise exception 'bad link' using errcode = 'P0001'; end if;
  select r.* into v_reg from registrations r where r.id = p_reg and r.mail_token = p_token;
  if not found then raise exception 'That link is not valid.' using errcode = 'P0001'; end if;
  v_meet := v_reg.meet_id;
  select name into v_meet_name from meets where id = v_meet;
  v_addr := zt_reg_mail_address(v_reg);
  update registrations r set mail_opt_out = true
   where r.meet_id = v_meet
     and (r.id = p_reg
          or (v_reg.user_id is not null and r.user_id = v_reg.user_id)
          or (v_addr is not null and (lower(nullif(trim(r.email), '')) = lower(v_addr) or lower(zt_reg_mail_address(r)) = lower(v_addr))));
  update meet_broadcast_recipients rc set status = 'skipped', error = 'opted out'
    from meet_broadcasts b
   where rc.broadcast_id = b.id and b.meet_id = v_meet and rc.status = 'queued' and not b.test_only
     and (rc.registration_id = p_reg or (v_addr is not null and lower(rc.email) = lower(v_addr)));
  return jsonb_build_object('meet_name', v_meet_name);
end $$;
revoke all on function zt_mail_opt_out(uuid, uuid) from public;
grant execute on function zt_mail_opt_out(uuid, uuid) to anon, authenticated, service_role;
