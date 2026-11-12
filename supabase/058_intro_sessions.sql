-- 058 (2026-11-11): gym "intro strongman sessions" tag (Kurt's newcomer path: someone eight weeks from zero needs a place
-- that will teach them, not just a gym with a log). Three listing columns the owner edits and anyone reads:
--   intro_sessions      yes | on_request | no | not_provided   (default not_provided; the directory filter keeps yes + on_request)
--   intro_sessions_note free text, 300 chars ("Saturdays 10 am, $20, beginners only, email to book")
--   intro_sessions_url  booking or info link, 300 chars
-- Column grants are additive on top of 030 (select to anon/authenticated, update to the owner); RLS from 016 unchanged.
-- Safe to re-run. Verify:
--   select column_name from information_schema.columns where table_name='gyms' and column_name like 'intro_sessions%'; -- 3 rows
--   select grantee, column_name from information_schema.column_privileges where table_name='gyms' and column_name='intro_sessions' and privilege_type='UPDATE'; -- authenticated

alter table gyms add column if not exists intro_sessions text not null default 'not_provided';
alter table gyms add column if not exists intro_sessions_note text not null default '';
alter table gyms add column if not exists intro_sessions_url text not null default '';

alter table gyms drop constraint if exists gyms_intro_sessions_chk;
alter table gyms add constraint gyms_intro_sessions_chk check (
  intro_sessions in ('yes', 'on_request', 'no', 'not_provided')
  and char_length(intro_sessions_note) <= 300
  and char_length(intro_sessions_url) <= 300
);

grant select (intro_sessions, intro_sessions_note, intro_sessions_url) on gyms to anon, authenticated;
grant update (intro_sessions, intro_sessions_note, intro_sessions_url) on gyms to authenticated;
