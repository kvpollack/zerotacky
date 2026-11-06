-- 042_broadcasts.sql (11/5, feature gaps #10): promoter broadcasts and automatic reminders.
--
-- A broadcast is one message from the promoter to the athletes registered for a meet (accepted only, or everyone still
-- in: accepted + pending + waitlist). A reminder is the same machinery fired by the daily cron 7 days and 1 day before
-- the meet, to accepted athletes, when the promoter has left reminders on. Every send is a row in
-- meet_broadcast_recipients, so the promoter sees who was mailed and nothing is mailed twice.
--
-- Same trust shape as 031 / 033: the Next.js server holds ZT_MAIL_KEY and asks the database for recipients; a browser
-- bearer alone gets nothing with an address in it. The cron has no user, so the key alone is its credential
-- (auth.uid() null + key = server context).
--
-- One-click opt-out: every registration gets a random mail_token; the unsubscribe link carries (registration id, token)
-- and zt_mail_opt_out(uuid, uuid) flips mail_opt_out without a sign-in. Transactional mail (031: received / decision)
-- ignores the flag; broadcasts and reminders skip opted-out rows.
--
-- Limits (Resend free tier is 3,000 a month): 3 broadcasts per meet per 24 h, 500 recipients per broadcast, subject
-- 120 chars, body 2,000 chars, 10 test sends per promoter per day. Demo meets never send.

alter table registrations add column if not exists mail_token uuid not null default gen_random_uuid();
alter table registrations add column if not exists mail_opt_out boolean not null default false;
alter table meets add column if not exists reminders_enabled boolean not null default true;

create table if not exists meet_broadcasts (
  id uuid primary key default gen_random_uuid(),
  meet_id uuid not null references meets(id) on delete cascade,
  kind text not null check (kind in ('broadcast', 'reminder_7d', 'reminder_1d')),
  audience text not null check (audience in ('accepted', 'all_active')),
  subject text not null,
  body text not null,
  test_only boolean not null default false,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz null,
  recipient_count int not null default 0,
  sent_count int not null default 0,
  failed_count int not null default 0
);
create index if not exists meet_broadcasts_meet_idx on meet_broadcasts(meet_id, created_at desc);
-- one 7-day and one 1-day reminder per meet, ever
create unique index if not exists meet_broadcasts_reminder_once on meet_broadcasts(meet_id, kind) where kind <> 'broadcast';
revoke all on meet_broadcasts from public, anon, authenticated;
alter table meet_broadcasts enable row level security;

create table if not exists meet_broadcast_recipients (
  id uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references meet_broadcasts(id) on delete cascade,
  registration_id uuid null references registrations(id) on delete set null,
  email text not null,
  athlete_name text not null default '',
  division_name text not null default '',
  mail_token uuid null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  attempt_at timestamptz null,
  sent_at timestamptz null,
  error text null
);
create index if not exists meet_broadcast_recipients_bc_idx on meet_broadcast_recipients(broadcast_id, status);
revoke all on meet_broadcast_recipients from public, anon, authenticated;
alter table meet_broadcast_recipients enable row level security;

-- ---------------------------------------------------------------------------------------------------------------
-- Promoter: queue a broadcast (or a test to themselves). Returns the broadcast id and the recipient count.
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
  if v_body is null then raise exception 'Write the message first.' using errcode = 'P0001'; end if;
  if length(v_subject) > 120 then raise exception 'Subject is limited to 120 characters.' using errcode = 'P0001'; end if;
  if length(v_body) > 2000 then raise exception 'Message is limited to 2,000 characters.' using errcode = 'P0001'; end if;

  if coalesce(p_test, false) then
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

  select count(*) into v_recent from meet_broadcasts
    where meet_id = m.id and kind = 'broadcast' and not test_only and created_at > now() - interval '24 hours';
  if v_recent >= 3 then raise exception 'Three broadcasts have gone out for this meet in the last 24 hours; wait before sending another.' using errcode = 'P0001'; end if;

  insert into meet_broadcasts(meet_id, kind, audience, subject, body, test_only, created_by)
    values (m.id, 'broadcast', p_audience, v_subject, v_body, false, v_uid) returning id into v_id;
  insert into meet_broadcast_recipients(broadcast_id, registration_id, email, athlete_name, division_name, mail_token)
    select v_id, r.id, x.email, r.name, coalesce(d.name, ''), r.mail_token
      from registrations r
      left join divisions d on d.id = r.division_id and d.meet_id = r.meet_id
      cross join lateral (
        select coalesce((select u.email from auth.users u where u.id = r.user_id and u.email_confirmed_at is not null), nullif(trim(r.email), '')) as email
      ) x
     where r.meet_id = m.id
       and not r.mail_opt_out
       and x.email is not null
       and (r.status = 'accepted' or (p_audience = 'all_active' and r.status in ('pending', 'waitlist')))
     order by lower(x.email)
     limit 500;
  get diagnostics v_count = row_count;
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
-- Server: what to send and to whom. Marks every queued recipient as attempted (a second call inside two minutes gets
-- none of them back), so two overlapping requests cannot both mail the same athlete. uid null = cron.
create or replace function zt_broadcast_payload(p_broadcast uuid, p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b meet_broadcasts%rowtype; m meets%rowtype; v_uid uuid; v_prom_email text; v_prom_name text; v_recips jsonb;
begin
  if not zt_mail_key_ok(p_key) then raise exception 'Server key required.' using errcode = 'P0001'; end if;
  v_uid := auth.uid();
  select * into b from meet_broadcasts where id = p_broadcast for update;
  if not found then raise exception 'unknown broadcast' using errcode = 'P0001'; end if;
  select * into m from meets where id = b.meet_id;
  if not found then raise exception 'meet no longer exists' using errcode = 'P0001'; end if;
  if v_uid is not null and not zt_is_owner_or_member(m.id) then raise exception 'You do not have access to this meet.' using errcode = 'P0001'; end if;
  if m.owner_id is not null then
    select case when u.email_confirmed_at is not null then u.email end, p.display_name
      into v_prom_email, v_prom_name from auth.users u left join profiles p on p.id = u.id where u.id = m.owner_id;
  end if;

  with claimed as (
    update meet_broadcast_recipients
       set attempt_at = now()
     where broadcast_id = b.id and status = 'queued'
       and (attempt_at is null or attempt_at < now() - interval '2 minutes')
    returning id, registration_id, email, athlete_name, division_name, mail_token
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'registration_id', c.registration_id, 'email', c.email, 'athlete_name', c.athlete_name,
      'division_name', c.division_name, 'division_id', r.division_id, 'mail_token', c.mail_token)), '[]'::jsonb)
    into v_recips from claimed c left join registrations r on r.id = c.registration_id;

  return jsonb_build_object(
    'id', b.id, 'kind', b.kind, 'audience', b.audience, 'subject', b.subject, 'body', b.body, 'test_only', b.test_only,
    'meet_id', m.id, 'meet_name', m.name, 'meet_date', m.date, 'meet_slug', m.slug, 'venue', m.venue,
    'promoter_email', nullif(trim(v_prom_email), ''), 'promoter_name', coalesce(nullif(trim(v_prom_name), ''), ''),
    'promoter_contact', m.promoter_contact,
    'recipients', v_recips
  );
