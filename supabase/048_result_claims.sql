-- 048_result_claims.sql (11/8): feature gaps #9, "claim my results" (the PR board is computed client-side from the
-- Final results already readable through zt_athlete_show_history; no new columns for it).
--
-- 023 linked roster rows to accounts two ways: an accepted registration (trigger) or the promoter typing a username.
-- Hand-entered and imported rosters (#6) leave most rows unlinked, and the athlete had no way to ask. This adds the
-- third way named in 023's header: the athlete claims a roster row on a completed show, the promoter approves or
-- rejects, approval writes the same athlete_accounts row the other two paths write.
--
-- Rules:
--   - claims are for completed, non-demo shows; one pending claim per account per meet (partial unique index);
--   - the account needs a username (the link surfaces as @username to the promoter, as in zt_link_athlete_account);
--   - a roster row that is already linked, or an account already linked to another row on the meet, cannot be claimed;
--   - a promoter link made by hand while a matching claim is pending approves that claim (trigger on athlete_accounts);
--   - the table is read by the claimant and the meet's owners/members only; all writes go through the RPCs below.
--
-- Verify after apply:
--   select count(*) from pg_proc where proname in ('zt_claim_result','zt_withdraw_claim','zt_my_claims','zt_meet_claims','zt_resolve_claim','zt_claim_status');  -- 6
--   select indexname from pg_indexes where tablename = 'athlete_claims';   -- pkey + athlete_claims_one_pending + athlete_claims_user_idx

create table if not exists athlete_claims (
  id uuid primary key default gen_random_uuid(),
  meet_id uuid not null references meets(id) on delete cascade,
  athlete_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  note text null check (note is null or char_length(note) <= 200),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz null,
  resolved_by uuid null,
  foreign key (meet_id, athlete_id) references athletes(meet_id, id) on delete cascade
);
create unique index if not exists athlete_claims_one_pending on athlete_claims (meet_id, user_id) where status = 'pending';
create index if not exists athlete_claims_user_idx on athlete_claims (user_id);
create index if not exists athlete_claims_meet_idx on athlete_claims (meet_id, status);

alter table athlete_claims enable row level security;
drop policy if exists athlete_claims_read on athlete_claims;
create policy athlete_claims_read on athlete_claims for select
  using (user_id = auth.uid() or zt_is_owner_or_member(meet_id));
revoke all on athlete_claims from public, anon, authenticated;
grant select on athlete_claims to authenticated;

-- One claim as the client sees it. Account ids never leave the server; the promoter sees the username and display name.
create or replace function zt_claim_json(c athlete_claims) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', c.id,
    'meetServerId', c.meet_id,
    'slug', m.slug,
    'meetName', m.name,
    'meetDate', m.date,
    'athleteId', c.athlete_id,
    'athleteName', a.name,
    'divisionName', d.name,
    'username', p.username,
    'displayName', p.display_name,
    'note', c.note,
    'status', c.status,
    'createdAt', to_char(c.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'resolvedAt', case when c.resolved_at is null then null else to_char(c.resolved_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end,
    'alreadyLinked', exists (select 1 from athlete_accounts aa where aa.meet_id = c.meet_id and aa.athlete_id = c.athlete_id)
  )
  from meets m
  left join athletes a on a.meet_id = c.meet_id and a.id = c.athlete_id
  left join divisions d on d.meet_id = a.meet_id and d.id = a.division_id
  left join profiles p on p.id = c.user_id
  where m.id = c.meet_id
$$;
revoke all on function zt_claim_json(athlete_claims) from public, anon, authenticated;

-- Athlete: claim a roster row on a completed show.
create or replace function zt_claim_result(p_meet_id uuid, p_athlete_id text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid; m meets%rowtype; v_user text; v_other text; v_note text; c athlete_claims%rowtype;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'Sign in required.' using errcode = 'P0001'; end if;
  select * into m from meets where id = p_meet_id;
  if m.id is null then raise exception 'That show does not exist.' using errcode = 'P0001'; end if;
  if m.is_demo then raise exception 'Demo shows cannot be claimed.' using errcode = 'P0001'; end if;
  if m.competition_status <> 'completed' then
    raise exception 'Results can be claimed once the show is completed.' using errcode = 'P0001';
  end if;
  select username into v_user from profiles where id = v_uid;
  if v_user is null or v_user = '' then
    raise exception 'Set a username on your account first; the promoter sees your claim as @username.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from athletes a where a.meet_id = p_meet_id and a.id = p_athlete_id) then
    raise exception 'That athlete is not on this roster.' using errcode = 'P0001';
  end if;
  if exists (select 1 from athlete_accounts aa where aa.meet_id = p_meet_id and aa.athlete_id = p_athlete_id) then
    raise exception 'That result is already linked to an account. If it is yours, contact the promoter.' using errcode = 'P0001';
  end if;
  select a.name into v_other from athlete_accounts aa join athletes a on a.meet_id = aa.meet_id and a.id = aa.athlete_id
   where aa.meet_id = p_meet_id and aa.user_id = v_uid;
  if v_other is not null then
    raise exception 'Your account is already linked to % on this show.', v_other using errcode = 'P0001';
  end if;
  if exists (select 1 from athlete_claims where meet_id = p_meet_id and user_id = v_uid and status = 'pending') then
    raise exception 'You already have a claim waiting on this show. Withdraw it to claim a different row.' using errcode = 'P0001';
  end if;
  v_note := nullif(trim(both from coalesce(p_note, '')), '');
  if v_note is not null and char_length(v_note) > 200 then
    raise exception 'Keep the note to 200 characters.' using errcode = 'P0001';
  end if;
  insert into athlete_claims (meet_id, athlete_id, user_id, note) values (p_meet_id, p_athlete_id, v_uid, v_note) returning * into c;
  return zt_claim_json(c);
end $$;
revoke all on function zt_claim_result(uuid, text, text) from public, anon;
grant execute on function zt_claim_result(uuid, text, text) to authenticated;

-- Athlete: withdraw a pending claim of their own.
create or replace function zt_withdraw_claim(p_claim_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid; c athlete_claims%rowtype;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'Sign in required.' using errcode = 'P0001'; end if;
  delete from athlete_claims where id = p_claim_id and user_id = v_uid and status = 'pending' returning * into c;
  if c.id is null then raise exception 'That claim is no longer pending.' using errcode = 'P0001'; end if;
  return jsonb_build_object('id', c.id, 'withdrawn', true);
end $$;
revoke all on function zt_withdraw_claim(uuid) from public, anon;
grant execute on function zt_withdraw_claim(uuid) to authenticated;

-- Athlete: my claims, newest first.
create or replace function zt_my_claims() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid; v_out jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'Sign in required.' using errcode = 'P0001'; end if;
  select coalesce(jsonb_agg(zt_claim_json(c) order by c.created_at desc), '[]'::jsonb) into v_out
    from athlete_claims c where c.user_id = v_uid;
  return v_out;
end $$;
revoke all on function zt_my_claims() from public, anon;
grant execute on function zt_my_claims() to authenticated;

-- Athlete, on a show page: which roster rows are already linked (ids only), my own link on this meet, my pending claim.
create or replace function zt_claim_status(p_meet_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid; v_linked jsonb; v_mine text; v_claim jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'Sign in required.' using errcode = 'P0001'; end if;
  select coalesce(jsonb_agg(aa.athlete_id), '[]'::jsonb) into v_linked from athlete_accounts aa where aa.meet_id = p_meet_id;
  select aa.athlete_id into v_mine from athlete_accounts aa where aa.meet_id = p_meet_id and aa.user_id = v_uid;
  select zt_claim_json(c) into v_claim from athlete_claims c
   where c.meet_id = p_meet_id and c.user_id = v_uid order by c.created_at desc limit 1;
  return jsonb_build_object('linkedAthleteIds', v_linked, 'myAthleteId', v_mine, 'myClaim', v_claim);
end $$;
revoke all on function zt_claim_status(uuid) from public, anon;
grant execute on function zt_claim_status(uuid) to authenticated;

-- Promoter: claims on one meet (pending first, then the last 50 resolved).
create or replace function zt_meet_claims(p_meet_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_out jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode = 'P0001'; end if;
  if not zt_is_owner_or_member(p_meet_id) then
    raise exception 'You do not have permission to view this meet.' using errcode = 'P0001';
  end if;
  select coalesce(jsonb_agg(zt_claim_json(c) order by (c.status <> 'pending'), c.created_at desc), '[]'::jsonb) into v_out
    from (select * from athlete_claims where meet_id = p_meet_id and status = 'pending'
          union all
          (select * from athlete_claims where meet_id = p_meet_id and status <> 'pending' order by resolved_at desc limit 50)) c;
  return v_out;
end $$;
revoke all on function zt_meet_claims(uuid) from public, anon;
grant execute on function zt_meet_claims(uuid) to authenticated;

-- Promoter: approve (links the row, same as zt_link_athlete_account) or reject a pending claim.
create or replace function zt_resolve_claim(p_claim_id uuid, p_approve boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid; c athlete_claims%rowtype; v_other text;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'Sign in required.' using errcode = 'P0001'; end if;
  select * into c from athlete_claims where id = p_claim_id for update;
  if c.id is null then raise exception 'That claim does not exist.' using errcode = 'P0001'; end if;
  if not zt_is_owner_or_member(c.meet_id) then
    raise exception 'You do not have permission to edit this meet.' using errcode = 'P0001';
  end if;
  if c.status <> 'pending' then raise exception 'That claim was already %.', c.status using errcode = 'P0001'; end if;
  if p_approve then
    if exists (select 1 from athlete_accounts aa where aa.meet_id = c.meet_id and aa.athlete_id = c.athlete_id) then
      raise exception 'That roster row is already linked to an account. Unlink it first, or reject the claim.' using errcode = 'P0001';
    end if;
    select a.name into v_other from athlete_accounts aa join athletes a on a.meet_id = aa.meet_id and a.id = aa.athlete_id
     where aa.meet_id = c.meet_id and aa.user_id = c.user_id;
    if v_other is not null then
      raise exception 'That account is already linked to % on this meet. Reject the claim or unlink that row first.', v_other using errcode = 'P0001';
    end if;
    insert into athlete_accounts (meet_id, athlete_id, user_id, linked_by) values (c.meet_id, c.athlete_id, c.user_id, v_uid);
    -- the trigger below marks the claim approved; set it here too so the return value is right inside this statement
    update athlete_claims set status = 'approved', resolved_at = now(), resolved_by = v_uid where id = c.id returning * into c;
  else
    update athlete_claims set status = 'rejected', resolved_at = now(), resolved_by = v_uid where id = c.id returning * into c;
  end if;
  return zt_claim_json(c);
end $$;
revoke all on function zt_resolve_claim(uuid, boolean) from public, anon;
grant execute on function zt_resolve_claim(uuid, boolean) to authenticated;

-- A link made any other way (registration trigger, zt_link_athlete_account) settles a matching pending claim.
create or replace function zt_link_settles_claim() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update athlete_claims set status = 'approved', resolved_at = now(), resolved_by = coalesce(new.linked_by, resolved_by)
   where meet_id = new.meet_id and athlete_id = new.athlete_id and user_id = new.user_id and status = 'pending';
  return new;
end $$;
drop trigger if exists athlete_accounts_settle_claim on athlete_accounts;
create trigger athlete_accounts_settle_claim after insert or update of user_id on athlete_accounts
  for each row execute function zt_link_settles_claim();
