-- 038_external_shows.sql (11/3; feature 2 of the feature report, the curated external-listing calendar MVP).
-- Apply on staging, test, then prod.
--
-- /shows lists only meets built in ZeroTacky. External shows are competitions registered elsewhere (Iron Podium,
-- Eventbrite, a promoter's own site): name, date, venue, federation, divisions note and a link out. A signed-in user
-- submits one (status 'pending'); an admin (zt_admins, 017) lists or hides it. Only 'listed' rows with a date from
-- today on are public. No scraping: rows come from promoters and admins (feature report, item 2).
--
-- Verify after apply:
--   select proname from pg_proc where proname in ('zt_submit_external_show', 'zt_review_external_show', 'zt_admin_external_shows');
--   select policyname from pg_policies where tablename = 'external_shows';

create table if not exists external_shows (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  date date not null,
  city text not null,
  state text not null,
  facility_name text,
  federation text,
  divisions_note text,
  registration_url text not null,
  source text not null default 'promoter' check (source in ('promoter', 'admin')),
  status text not null default 'pending' check (status in ('pending', 'listed', 'hidden')),
  submitted_by uuid references auth.users(id) on delete set null,
  submitter_note text,
  admin_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists external_shows_listed_date on external_shows (status, date);

alter table external_shows enable row level security;
drop policy if exists external_shows_public_read on external_shows;
create policy external_shows_public_read on external_shows for select using (status = 'listed');
revoke all on external_shows from anon, authenticated;
grant select (id, name, date, city, state, facility_name, federation, divisions_note, registration_url, source, status, updated_at)
  on external_shows to anon, authenticated;

-- ---------- 1. submit (signed in; lands pending) ----------
create or replace function zt_submit_external_show(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v_url text; v_date date; v_state text; r external_shows%rowtype;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'sign in to list a show' using errcode = '42501';
  end if;
  v_url := trim(coalesce(p_input->>'registration_url', ''));
  if v_url !~* '^https?://[^\s]+\.[^\s]+$' then
    raise exception 'the registration link must be a full web address starting with http:// or https://' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_input->>'name', ''))) < 3 then
    raise exception 'give the show a name' using errcode = 'P0001';
  end if;
  begin
    v_date := (p_input->>'date')::date;
  exception when others then
    raise exception 'the date must be YYYY-MM-DD' using errcode = 'P0001';
  end;
  if v_date < current_date then
    raise exception 'the show date has already passed' using errcode = 'P0001';
  end if;
  v_state := upper(trim(coalesce(p_input->>'state', '')));
  if v_state !~ '^[A-Z]{2}$' then
    raise exception 'state must be the two-letter code' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_input->>'city', ''))) < 2 then
    raise exception 'give the city' using errcode = 'P0001';
  end if;
  -- one pending or listed row per link: the second submission of the same show is refused, not duplicated
  if exists (select 1 from external_shows e where lower(e.registration_url) = lower(v_url) and e.status in ('pending', 'listed')) then
    raise exception 'that registration link is already listed or awaiting review' using errcode = 'P0001';
  end if;
  insert into external_shows (name, date, city, state, facility_name, federation, divisions_note, registration_url, source, status, submitted_by, submitter_note)
  values (
    left(trim(p_input->>'name'), 120), v_date, left(trim(p_input->>'city'), 80), v_state,
    nullif(left(trim(coalesce(p_input->>'facility_name', '')), 120), ''),
    nullif(left(trim(coalesce(p_input->>'federation', '')), 80), ''),
    nullif(left(trim(coalesce(p_input->>'divisions_note', '')), 400), ''),
    left(v_url, 500),
    case when zt_is_admin() then 'admin' else 'promoter' end,
    case when zt_is_admin() then 'listed' else 'pending' end,
    v_uid,
    nullif(left(trim(coalesce(p_input->>'submitter_note', '')), 400), '')
  ) returning * into r;
  return jsonb_build_object('id', r.id, 'status', r.status);
end $$;
revoke all on function zt_submit_external_show(jsonb) from public, anon;
grant execute on function zt_submit_external_show(jsonb) to authenticated;

-- ---------- 2. admin queue + review ----------
create or replace function zt_admin_external_shows()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(q)::jsonb order by q.status = 'pending' desc, q.date asc), '[]'::jsonb)
  from (
    select e.id, e.name, e.date, e.city, e.state, e.facility_name, e.federation, e.divisions_note, e.registration_url,
           e.source, e.status, e.submitter_note, e.admin_note, e.reviewed_at, e.created_at, e.updated_at,
           p.username as submitted_by_username
    from external_shows e
    left join profiles p on p.id = e.submitted_by
    where zt_is_admin() and (e.status = 'pending' or e.date >= current_date - 7)
  ) q
$$;
revoke all on function zt_admin_external_shows() from public, anon;
grant execute on function zt_admin_external_shows() to authenticated;

create or replace function zt_review_external_show(p_id uuid, p_status text, p_admin_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r external_shows%rowtype;
begin
  if not zt_is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if p_status not in ('listed', 'hidden', 'pending') then raise exception 'status must be listed, hidden or pending' using errcode = 'P0001'; end if;
  update external_shows
     set status = p_status, admin_note = coalesce(nullif(trim(p_admin_note), ''), admin_note), reviewed_at = now(), updated_at = now()
   where id = p_id
   returning * into r;
  if not found then raise exception 'listing not found' using errcode = 'P0002'; end if;
  return jsonb_build_object('id', r.id, 'status', r.status);
end $$;
revoke all on function zt_review_external_show(uuid, text, text) from public, anon;
grant execute on function zt_review_external_show(uuid, text, text) to authenticated;
