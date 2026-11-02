-- 036_tv_control.sql (11/2, UI transition Phase 2): one row per meet telling the venue TV what to show.
--
-- live_state is one row per station with fixed columns, so a meet-wide choice (which sheet the TV draws, bright or
-- dark venue mode) had nowhere to live. tv_control holds it:
--   sheet  'a' = drawing (current event, one athlete large) | 'b' = card (standings grid)
--   mode   'home' = bright sheet (default) | 'dark' = venue toggle for dim rooms
-- The scorer writes it (same authority as live_state: a meet member or a PIN-issued grant); /m/<slug> reads it on
-- its poll and falls back to ?sheet= / ?mode= in the TV link when there is no row. No change to meets, its views or
-- zt_update_listing. Last writer wins (zt_lww) like live_state.

create table if not exists tv_control (
  meet_id uuid primary key references meets(id) on delete cascade,
  sheet text not null default 'a' check (sheet in ('a', 'b')),
  mode text not null default 'home' check (mode in ('home', 'dark')),
  updated_at timestamptz not null default now(),
  updated_by text
);

drop trigger if exists tv_control_lww on tv_control;
create trigger tv_control_lww before update on tv_control for each row execute function zt_lww();

alter table tv_control enable row level security;
drop policy if exists tv_control_read on tv_control;
create policy tv_control_read on tv_control for select using (true);
drop policy if exists tv_control_write on tv_control;
create policy tv_control_write on tv_control for all
  using (zt_is_member(meet_id) or zt_has_grant(meet_id))
  with check (zt_is_member(meet_id) or zt_has_grant(meet_id));

do $$ begin
  execute 'alter publication supabase_realtime add table tv_control';
exception when duplicate_object then null;
end $$;
