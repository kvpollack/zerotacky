select jsonb_build_object(
 'grants', (select jsonb_agg(x order by x) from (select grantee||' '||table_name||' '||privilege_type as x from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated')) t),
 'colpriv', (select jsonb_agg(x order by x) from (select grantee||' '||table_name||'.'||column_name||' '||privilege_type as x from information_schema.column_privileges where table_schema='public' and grantee in ('anon','authenticated')) t),
 'policies', (select jsonb_agg(x order by x) from (select tablename||' '||policyname||' '||cmd||' '||coalesce(roles::text,'')||' '||coalesce(qual,'')||' '||coalesce(with_check,'') as x from pg_policies where schemaname='public') t),
 'rls', (select jsonb_agg(x order by x) from (select relname||' '||relrowsecurity::text as x from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r') t),
 'functions', (select jsonb_agg(x order by x) from (select p.proname||'('||pg_get_function_identity_arguments(p.oid)||') '||p.prosecdef::text||' '||coalesce(array_to_string(p.proconfig,','),'') as x from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public') t),
 'fn_grants', (select jsonb_agg(x order by x) from (select grantee||' '||routine_name as x from information_schema.routine_privileges where specific_schema='public' and grantee in ('anon','authenticated')) t),
 'triggers', (select jsonb_agg(x order by x) from (select event_object_table||' '||trigger_name||' '||event_manipulation as x from information_schema.triggers where trigger_schema in ('public','auth')) t),
 'columns', (select jsonb_agg(x order by x) from (select table_name||'.'||column_name||' '||data_type||' '||is_nullable||' '||coalesce(column_default,'') as x from information_schema.columns where table_schema='public') t),
 'constraints', (select jsonb_agg(x order by x) from (select conrelid::regclass::text||' '||conname||' '||pg_get_constraintdef(oid) as x from pg_constraint where connamespace='public'::regnamespace) t),
 'indexes', (select jsonb_agg(x order by x) from (select indexdef as x from pg_indexes where schemaname='public') t),
 'defacl', (select jsonb_agg(x order by x) from (select defaclrole::regrole::text||' '||defaclobjtype::text||' '||defaclacl::text as x from pg_default_acl d join pg_namespace n on n.oid=d.defaclnamespace where n.nspname='public') t)
) as perms;
