-- 062: archive refresh role (Kurt 11/12: "create the archive refresh role").
--
-- The weekly strongmanresults.com reload (GitHub Actions, `archive/load_sr.py`) needs a credential that can live in a
-- GitHub secret. The Management API PAT is the wrong shape for that: it runs as `postgres` and expires. This role can
-- write the five `archive_*` tables the loader touches and refresh the `archive_athletes` materialized view, nothing
-- else: no other table, no function, no `archive_links` (that one is user data: claims of archive results).
--
-- The password is set out of band (`alter role zt_archive_loader password '...'`, kept in tmp/zt/archive_loader_role.txt
-- and the GitHub secret ZT_ARCHIVE_DSN); this file never carries it. Role names are cluster-wide, so the same file runs
-- on staging and prod.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'zt_archive_loader') then
    create role zt_archive_loader login noinherit nocreatedb nocreaterole noreplication connection limit 3;
  end if;
end $$;
alter role zt_archive_loader set statement_timeout = '15min';
alter role zt_archive_loader set search_path = public;

grant usage on schema public to zt_archive_loader;
grant select, insert, update, delete on archive_sources, archive_competitions, archive_placements, archive_results to zt_archive_loader;
grant usage, select on archive_competitions_id_seq, archive_placements_id_seq, archive_results_id_seq to zt_archive_loader;
revoke all on archive_links from zt_archive_loader;

-- RLS: the archive tables carry a public read policy; the loader needs its own write policy (no bypassrls on Supabase).
do $$ declare t text; begin
  foreach t in array array['archive_sources', 'archive_competitions', 'archive_placements', 'archive_results'] loop
    execute format('drop policy if exists %I on %I', t || '_loader', t);
    execute format('create policy %I on %I for all to zt_archive_loader using (true) with check (true)', t || '_loader', t);
  end loop;
end $$;

-- The materialized view is owned by postgres; refresh needs ownership, so the loader calls this instead.
create or replace function zt_refresh_archive_athletes() returns void
language sql security definer set search_path = public as $$
  refresh materialized view archive_athletes;
$$;
revoke all on function zt_refresh_archive_athletes() from public, anon, authenticated;
grant execute on function zt_refresh_archive_athletes() to zt_archive_loader;
