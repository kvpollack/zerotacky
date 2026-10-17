-- 004_result_guard.sql (10/17): recorded results are never deleted as a side effect of a roster or config change.
-- Applies to prod (001 + 002 schema) and to v2 staging (001..003) unchanged; numbering is shared across branches
-- (003 is v2's auth migration). Safe to re-run.
--
-- Why: zt_publish_meet removes athletes/events/divisions that the admin phone no longer sends, and the FKs cascade
-- into results, so a stale publish (or a judge phone's DELETE with the join code) could erase locked scores.
-- Astra finding A3, 2026-10-17. A BEFORE DELETE trigger on the three parent tables refuses the delete while any
-- result still points at the row. Two deliberate exceptions:
--   1. deleting the meet itself (retiring a meet; cascade order means the meets row is already gone when the
--      child triggers fire, so `not exists meets` identifies that case);
--   2. a session that set `select set_config('zt.allow_result_delete', 'on', true)` (for an explicit reset RPC;
--      nothing uses it yet).
-- Deleting rows from `results` directly (the meet-day wipe in PHASE1_SYNC_NOTES step 5) is unaffected.
--
-- Phone impact: an admin who deleted a scored athlete locally gets "<name> has N recorded result(s)..." in the Sync
-- panel on the next publish and nothing is saved from that publish; scratch the athlete (status withdrawn) instead,
-- or Reset scores first. Verify after applying:
--   select tgname, tgrelid::regclass from pg_trigger where tgname like 'zt_guard_results%';

create or replace function zt_guard_results() returns trigger language plpgsql as $$
declare n int; what text;
begin
  if not exists (select 1 from meets where id = old.meet_id) then return old; end if;          -- whole meet going away
  if coalesce(current_setting('zt.allow_result_delete', true), '') = 'on' then return old; end if;
  if tg_table_name = 'athletes' then
    select count(*) into n from results where meet_id = old.meet_id and athlete_id = old.id;
    what := 'Athlete ' || coalesce(old.name, old.id);
  elsif tg_table_name = 'events' then
    select count(*) into n from results where meet_id = old.meet_id and event_id = old.id;
    what := 'Event ' || coalesce(old.name, old.id);
  else
    select count(*) into n from results r join athletes a on a.meet_id = r.meet_id and a.id = r.athlete_id
      where a.meet_id = old.meet_id and a.division_id = old.id;
    what := 'Division ' || coalesce(old.name, old.id);
  end if;
  if n > 0 then
    raise exception '% has % recorded result(s) and cannot be removed. Mark the athlete withdrawn, or Reset scores first.', what, n
      using errcode = 'P0001';
  end if;
  return old;
end $$;

drop trigger if exists zt_guard_results_athletes on athletes;
create trigger zt_guard_results_athletes before delete on athletes for each row execute function zt_guard_results();
drop trigger if exists zt_guard_results_events on events;
create trigger zt_guard_results_events before delete on events for each row execute function zt_guard_results();
drop trigger if exists zt_guard_results_divisions on divisions;
create trigger zt_guard_results_divisions before delete on divisions for each row execute function zt_guard_results();
