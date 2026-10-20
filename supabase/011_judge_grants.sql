-- 011: the meet PIN issues a server-side judge grant; score writes require it (Astra R-H1, 2026-10-19).
--
-- Before: a joined phone's writes to results/live_state were authorised by the join code alone (x-zt-join), and
-- zt_check_admin_pin answered yes/no without binding anything to that answer. A spectator with the public code could
-- set its stored role to "judge" and the server accepted its scores.
--
-- After: zt_check_admin_pin returns a random grant token on success and records it in meet_grants (RLS on, no
-- policies, so the API never reads the table). The phone sends the token as x-zt-grant on every call. Writes to
-- results and live_state need zt_is_member(meet_id) or a live grant. A grant is tied to the join code in force when
-- it was issued, so rotating the code revokes every grant with it; judges re-enter the PIN after a rotation.
-- Pit crew edits to athletes (rack heights, custom loads) stay on the join code: no PIN is asked for that role.
--
-- Deploy with the matching client (lib/sync/client.ts x-zt-grant, controller.ts link.grant). Older clients compare the
-- RPC result to `true` and will read any token as a failed PIN until they update.

create table if not exists meet_grants (
  token text primary key,
  meet_id uuid not null references meets(id) on delete cascade,
  device_id text,
  join_code text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists meet_grants_meet_idx on meet_grants(meet_id);
alter table meet_grants enable row level security;
revoke all on meet_grants from public, anon, authenticated;

create or replace function zt_grant_token() returns text language sql stable as $$
  select coalesce(current_setting('request.headers', true)::jsonb ->> 'x-zt-grant', '');
$$;

create or replace function zt_has_grant(m uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from meet_grants g join meets mt on mt.id = g.meet_id
    where g.meet_id = m and g.token <> '' and g.token = zt_grant_token() and g.revoked_at is null and g.join_code = mt.join_code
  );
$$;

-- Return type changes (boolean -> text), so the old signature has to go first.
drop function if exists zt_check_admin_pin(text, text);
create or replace function zt_check_admin_pin(p_code text, p_pin text, p_device_id text default null) returns text
language plpgsql security definer set search_path = public as $$
declare v_pin text; v_code text; v_meet uuid; v_token text;
begin
  v_code := upper(trim(coalesce(p_code, '')));
  if v_code = '' or p_pin is null then return null; end if;
  perform zt_rate_check('pin:' || v_code, 10, interval '10 minutes');
  select id, admin_pin into v_meet, v_pin from meets where join_code = v_code limit 1;
  if v_meet is null or v_pin is null or v_pin <> trim(p_pin) then return null; end if;
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into meet_grants (token, meet_id, device_id, join_code) values (v_token, v_meet, left(coalesce(p_device_id, ''), 80), v_code);
  return v_token;
end $$;
grant execute on function zt_check_admin_pin(text, text, text) to anon, authenticated;

-- A phone that leaves the meet gives its grant back. Only the holder knows the token, so no further check is needed.
create or replace function zt_revoke_grant(p_token text) returns void
language sql security definer set search_path = public as $$
  update meet_grants set revoked_at = now() where token = coalesce(p_token, '') and revoked_at is null;
$$;
grant execute on function zt_revoke_grant(text) to anon, authenticated;

-- results + live_state: public read stays; write needs membership or a grant. The join code alone no longer writes.
do $$ declare t text; begin
  foreach t in array array['results','live_state'] loop
    execute format('drop policy if exists %1$s_write on %1$s', t);
    execute format('create policy %1$s_write on %1$s for all using (zt_is_member(meet_id) or zt_has_grant(meet_id)) with check (zt_is_member(meet_id) or zt_has_grant(meet_id))', t);
  end loop;
end $$;