end $$;
revoke all on function zt_broadcast_payload(uuid, text) from public;
grant execute on function zt_broadcast_payload(uuid, text) to anon, authenticated, service_role;

-- Server: record one recipient's outcome. Closes the broadcast when nothing is queued any more.
create or replace function zt_broadcast_mark(p_recipient uuid, p_ok boolean, p_error text, p_key text) returns void
language plpgsql security definer set search_path = public as $$
declare v_bc uuid; v_left int;
begin
  if not zt_mail_key_ok(p_key) then raise exception 'Server key required.' using errcode = 'P0001'; end if;
  update meet_broadcast_recipients
     set status = case when coalesce(p_ok, false) then 'sent' else 'failed' end,
         sent_at = case when coalesce(p_ok, false) then now() else null end,
         error = case when coalesce(p_ok, false) then null else left(coalesce(p_error, 'send failed'), 300) end
   where id = p_recipient returning broadcast_id into v_bc;
  if v_bc is null then return; end if;
  update meet_broadcasts set
      sent_count = (select count(*) from meet_broadcast_recipients where broadcast_id = v_bc and status = 'sent'),
      failed_count = (select count(*) from meet_broadcast_recipients where broadcast_id = v_bc and status = 'failed')
    where id = v_bc;
  select count(*) into v_left from meet_broadcast_recipients where broadcast_id = v_bc and status = 'queued';
  if v_left = 0 then update meet_broadcasts set finished_at = now() where id = v_bc and finished_at is null; end if;
