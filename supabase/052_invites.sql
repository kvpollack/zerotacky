-- 052: ownership invites by link (Kurt 11/9). An admin (gyms, any show) or a meet's owner (that meet) mints a single-use
-- link. Whoever opens it signs up or signs in and becomes the owner on the spot: no claim form, no admin review, no
-- transfer request. Gym: gyms.owner_id + status 'claimed' (other pending claims close, same as zt_approve_gym_claim).
-- Meet: meets.owner_id moves, the recipient becomes the 'owner' member and the inviter stays as 'admin' (051 pattern).
-- Links expire after 14 days, can be revoked by their creator, and die when the target changes hands another way.
-- Verify: select count(*) from pg_proc where proname in ('zt_invite_json','zt_create_invite','zt_revoke_invite','zt_list_invites','zt_invite_preview','zt_redeem_invite');  -- 6

create table if not exists invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  kind text not null check (kind in ('gym','meet')),
  target_id uuid not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  label text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  redeemed_by uuid references auth.users(id) on delete set null,
  redeemed_at timestamptz,
  revoked_at timestamptz
);
create index if not exists invites_target_idx on invites (kind, target_id);
create index if not exists invites_creator_idx on invites (created_by);
alter table invites enable row level security;
drop policy if exists invites_creator_read on invites;
create policy invites_creator_read on invites for select to authenticated using (created_by = auth.uid());
grant select on invites to authenticated;

-- status is derived, never stored: open | expired | redeemed | revoked
create or replace function zt_invite_status(i invites) returns text language sql immutable as $$
  select case when i.revoked_at is not null then 'revoked'
              when i.redeemed_at is not null then 'redeemed'
              when i.expires_at < now() then 'expired'
              else 'open' end
$$;

create or replace function zt_invite_target_json(p_kind text, p_target uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select case p_kind
    when 'gym' then (select jsonb_build_object('name', g.name, 'slug', g.slug, 'place', nullif(concat_ws(', ', g.city, g.state), ''), 'owned', g.owner_id is not null)
                     from gyms g where g.id = p_target and g.status <> 'removed')
    when 'meet' then (select jsonb_build_object('name', m.name, 'slug', m.slug, 'date', m.date, 'athletes', (select count(*) from athletes a where a.meet_id = m.id), 'owned', m.owner_id is not null)
                      from meets m where m.id = p_target)
  end
$$;

-- Creator's view (token included: this is what gets copied and sent).
create or replace function zt_invite_json(i invites) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', i.id, 'token', i.token, 'kind', i.kind, 'targetId', i.target_id, 'label', i.label,
    'status', zt_invite_status(i), 'createdAt', i.created_at, 'expiresAt', i.expires_at, 'redeemedAt', i.redeemed_at,
    'target', zt_invite_target_json(i.kind, i.target_id),
    'redeemedBy', (select jsonb_build_object('username', p.username, 'displayName', p.display_name) from profiles p where p.id = i.redeemed_by))
$$;

create or replace function zt_can_invite(p_kind text, p_target uuid) returns boolean language sql stable security definer set search_path = public as $$
  select case p_kind
    when 'gym' then zt_is_admin() and exists (select 1 from gyms g where g.id = p_target and g.status <> 'removed')
    when 'meet' then exists (select 1 from meets m where m.id = p_target and m.owner_id = auth.uid())
                     or (zt_is_admin() and exists (select 1 from meets m where m.id = p_target))
    else false end
$$;

create or replace function zt_create_invite(p_kind text, p_target uuid, p_label text default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); i invites;
begin
  if v_uid is null then raise exception 'Sign in required.' using errcode = 'P0001'; end if;
  if p_kind not in ('gym','meet') then raise exception 'Unknown invite kind.' using errcode = 'P0001'; end if;
  if not zt_can_invite(p_kind, p_target) then
    raise exception 'Only % can invite an owner here.', case p_kind when 'gym' then 'a ZeroTacky admin' else 'the meet owner' end using errcode = 'P0001';
  end if;
  if (select count(*) from invites x where x.created_by = v_uid and x.created_at > now() - interval '1 day') >= 30 then
    raise exception 'That is a lot of invites for one day. Try again tomorrow.' using errcode = 'P0001';
  end if;
  insert into invites (kind, target_id, created_by, label) values (p_kind, p_target, v_uid, nullif(left(trim(p_label), 80), ''))
  returning * into i;
  return zt_invite_json(i);
end $$;
revoke all on function zt_create_invite(text, uuid, text) from public, anon;
grant execute on function zt_create_invite(text, uuid, text) to authenticated;

