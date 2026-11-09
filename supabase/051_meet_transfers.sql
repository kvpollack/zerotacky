-- 051: meet ownership transfer by request (Kurt 11/9). The promoter who built a meet sends a transfer to another
-- account by @username; that account accepts on its Account page and becomes meets.owner_id. The sender stays on the
-- meet as an admin member (keeps editing and running it alongside, the Strongfest pattern). 006's immediate
-- zt_transfer_ownership stays for SQL use; the UI only goes through the request flow here.

create table if not exists meet_transfers (
  id uuid primary key default gen_random_uuid(),
  meet_id uuid not null references meets(id) on delete cascade,
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index if not exists meet_transfers_one_pending on meet_transfers (meet_id) where status = 'pending';
create index if not exists meet_transfers_to_idx on meet_transfers (to_user, status);
create index if not exists meet_transfers_from_idx on meet_transfers (from_user, status);
alter table meet_transfers enable row level security;
drop policy if exists meet_transfers_parties on meet_transfers;
create policy meet_transfers_parties on meet_transfers for select to authenticated using (from_user = auth.uid() or to_user = auth.uid());
grant select on meet_transfers to authenticated;

create or replace function zt_transfer_json(t meet_transfers) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', t.id, 'meetId', t.meet_id, 'status', t.status, 'createdAt', t.created_at, 'decidedAt', t.decided_at,
    'meet', (select jsonb_build_object('name', m.name, 'slug', m.slug, 'date', m.date, 'athletes', (select count(*) from athletes a where a.meet_id = m.id)) from meets m where m.id = t.meet_id),
    'from', (select jsonb_build_object('username', p.username, 'displayName', p.display_name) from profiles p where p.id = t.from_user),
    'to', (select jsonb_build_object('username', p.username, 'displayName', p.display_name) from profiles p where p.id = t.to_user),
    'mine', t.from_user = auth.uid(), 'forMe', t.to_user = auth.uid())
$$;

-- Owner: ask @username to take the meet. One pending request per meet.
create or replace function zt_request_meet_transfer(p_meet_id uuid, p_username text) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_to uuid; v_name text; t meet_transfers;
begin
  if v_uid is null then raise exception 'Sign in required.' using errcode = 'P0001'; end if;
  if not exists (select 1 from meets where id = p_meet_id and owner_id = v_uid) then
    raise exception 'Only the meet owner can transfer it.' using errcode = 'P0001';
  end if;
  v_name := lower(trim(both from regexp_replace(coalesce(p_username, ''), '^@', '')));
  if v_name = '' then raise exception 'Enter the @username of the account taking the meet.' using errcode = 'P0001'; end if;
  select id into v_to from profiles where lower(username) = v_name;
  if v_to is null then raise exception 'No account has the username @%. They set one on their Account page.', v_name using errcode = 'P0001'; end if;
  if v_to = v_uid then raise exception 'That is your own account.' using errcode = 'P0001'; end if;
  if exists (select 1 from meet_transfers where meet_id = p_meet_id and status = 'pending') then
    raise exception 'A transfer is already waiting on this meet. Cancel it to send another.' using errcode = 'P0001';
  end if;
  insert into meet_transfers (meet_id, from_user, to_user) values (p_meet_id, v_uid, v_to) returning * into t;
  return zt_transfer_json(t);
end $$;
revoke all on function zt_request_meet_transfer(uuid, text) from public, anon;
grant execute on function zt_request_meet_transfer(uuid, text) to authenticated;

create or replace function zt_cancel_meet_transfer(p_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); t meet_transfers;
begin
  if v_uid is null then raise exception 'Sign in required.' using errcode = 'P0001'; end if;
  update meet_transfers set status = 'cancelled', decided_at = now() where id = p_id and from_user = v_uid and status = 'pending' returning * into t;
  if t.id is null then raise exception 'That transfer is no longer pending.' using errcode = 'P0001'; end if;
  return zt_transfer_json(t);
end $$;
revoke all on function zt_cancel_meet_transfer(uuid) from public, anon;
grant execute on function zt_cancel_meet_transfer(uuid) to authenticated;

-- Recipient: accept (the meet moves; the sender stays as admin) or decline.
create or replace function zt_respond_meet_transfer(p_id uuid, p_accept boolean) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); t meet_transfers;
begin
  if v_uid is null then raise exception 'Sign in required.' using errcode = 'P0001'; end if;
  select * into t from meet_transfers where id = p_id and to_user = v_uid and status = 'pending' for update;
  if t.id is null then raise exception 'That transfer is no longer pending.' using errcode = 'P0001'; end if;
  if not p_accept then
    update meet_transfers set status = 'declined', decided_at = now() where id = p_id returning * into t;
    return zt_transfer_json(t);
  end if;
  if not exists (select 1 from meets where id = t.meet_id and owner_id = t.from_user) then
    update meet_transfers set status = 'cancelled', decided_at = now() where id = p_id;
    raise exception 'The sender no longer owns that meet.' using errcode = 'P0001';
  end if;
  update meets set owner_id = v_uid, updated_at = now() where id = t.meet_id;
  insert into meet_members (meet_id, user_id, role) values (t.meet_id, v_uid, 'owner') on conflict (meet_id, user_id) do update set role = 'owner';
  insert into meet_members (meet_id, user_id, role) values (t.meet_id, t.from_user, 'admin') on conflict (meet_id, user_id) do update set role = 'admin';
  update meet_transfers set status = 'accepted', decided_at = now() where id = p_id returning * into t;
  return zt_transfer_json(t);
end $$;
revoke all on function zt_respond_meet_transfer(uuid, boolean) from public, anon;
grant execute on function zt_respond_meet_transfer(uuid, boolean) to authenticated;

-- Account page: what is waiting on me, what I sent, what settled in the last 30 days.
create or replace function zt_my_meet_transfers() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'incoming', (select coalesce(jsonb_agg(zt_transfer_json(t) order by t.created_at desc), '[]'::jsonb) from meet_transfers t where t.to_user = auth.uid() and t.status = 'pending'),
    'outgoing', (select coalesce(jsonb_agg(zt_transfer_json(t) order by t.created_at desc), '[]'::jsonb) from meet_transfers t where t.from_user = auth.uid() and t.status = 'pending'),
    'settled', (select coalesce(jsonb_agg(zt_transfer_json(t) order by t.decided_at desc), '[]'::jsonb) from meet_transfers t
                 where (t.from_user = auth.uid() or t.to_user = auth.uid()) and t.status <> 'pending' and t.decided_at > now() - interval '30 days'))
$$;
revoke all on function zt_my_meet_transfers() from public, anon;
grant execute on function zt_my_meet_transfers() to authenticated;

-- Meet tab block: who owns it, whether I am the owner, the pending request if any.
create or replace function zt_meet_transfer_state(p_meet_id uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select case when zt_is_owner_or_member(p_meet_id) then jsonb_build_object(
    'isOwner', (select owner_id = auth.uid() from meets where id = p_meet_id),
    'owner', (select jsonb_build_object('username', p.username, 'displayName', p.display_name) from meets m join profiles p on p.id = m.owner_id where m.id = p_meet_id),
    'pending', (select zt_transfer_json(t) from meet_transfers t where t.meet_id = p_meet_id and t.status = 'pending'))
  else null end
$$;
revoke all on function zt_meet_transfer_state(uuid) from public, anon;
grant execute on function zt_meet_transfer_state(uuid) to authenticated;