end $$;
revoke all on function zt_broadcast_mark(uuid, boolean, text, text) from public;
grant execute on function zt_broadcast_mark(uuid, boolean, text, text) to anon, authenticated, service_role;

-- Same, for a whole Resend batch at once: p_results = [{id, ok, error}, ...]. One round trip per 100 sends.
create or replace function zt_broadcast_mark_many(p_results jsonb, p_key text) returns void
language plpgsql security definer set search_path = public as $$
declare v_bc uuid;
begin
  if not zt_mail_key_ok(p_key) then raise exception 'Server key required.' using errcode = 'P0001'; end if;
  if p_results is null or jsonb_typeof(p_results) <> 'array' then return; end if;
  with r as (
    select (x->>'id')::uuid as id, coalesce((x->>'ok')::boolean, false) as ok, left(coalesce(x->>'error', 'send failed'), 300) as err
      from jsonb_array_elements(p_results) x where (x->>'id') ~* '^[0-9a-f-]{36}$'
  )
  update meet_broadcast_recipients m
     set status = case when r.ok then 'sent' else 'failed' end,
         sent_at = case when r.ok then now() else null end,
         error = case when r.ok then null else r.err end
    from r where m.id = r.id;
  for v_bc in
    select distinct broadcast_id from meet_broadcast_recipients
     where id in (select (x->>'id')::uuid from jsonb_array_elements(p_results) x where (x->>'id') ~* '^[0-9a-f-]{36}$')
  loop
    update meet_broadcasts set
        sent_count = (select count(*) from meet_broadcast_recipients where broadcast_id = v_bc and status = 'sent'),
        failed_count = (select count(*) from meet_broadcast_recipients where broadcast_id = v_bc and status = 'failed'),
        finished_at = case when exists (select 1 from meet_broadcast_recipients where broadcast_id = v_bc and status = 'queued')
                           then finished_at else coalesce(finished_at, now()) end
      where id = v_bc;
  end loop;
end $$;
revoke all on function zt_broadcast_mark_many(jsonb, text) from public;
grant execute on function zt_broadcast_mark_many(jsonb, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Promoter: history and the reminders switch. No addresses, no key needed: counts and subjects only.
create or replace function zt_list_broadcasts(p_meet uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_on boolean; v_list jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode = 'P0001'; end if;
  if not zt_is_owner_or_member(p_meet) then raise exception 'You do not have access to this meet.' using errcode = 'P0001'; end if;
  select reminders_enabled into v_on from meets where id = p_meet;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'kind', kind, 'audience', audience, 'subject', subject, 'test_only', test_only,
      'created_at', to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'finished_at', case when finished_at is null then null else to_char(finished_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end,
      'recipient_count', recipient_count, 'sent_count', sent_count, 'failed_count', failed_count) order by created_at desc), '[]'::jsonb)
    into v_list from (select * from meet_broadcasts where meet_id = p_meet order by created_at desc limit 30) s;
  return jsonb_build_object('reminders_enabled', coalesce(v_on, true), 'broadcasts', v_list,
    'opted_out', (select count(*) from registrations where meet_id = p_meet and mail_opt_out));
end $$;
revoke all on function zt_list_broadcasts(uuid) from public, anon;
grant execute on function zt_list_broadcasts(uuid) to authenticated, service_role;

