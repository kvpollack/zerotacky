-- 025_athlete_writes_need_grant.sql (10/26, Astra LT-01): the join code alone no longer writes athlete rows.
--
-- Before: `athletes_join_write` (001) was FOR ALL on the whole row for anyone carrying the public join code, so a
-- spectator could rename, re-divide, scratch or delete (unscored) athletes. 011 moved results/live_state to PIN-issued
-- grants but left this policy for the pit crew, whose only write is a rack-pin height per event and who are not asked
-- for the PIN.
--
-- After: athlete rows are written by members (athletes_write, unchanged) or grant holders (judge / promoter phones that
-- entered the PIN; walk-ons and scratches from the floor keep working there). The pit crew's rack pins go through
-- zt_set_rack_heights, which checks the join code and touches only `rack_heights`, merging per event key so two pit
-- crews editing different events do not clobber each other. Client: lib/sync/controller.ts flush() routes athlete
-- rows from a grantless joined phone through the RPC.
--
-- Verify (staging, then prod):
--   select policyname, cmd from pg_policies where tablename = 'athletes';            -- athletes_write, athletes_grant_write, athletes_read
--   select proname from pg_proc where proname = 'zt_set_rack_heights';

drop policy if exists athletes_join_write on athletes;
drop policy if exists athletes_grant_write on athletes;
create policy athletes_grant_write on athletes for all using (zt_has_grant(meet_id)) with check (zt_has_grant(meet_id));

create or replace function zt_set_rack_heights(p_meet_id uuid, p_athlete_id text, p_rack_heights jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_out jsonb;
begin
  if not (zt_has_join(p_meet_id) or zt_has_grant(p_meet_id) or zt_is_member(p_meet_id)) then
    raise exception 'join code does not match this meet' using errcode = '42501';
  end if;
  if p_rack_heights is null or jsonb_typeof(p_rack_heights) <> 'object' then
    raise exception 'rack heights must be an object of event id -> height' using errcode = '22023';
  end if;
  if pg_column_size(p_rack_heights) > 4000 or exists (
    select 1 from jsonb_each(p_rack_heights) kv where jsonb_typeof(kv.value) not in ('string', 'number', 'null') or length(kv.value::text) > 60
  ) then
    raise exception 'rack heights too large' using errcode = '22023';
  end if;
  update athletes set rack_heights = coalesce(rack_heights, '{}'::jsonb) || p_rack_heights
  where meet_id = p_meet_id and id = p_athlete_id
  returning rack_heights into v_out;
  if not found then
    raise exception 'no such athlete on this meet' using errcode = 'P0002';
  end if;
  return v_out;
end $$;
revoke execute on function zt_set_rack_heights(uuid, text, jsonb) from public;
grant execute on function zt_set_rack_heights(uuid, text, jsonb) to anon, authenticated, service_role;
