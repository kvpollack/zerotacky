-- 039: fixes from Astra's 11/3 builds audit (audits/astra-2026-11-03-builds.md). Safe to re-run.
--   BLD-01  the slug of a meet with submitted results is frozen in every write path (trigger on meets)
--   BLD-07  exact ISO date text before the cast, links over 500 chars refused, real US state codes
--   BLD-09  "today" for show-day expiry and the past-date check is the US show day (America/Los_Angeles)
--   BLD-10  duplicate registration links are matched on a canonical key (scheme, www., trailing slash, host case)
--           and held by a unique index on pending/listed rows, so concurrent submits cannot both land
--   BLD-11  the admin queue refuses a non-admin with 42501 instead of returning []

-- ---------- BLD-01 ----------
create or replace function zt_meets_freeze_slug() returns trigger language plpgsql as $$
begin
  if old.results_submitted_at is not null and new.slug is distinct from old.slug then
    raise exception 'the meet address is frozen once results are submitted: it is the federation results link and the board QR'
      using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists meets_freeze_slug on meets;
create trigger meets_freeze_slug before update of slug on meets
  for each row execute function zt_meets_freeze_slug();

-- ---------- BLD-09: one show-day clock for the query, the validation and the queue window ----------
-- The calendar is US-only for now. Midnight in Los Angeles is the last moment any US show on that date can still be
-- running, so a listing stays up through its whole show day everywhere and comes down the day after.
create or replace function zt_us_show_day() returns date language sql stable as $$
  select (now() at time zone 'America/Los_Angeles')::date
$$;
grant execute on function zt_us_show_day() to anon, authenticated;

-- ---------- BLD-10: canonical link key ----------
-- "HTTPS://www.Example.com/Events/1/" and "http://example.com/Events/1" are the same page; "/Events/1" and "/events/1"
-- may not be (case-sensitive paths and tokens), so only the scheme, www., host case and trailing slashes fold.
create or replace function zt_external_url_key(p text) returns text language plpgsql immutable as $$
declare s text; host text; path text; tail text;
begin
  s := regexp_replace(trim(coalesce(p, '')), '^https?://', '', 'i');
  s := regexp_replace(s, '^www\.', '', 'i');
  host := lower(coalesce(substring(s from '^[^/?#]+'), ''));
  s := substr(s, length(host) + 1);
  path := coalesce(substring(s from '^[^?#]*'), '');
  tail := substr(s, length(path) + 1);              -- the query string and fragment, untouched
  path := regexp_replace(path, '/+$', '');
  return host || path || tail;
end $$;

alter table external_shows add column if not exists url_key text generated always as (zt_external_url_key(registration_url)) stored;
create unique index if not exists external_shows_live_key on external_shows (url_key) where status in ('pending', 'listed');

-- ---------- BLD-07 + BLD-09 + BLD-10: submit ----------
create or replace function zt_submit_external_show(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v_url text; v_date_txt text; v_date date; v_state text; r external_shows%rowtype;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'sign in to list a show' using errcode = '42501';
  end if;
  v_url := trim(coalesce(p_input->>'registration_url', ''));
  if v_url !~* '^https?://[^\s]+\.[^\s]+$' then
    raise exception 'the registration link must be a full web address starting with http:// or https://' using errcode = 'P0001';
  end if;
  if length(v_url) > 500 then
    raise exception 'the registration link is too long (500 characters at most)' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_input->>'name', ''))) < 3 then
    raise exception 'give the show a name' using errcode = 'P0001';
  end if;
  v_date_txt := trim(coalesce(p_input->>'date', ''));
  if v_date_txt !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'the date must be YYYY-MM-DD' using errcode = 'P0001';
  end if;
  begin
    v_date := v_date_txt::date;
  exception when others then
    raise exception 'the date must be YYYY-MM-DD' using errcode = 'P0001';
  end;
  if v_date < zt_us_show_day() then
    raise exception 'the show date has already passed' using errcode = 'P0001';
  end if;
  v_state := upper(trim(coalesce(p_input->>'state', '')));
  if v_state not in ('AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY') then
    raise exception 'state must be a US two-letter code' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_input->>'city', ''))) < 2 then
    raise exception 'give the city' using errcode = 'P0001';
  end if;
  -- one pending or listed row per link; the unique index catches the race the exists() cannot
  if exists (select 1 from external_shows e where e.url_key = zt_external_url_key(v_url) and e.status in ('pending', 'listed')) then
    raise exception 'that registration link is already listed or awaiting review' using errcode = 'P0001';
  end if;
  begin
    insert into external_shows (name, date, city, state, facility_name, federation, divisions_note, registration_url, source, status, submitted_by, submitter_note)
    values (
      left(trim(p_input->>'name'), 120), v_date, left(trim(p_input->>'city'), 80), v_state,
      nullif(left(trim(coalesce(p_input->>'facility_name', '')), 120), ''),
      nullif(left(trim(coalesce(p_input->>'federation', '')), 80), ''),
      nullif(left(trim(coalesce(p_input->>'divisions_note', '')), 400), ''),
      v_url,
      case when zt_is_admin() then 'admin' else 'promoter' end,
      case when zt_is_admin() then 'listed' else 'pending' end,
      v_uid,
      nullif(left(trim(coalesce(p_input->>'submitter_note', '')), 400), '')
    ) returning * into r;
  exception when unique_violation then
    raise exception 'that registration link is already listed or awaiting review' using errcode = 'P0001';
  end;
  return jsonb_build_object('id', r.id, 'status', r.status);
end $$;
revoke all on function zt_submit_external_show(jsonb) from public, anon;
grant execute on function zt_submit_external_show(jsonb) to authenticated;

-- ---------- BLD-11: admin queue refuses non-admins ----------
create or replace function zt_admin_external_shows()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not zt_is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  return (
    select coalesce(jsonb_agg(row_to_json(q)::jsonb order by q.status = 'pending' desc, q.date asc), '[]'::jsonb)
    from (
      select e.id, e.name, e.date, e.city, e.state, e.facility_name, e.federation, e.divisions_note, e.registration_url,
             e.source, e.status, e.submitter_note, e.admin_note, e.reviewed_at, e.created_at, e.updated_at,
             p.username as submitted_by_username
      from external_shows e
      left join profiles p on p.id = e.submitted_by
      where e.status = 'pending' or e.date >= zt_us_show_day() - 7
    ) q
  );
end $$;
revoke all on function zt_admin_external_shows() from public, anon;
grant execute on function zt_admin_external_shows() to authenticated;
