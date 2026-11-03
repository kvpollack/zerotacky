-- 037_results_retention.sql (11/3; feature 1 of the feature report, Astra FG-02). Apply on staging, test, then prod.
--
-- Strongman Corporation accepts a live results link in place of an emailed sheet only if it stays viewable for 365
-- days. Today a completed meet can be set to cancelled on the Listing tab and then deleted, and the public show page
-- needs is_public_listed, so a results URL is not permanent. Once the promoter marks the results as submitted:
--   1. meets.results_submitted_at is set (once; never cleared by the app).
--   2. zt_delete_meet refuses the meet whatever its competition_status. Unlisting still hides it from /shows.
--   3. The website loader (lib/website/data.ts getPublicShowBySlug) serves the show page when results_submitted_at is
--      set even if is_public_listed is false, so the results URL in the federation email keeps working.
-- zt_get_my_meet carries the column to the promoter editor. zt_mark_results_submitted is owner-only and requires a
-- completed meet with final results.
--
-- Verify after apply:
--   select column_name from information_schema.columns where table_name = 'meets' and column_name = 'results_submitted_at';
--   select proname from pg_proc where proname in ('zt_mark_results_submitted', 'zt_delete_meet', 'zt_get_my_meet');

alter table meets add column if not exists results_submitted_at timestamptz;
grant select (results_submitted_at) on meets to anon, authenticated;

-- ---------- 1. mark results submitted (owner only; completed + final) ----------
create or replace function zt_mark_results_submitted(p_meet_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m meets%rowtype; v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'sign in to mark results as submitted' using errcode = '42501';
  end if;
  select * into m from meets where id = p_meet_id for update;
  if not found then
    raise exception 'meet not found' using errcode = 'P0002';
  end if;
  if m.owner_id is distinct from v_uid then
    raise exception 'only the promoter who owns this meet can mark its results as submitted' using errcode = '42501';
  end if;
  if m.competition_status <> 'completed' or m.results_status <> 'final' then
    raise exception 'finalize the results first: the meet must be completed with final results before they can be marked as submitted'
      using errcode = 'P0001';
  end if;
  if m.results_submitted_at is null then
    update meets set results_submitted_at = now() where id = p_meet_id;
  end if;
  select * into m from meets where id = p_meet_id;
  return jsonb_build_object('id', m.id, 'results_submitted_at', m.results_submitted_at);
end $$;
revoke all on function zt_mark_results_submitted(uuid) from public, anon;
grant execute on function zt_mark_results_submitted(uuid) to authenticated;

-- ---------- 2. delete meet: 010 body + the submitted-results guard ----------
create or replace function zt_delete_meet(p_meet_id uuid, p_confirm_name text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m meets%rowtype; v_uid uuid; v_div int; v_ev int; v_ath int; v_res int; v_reg int;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'sign in to delete a meet' using errcode = '42501';
  end if;
  select * into m from meets where id = p_meet_id for update;
  if not found then
    raise exception 'meet not found' using errcode = 'P0002';
  end if;
  if m.owner_id is distinct from v_uid then
    raise exception 'only the promoter who owns this meet can delete it' using errcode = '42501';
  end if;
  if m.results_submitted_at is not null then
    raise exception 'the results of this meet were submitted to the federation on %. It cannot be deleted; unlist it on the Listing tab to hide it.',
      to_char(m.results_submitted_at, 'YYYY-MM-DD') using errcode = 'P0001';
  end if;
  if m.competition_status in ('live', 'completed') then
    raise exception 'a % meet cannot be deleted. Set it to cancelled on the Listing tab first, or leave it as a record.',
      m.competition_status using errcode = 'P0001';
  end if;

  select count(*) into v_div from divisions     where meet_id = p_meet_id;
  select count(*) into v_ev  from events        where meet_id = p_meet_id;
  select count(*) into v_ath from athletes      where meet_id = p_meet_id;
  select count(*) into v_res from results       where meet_id = p_meet_id;
  select count(*) into v_reg from registrations where meet_id = p_meet_id;

  if (v_div + v_ev + v_ath + v_res + v_reg) > 0
     and lower(trim(coalesce(p_confirm_name, ''))) <> lower(trim(m.name)) then
    raise exception 'this meet has data associated with it. Type the meet name exactly to confirm deletion.'
      using errcode = 'P0001';
  end if;

  perform set_config('zt.allow_result_delete', 'on', true);   -- transaction-local; 004 guard stands down
  delete from meets where id = p_meet_id;                      -- cascades: meet_members, divisions, events, athletes, results, live_state, registrations

  return jsonb_build_object('id', p_meet_id, 'name', m.name,
    'deleted', jsonb_build_object('divisions', v_div, 'events', v_ev, 'athletes', v_ath, 'results', v_res, 'registrations', v_reg));
end $$;
revoke all on function zt_delete_meet(uuid, text) from public, anon;
grant execute on function zt_delete_meet(uuid, text) to authenticated;

-- ---------- 3. zt_get_my_meet: 032 body + results_submitted_at ----------
create or replace function zt_get_my_meet(p_meet_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid; v_out jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Sign in required to view meet configuration.' using errcode = 'P0001';
  end if;
  if not zt_is_owner_or_member(p_meet_id) then
    return null;
  end if;

  select row_to_json(q)::jsonb into v_out
  from (
    select
      m.id, m.slug, m.name, m.date, m.owner_id, m.join_code, m.admin_pin,
      m.run_order_method, m.tiebreaker_rule, m.available_plates, m.collar_weight_per_pair,
      m.stations, m.is_demo, m.created_at, m.updated_at,
      m.competition_status, m.registration_status, m.results_status, m.is_public_listed,
      m.venue, m.federation, m.entry_fee_display, m.registration_deadline, m.athlete_cap, m.promoter_contact,
      m.host_gym_id, m.theme, m.auto_accept, m.results_submitted_at,
      (select count(*)::int from divisions d where d.meet_id = m.id) as division_count,
      (select count(*)::int from athletes a where a.meet_id = m.id) as athlete_count,
      (select count(*)::int from registrations r where r.meet_id = m.id and r.status in ('pending', 'waitlist')) as pending_count,
      (select count(*)::int from registrations r where r.meet_id = m.id and r.status = 'accepted') as registration_count
    from meets m
    where m.id = p_meet_id
  ) q;

  return v_out;
end $$;
