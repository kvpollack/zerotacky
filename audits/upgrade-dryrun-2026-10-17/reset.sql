-- Reset the disposable upgrade-test project to empty WITHOUT dropping schema public (that would lose Supabase's
-- supabase_admin default ACLs, which postgres cannot recreate). Drops every object the migrations create.
drop trigger if exists on_auth_user_created on auth.users;
do $$ declare r record; begin
  for r in select viewname from pg_views where schemaname = 'public' loop
    execute format('drop view if exists public.%I cascade', r.viewname); end loop;
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('drop table if exists public.%I cascade', r.tablename); end loop;
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' loop
    execute 'drop function if exists ' || r.sig || ' cascade'; end loop;
  for r in select t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace
           where n.nspname = 'public' and t.typtype in ('e','d') loop
    execute format('drop type if exists public.%I cascade', r.typname); end loop;
end $$;
-- undo 008's default-privilege revoke so the pre-upgrade tables get the same default grants a fresh project gives
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated;
delete from auth.users where email like 'upgrade-%@example.com';
select (select count(*) from pg_tables where schemaname='public') as tables,
       (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public') as functions,
       (select count(*) from pg_views where schemaname='public') as views,
       (select count(*) from auth.users) as users,
       (select defaclacl::text from pg_default_acl d join pg_namespace n on n.oid=d.defaclnamespace where n.nspname='public' and defaclrole='postgres'::regrole and defaclobjtype='r') as table_defacl;