create or replace function zt_set_reminders(p_meet uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode = 'P0001'; end if;
  if not zt_is_owner_or_member(p_meet) then raise exception 'You do not have access to this meet.' using errcode = 'P0001'; end if;
  update meets set reminders_enabled = coalesce(p_on, true) where id = p_meet;
end $$;
revoke all on function zt_set_reminders(uuid, boolean) from public, anon;
grant execute on function zt_set_reminders(uuid, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Cron (daily): queue the reminders due today. 7 days before and 1 day before the meet date, accepted athletes, meets
-- that are listed, not demo, not cancelled or postponed, with reminders on. Idempotent through the unique index.
-- Returns the broadcast ids it created plus any recent reminder still holding queued rows (the route then sends each).
create or replace function zt_queue_due_reminders(p_today date, p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m record; v_kind text; v_id uuid; v_count int; v_ids jsonb := '[]'::jsonb;
begin
  if not zt_mail_key_ok(p_key) then raise exception 'Server key required.' using errcode = 'P0001'; end if;
  for m in
    select id, name, date, case when date = p_today + 7 then 'reminder_7d' else 'reminder_1d' end as kind
      from meets
     where reminders_enabled and is_public_listed and not is_demo
       and competition_status not in ('cancelled', 'postponed', 'completed')
       and (date = p_today + 7 or date = p_today + 1)
  loop
    if exists (select 1 from meet_broadcasts where meet_id = m.id and kind = m.kind) then continue; end if;
    insert into meet_broadcasts(meet_id, kind, audience, subject, body, test_only, created_by)
      values (m.id, m.kind, 'accepted',
              case when m.kind = 'reminder_7d' then m.name || ' is one week away' else m.name || ' is tomorrow' end,
              '', false, null)
      returning id into v_id;
    insert into meet_broadcast_recipients(broadcast_id, registration_id, email, athlete_name, division_name, mail_token)
      select v_id, r.id, x.email, r.name, coalesce(d.name, ''), r.mail_token
        from registrations r
        left join divisions d on d.id = r.division_id and d.meet_id = r.meet_id
        cross join lateral (
          select coalesce((select u.email from auth.users u where u.id = r.user_id and u.email_confirmed_at is not null), nullif(trim(r.email), '')) as email
        ) x
       where r.meet_id = m.id and r.status = 'accepted' and not r.mail_opt_out and x.email is not null
       order by lower(x.email) limit 500;
    delete from meet_broadcast_recipients a using meet_broadcast_recipients b
      where a.broadcast_id = v_id and b.broadcast_id = v_id and lower(a.email) = lower(b.email) and a.id > b.id;
    select count(*) into v_count from meet_broadcast_recipients where broadcast_id = v_id;
    update meet_broadcasts set recipient_count = v_count, finished_at = case when v_count = 0 then now() else null end where id = v_id;
    if v_count > 0 then v_ids := v_ids || to_jsonb(v_id); end if;
  end loop;
  -- a reminder from an earlier day with rows still queued (the send pass failed) goes out on this pass
  select v_ids || coalesce(jsonb_agg(distinct b.id), '[]'::jsonb) into v_ids
    from meet_broadcasts b join meet_broadcast_recipients rc on rc.broadcast_id = b.id
   where b.kind <> 'broadcast' and rc.status = 'queued' and b.created_at > now() - interval '3 days'
     and not (v_ids @> to_jsonb(b.id));
  return v_ids;
end $$;
revoke all on function zt_queue_due_reminders(date, text) from public;
grant execute on function zt_queue_due_reminders(date, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Athlete, no sign-in: the unsubscribe link. Returns the meet name when the token matched (already opted out counts).
create or replace function zt_mail_opt_out(p_reg uuid, p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_meet text; v_email text;
begin
  if p_reg is null or p_token is null then raise exception 'bad link' using errcode = 'P0001'; end if;
  select m.name, r.email into v_meet, v_email from registrations r join meets m on m.id = r.meet_id
    where r.id = p_reg and r.mail_token = p_token;
  if not found then raise exception 'That link is not valid.' using errcode = 'P0001'; end if;
  update registrations set mail_opt_out = true where id = p_reg;
  return jsonb_build_object('meet_name', v_meet);
end $$;
revoke all on function zt_mail_opt_out(uuid, uuid) from public;
grant execute on function zt_mail_opt_out(uuid, uuid) to anon, authenticated, service_role;
