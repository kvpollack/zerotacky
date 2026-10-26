-- 023: Show history on athlete pages (roadmap item, Kurt 10/26).
-- A roster athlete can be linked to a ZeroTacky account. Public athlete pages list the Final shows that account
-- competed in; placings are computed by the same engine the board uses (lib/engine/scoring), not stored here.
--
-- Why a side table and not athletes.user_id: `athletes` is anon-readable in full for the board and is upserted by
-- every scorer phone, so a column there would leak account ids and risk being blanked by a sync. This table is
-- readable only by the linked user and the meet's owners/members; the public read goes through an RPC that only
-- answers for public profiles.
--
-- Links come from three places:
--   1. a registration accepted into the roster (trigger below, plus a backfill of existing accepted registrations)
--   2. the promoter linking a roster athlete to a username (zt_link_athlete_account), e.g. hand-entered rosters
--   3. nothing else: athletes cannot self-link yet (would need the promoter's approval; later)

create table if not exists athlete_accounts (
  meet_id uuid not null references meets(id) on delete cascade,
  athlete_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  linked_by uuid null,
  created_at timestamptz not null default now(),
  primary key (meet_id, athlete_id),
  unique (meet_id, user_id),
  foreign key (meet_id, athlete_id) references athletes(meet_id, id) on delete cascade
);
create index if not exists athlete_accounts_user_idx on athlete_accounts (user_id);

alter table athlete_accounts enable row level security;
drop policy if exists athlete_accounts_read on athlete_accounts;
create policy athlete_accounts_read on athlete_accounts for select
  using (user_id = auth.uid() or zt_is_owner_or_member(meet_id));
-- No insert/update/delete policies: writes go through the trigger and zt_link_athlete_account only.
revoke all on athlete_accounts from public, anon, authenticated;
grant select on athlete_accounts to authenticated;

-- 1. Accepted registrations link the roster athlete to the registering account.
create or replace function zt_registration_links_account() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.athlete_id is not null and new.user_id is not null
     and exists (select 1 from athletes a where a.meet_id = new.meet_id and a.id = new.athlete_id) then
    insert into athlete_accounts (meet_id, athlete_id, user_id, linked_by)
    values (new.meet_id, new.athlete_id, new.user_id, null)
    on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists registrations_link_account on registrations;
create trigger registrations_link_account after insert or update of athlete_id, user_id, status on registrations
  for each row execute function zt_registration_links_account();

insert into athlete_accounts (meet_id, athlete_id, user_id, linked_by)
select r.meet_id, r.athlete_id, r.user_id, null
  from registrations r
  join athletes a on a.meet_id = r.meet_id and a.id = r.athlete_id
 where r.athlete_id is not null and r.user_id is not null
on conflict do nothing;

-- 2. Promoter links (or unlinks, p_username null/'') a roster athlete to an account by username.
create or replace function zt_link_athlete_account(p_meet_id uuid, p_athlete_id text, p_username text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid; v_target uuid; v_name text; v_user text; v_found text; v_ath text; v_other text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Sign in required.' using errcode = 'P0001';
  end if;
  if not zt_is_owner_or_member(p_meet_id) then
    raise exception 'You do not have permission to edit this meet.' using errcode = 'P0001';
  end if;
  select name into v_ath from athletes where meet_id = p_meet_id and id = p_athlete_id;
  if v_ath is null then
    raise exception 'That athlete is not on this roster. Save the roster first.' using errcode = 'P0001';
  end if;

  v_user := lower(trim(both from coalesce(p_username, '')));
  v_user := regexp_replace(v_user, '^@', '');
  if v_user = '' then
    delete from athlete_accounts where meet_id = p_meet_id and athlete_id = p_athlete_id;
    return jsonb_build_object('athleteId', p_athlete_id, 'username', null, 'displayName', null);
  end if;

  select id, username, display_name into v_target, v_found, v_name
    from profiles where lower(username) = v_user;
  if v_target is null then
    raise exception 'No ZeroTacky account has the username "%".', v_user using errcode = 'P0001';
  end if;
  v_user := v_found;

  select a.name into v_other
    from athlete_accounts aa join athletes a on a.meet_id = aa.meet_id and a.id = aa.athlete_id
   where aa.meet_id = p_meet_id and aa.user_id = v_target and aa.athlete_id <> p_athlete_id;
  if v_other is not null then
    raise exception '@% is already linked to % on this meet. Unlink that row first.', v_user, v_other using errcode = 'P0001';
  end if;

  insert into athlete_accounts (meet_id, athlete_id, user_id, linked_by)
  values (p_meet_id, p_athlete_id, v_target, v_uid)
  on conflict (meet_id, athlete_id) do update set user_id = excluded.user_id, linked_by = excluded.linked_by, created_at = now();

  return jsonb_build_object('athleteId', p_athlete_id, 'username', v_user, 'displayName', v_name);
end $$;
revoke all on function zt_link_athlete_account(uuid, text, text) from public, anon;
grant execute on function zt_link_athlete_account(uuid, text, text) to authenticated;

-- Promoter view of the links on one meet (usernames come from profiles, which RLS would otherwise hide).
create or replace function zt_meet_athlete_accounts(p_meet_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_out jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = 'P0001';
  end if;
  if not zt_is_owner_or_member(p_meet_id) then
    raise exception 'You do not have permission to view this meet.' using errcode = 'P0001';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'athleteId', aa.athlete_id, 'username', p.username, 'displayName', p.display_name,
           'fromRegistration', aa.linked_by is null)), '[]'::jsonb)
    into v_out
    from athlete_accounts aa join profiles p on p.id = aa.user_id
   where aa.meet_id = p_meet_id;
  return v_out;
end $$;
revoke all on function zt_meet_athlete_accounts(uuid) from public, anon;
grant execute on function zt_meet_athlete_accounts(uuid) to authenticated;

-- 3. Public read: Final, non-demo shows a PUBLIC profile competed in. Anyone can call it; it answers only for
-- public usernames and never returns account ids. Placings are computed by the caller from the public meet data.
create or replace function zt_athlete_show_history(p_username text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid; v_out jsonb;
begin
  select id into v_uid from profiles
   where is_public and username is not null and lower(username) = lower(trim(both from coalesce(p_username, '')));
  if v_uid is null then
    return '[]'::jsonb;
  end if;
  select coalesce(jsonb_agg(row_to_json(q)::jsonb order by q.date desc nulls last, q.name), '[]'::jsonb)
    into v_out
    from (
      select m.id as meet_id, m.slug, m.name, m.date, m.is_public_listed,
             (m.venue ->> 'city') as venue_city, (m.venue ->> 'state') as venue_state,
             d.id as division_id, d.name as division_name,
             a.id as athlete_id, a.name as athlete_name, a.status as athlete_status
        from athlete_accounts aa
        join meets m on m.id = aa.meet_id
        join athletes a on a.meet_id = aa.meet_id and a.id = aa.athlete_id
        join divisions d on d.meet_id = a.meet_id and d.id = a.division_id
       where aa.user_id = v_uid
         and m.is_demo = false
         and m.competition_status = 'completed'
         and m.results_status = 'final'
    ) q;
  return v_out;
end $$;
revoke all on function zt_athlete_show_history(text) from public;
grant execute on function zt_athlete_show_history(text) to anon, authenticated;

-- Verify (run after apply):
--   select count(*) from athlete_accounts;                                   -- backfilled links
--   select zt_athlete_show_history('kurtpollack');                           -- [] until Kurt's roster row is linked
--   select zt_link_athlete_account('<meet uuid>', 'sf-ath-13', 'kurtpollack');  -- as the meet owner