create or replace function zt_revoke_invite(p_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare i invites;
begin
  update invites set revoked_at = now() where id = p_id and created_by = auth.uid() and redeemed_at is null and revoked_at is null returning * into i;
  if i.id is null then raise exception 'That invite is not yours or is already settled.' using errcode = 'P0001'; end if;
  return zt_invite_json(i);
end $$;
revoke all on function zt_revoke_invite(uuid) from public, anon;
grant execute on function zt_revoke_invite(uuid) to authenticated;

-- Open + recently settled invites the caller made for one target (the Ownership block / gym page button).
create or replace function zt_list_invites(p_kind text, p_target uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(zt_invite_json(i) order by i.created_at desc), '[]'::jsonb)
  from invites i
  where i.kind = p_kind and i.target_id = p_target and i.created_by = auth.uid()
    and (zt_invite_status(i) = 'open' or i.created_at > now() - interval '30 days')
$$;
revoke all on function zt_list_invites(text, uuid) from public, anon;
grant execute on function zt_list_invites(text, uuid) to authenticated;

-- What the invite page shows before anyone signs in. No token echo, no ids beyond the public slug.
create or replace function zt_invite_preview(p_token text) returns jsonb language sql stable security definer set search_path = public as $$
  select case when i.id is null then jsonb_build_object('status', 'unknown')
    else jsonb_build_object(
      'status', case when zt_invite_target_json(i.kind, i.target_id) is null then 'unknown' else zt_invite_status(i) end,
      'kind', i.kind, 'expiresAt', i.expires_at,
      'target', zt_invite_target_json(i.kind, i.target_id),
      'from', (select jsonb_build_object('username', p.username, 'displayName', p.display_name) from profiles p where p.id = i.created_by),
      'isCreator', i.created_by = auth.uid(),
      'isMine', i.redeemed_by is not null and i.redeemed_by = auth.uid())
    end
  from (select 1) one left join invites i on i.token = p_token
$$;
revoke all on function zt_invite_preview(text) from public;
grant execute on function zt_invite_preview(text) to anon, authenticated;

create or replace function zt_redeem_invite(p_token text) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); i invites; v_slug text; v_name text;
begin
  if v_uid is null then raise exception 'Sign in required.' using errcode = 'P0001'; end if;
  select * into i from invites where token = p_token for update;
  if i.id is null then raise exception 'That invite link is not valid.' using errcode = 'P0001'; end if;
  if i.redeemed_by = v_uid then
    return jsonb_build_object('kind', i.kind, 'targetId', i.target_id, 'target', zt_invite_target_json(i.kind, i.target_id), 'already', true);
  end if;
  if zt_invite_status(i) <> 'open' then raise exception 'That invite has %.', case zt_invite_status(i) when 'expired' then 'expired' when 'revoked' then 'been withdrawn' else 'already been used' end using errcode = 'P0001'; end if;
  if i.created_by = v_uid then raise exception 'That is your own invite. Send it to the person who should own this.' using errcode = 'P0001'; end if;

  if i.kind = 'gym' then
    update gyms set owner_id = v_uid, status = 'claimed' where id = i.target_id and status <> 'removed' returning slug, name into v_slug, v_name;
    if v_slug is null then raise exception 'That gym listing is gone.' using errcode = 'P0001'; end if;
    update gym_claims set status = 'approved' where gym_id = i.target_id and user_id = v_uid and kind = 'claim' and status = 'pending';
    update gym_claims set status = 'rejected' where gym_id = i.target_id and kind = 'claim' and status = 'pending';
    update profiles set is_gym_owner = true where id = v_uid and is_gym_owner is distinct from true;
  elsif i.kind = 'meet' then
    -- the inviter must still be in a position to hand it over: owner, or an admin (admin invites override)
    if not exists (select 1 from meets m where m.id = i.target_id and (m.owner_id = i.created_by or exists (select 1 from zt_admins z where z.user_id = i.created_by))) then
      update invites set revoked_at = now() where id = i.id;
      raise exception 'The meet changed hands before this invite was used.' using errcode = 'P0001';
    end if;
    update meets set owner_id = v_uid, updated_at = now() where id = i.target_id returning slug, name into v_slug, v_name;
    if v_slug is null then raise exception 'That meet is gone.' using errcode = 'P0001'; end if;
    insert into meet_members (meet_id, user_id, role) values (i.target_id, v_uid, 'owner') on conflict (meet_id, user_id) do update set role = 'owner';
    insert into meet_members (meet_id, user_id, role) values (i.target_id, i.created_by, 'admin') on conflict (meet_id, user_id) do update set role = 'admin';
    update meet_transfers set status = 'cancelled', decided_at = now() where meet_id = i.target_id and status = 'pending';
    update profiles set is_promoter = true where id = v_uid and is_promoter is distinct from true;
  end if;
  update invites set redeemed_by = v_uid, redeemed_at = now() where id = i.id;
  -- sibling open invites for the same target are spent too
  update invites set revoked_at = now() where kind = i.kind and target_id = i.target_id and id <> i.id and redeemed_at is null and revoked_at is null;
  return jsonb_build_object('kind', i.kind, 'targetId', i.target_id, 'target', zt_invite_target_json(i.kind, i.target_id), 'already', false);
end $$;
revoke all on function zt_redeem_invite(text) from public, anon;
grant execute on function zt_redeem_invite(text) to authenticated;
