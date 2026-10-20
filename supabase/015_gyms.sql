-- 015_gyms.sql (v2, 10/20, Kurt): the Gym Directory moves from fixtures to a table. Rows are collected from each
-- gym's own website (Argon rounds, page-verified by Slate) and start as `unclaimed`; the owner claims the listing
-- later (ROADMAP section 6). Public read for everything not removed. No anon/authenticated writes yet: the loader
-- runs with the service role, claims arrive through `gym_claims` below. Safe to re-run. Staging first, prod on Kurt's go.

create table if not exists gyms (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique,
  name                  text not null,
  status                text not null default 'unclaimed',
  owner_id              uuid references auth.users(id) on delete set null,
  gym_type              text not null default 'mixed',
  street_address        text not null default '',
  city                  text not null default '',
  state                 text not null default '',
  zip                   text not null default '',
  lat                   double precision,
  lng                   double precision,
  website_url           text not null default '',
  phone                 text not null default '',
  instagram             text not null default '',
  contact               text not null default '',
  day_pass_availability text not null default 'not_provided',
  day_pass_price        text not null default '',
  day_pass_url          text not null default '',
  drop_in_policy        text not null default '',
  drop_in_hours         text not null default '',
  equipment             text[] not null default '{}',
  equipment_notes       jsonb not null default '{}'::jsonb,
  socials               jsonb not null default '{}'::jsonb,
  source_url            text not null default '',
  source_evidence       text not null default '',
  confidence            text not null default 'medium',
  last_verified         date,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table gyms drop constraint if exists gyms_status_chk;
alter table gyms add constraint gyms_status_chk check (status in ('unclaimed', 'claimed', 'removed'));
alter table gyms drop constraint if exists gyms_type_chk;
alter table gyms add constraint gyms_type_chk check (gym_type in ('strongman', 'powerlifting', 'mixed'));
alter table gyms drop constraint if exists gyms_day_pass_chk;
alter table gyms add constraint gyms_day_pass_chk check (day_pass_availability in ('available', 'by_appointment', 'not_available', 'not_provided'));
alter table gyms drop constraint if exists gyms_confidence_chk;
alter table gyms add constraint gyms_confidence_chk check (confidence in ('high', 'medium', 'low'));
alter table gyms drop constraint if exists gyms_slug_chk;
alter table gyms add constraint gyms_slug_chk check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80);
alter table gyms drop constraint if exists gyms_len_chk;
alter table gyms add constraint gyms_len_chk check (
  char_length(name) <= 120 and char_length(street_address) <= 160 and char_length(city) <= 80 and char_length(state) <= 2
  and char_length(zip) <= 10 and char_length(website_url) <= 300 and char_length(phone) <= 30 and char_length(instagram) <= 60
  and char_length(contact) <= 200 and char_length(day_pass_price) <= 60 and char_length(day_pass_url) <= 300
  and char_length(drop_in_policy) <= 600 and char_length(drop_in_hours) <= 200 and char_length(source_url) <= 300
  and char_length(source_evidence) <= 1000 and pg_column_size(equipment_notes) <= 4000 and pg_column_size(socials) <= 2000
);

create index if not exists gyms_state_idx on gyms (state);
create index if not exists gyms_status_idx on gyms (status);

alter table gyms enable row level security;
drop policy if exists gyms_public_read on gyms;
create policy gyms_public_read on gyms for select to anon, authenticated using (status <> 'removed');
-- owner_id stays out of the public grant; a claimed listing shows "Claimed" without saying by whom.
revoke all on gyms from anon, authenticated;
grant select (id, slug, name, status, gym_type, street_address, city, state, zip, lat, lng, website_url, phone, instagram, contact,
  day_pass_availability, day_pass_price, day_pass_url, drop_in_policy, drop_in_hours, equipment, equipment_notes, socials,
  source_url, source_evidence, confidence, last_verified, created_at, updated_at) on gyms to anon, authenticated;

drop trigger if exists gyms_touch on gyms;
create or replace function zt_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger gyms_touch before update on gyms for each row execute function zt_touch_updated_at();

-- ---------- gym_claims: "Gym owner? Claim it" and "Not right? Report it", one table ----------
-- Anyone can file one; nobody but the service role reads them (Kurt reviews by SQL until the approval page exists).
create table if not exists gym_claims (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references gyms(id) on delete cascade,
  kind        text not null default 'claim',
  name        text not null,
  email       text not null,
  role        text not null default '',
  message     text not null default '',
  user_id     uuid references auth.users(id) on delete set null,
  status      text not null default 'pending',
  created_at  timestamptz not null default now()
);
alter table gym_claims drop constraint if exists gym_claims_kind_chk;
alter table gym_claims add constraint gym_claims_kind_chk check (kind in ('claim', 'report'));
alter table gym_claims drop constraint if exists gym_claims_status_chk;
alter table gym_claims add constraint gym_claims_status_chk check (status in ('pending', 'approved', 'rejected'));
alter table gym_claims drop constraint if exists gym_claims_len_chk;
alter table gym_claims add constraint gym_claims_len_chk check (
  char_length(name) between 1 and 80 and char_length(email) between 3 and 120 and position('@' in email) > 1
  and char_length(role) <= 40 and char_length(message) <= 1000
);
create index if not exists gym_claims_gym_idx on gym_claims (gym_id);

alter table gym_claims enable row level security;
revoke all on gym_claims from anon, authenticated;
drop policy if exists gym_claims_insert on gym_claims;
-- No table grants for anon/authenticated at all: claims go in through the RPC below and a filed claim is between the
-- filer and Kurt. (A direct insert with return=representation would also need select, which we do not want to give.)

create or replace function zt_file_gym_claim(p_gym_id uuid, p_kind text, p_name text, p_email text, p_role text, p_message text)
returns void language plpgsql security definer set search_path = public as $$
declare v_recent int;
begin
  if p_kind not in ('claim', 'report') then raise exception 'bad kind'; end if;
  if not exists (select 1 from gyms where id = p_gym_id and status <> 'removed') then raise exception 'unknown gym'; end if;
  -- the same email may file at most 5 claims or reports an hour; enough for a human, a wall for a script
  select count(*) into v_recent from gym_claims where lower(email) = lower(trim(p_email)) and created_at > now() - interval '1 hour';
  if v_recent >= 5 then raise exception 'too many requests from this email; try again later'; end if;
  insert into gym_claims (gym_id, kind, name, email, role, message, user_id)
  values (p_gym_id, p_kind, left(trim(p_name), 80), left(trim(p_email), 120), left(coalesce(p_role, ''), 40), left(coalesce(p_message, ''), 1000), auth.uid());
end $$;
revoke all on function zt_file_gym_claim(uuid, text, text, text, text, text) from public;
grant execute on function zt_file_gym_claim(uuid, text, text, text, text, text) to anon, authenticated;
