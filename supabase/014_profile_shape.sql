-- 014_profile_shape.sql (v2, 10/20, Astra P-M1): item-level shape checks for profiles.prs and profiles.socials.
-- 013 only checked the top-level type, count and size; direct REST clients could store nested objects or
-- unknown keys. These mirror cleanPRs / cleanSocials in lib/auth/profile.ts. Safe to re-run.

create or replace function zt_profile_prs_ok(p jsonb) returns boolean language sql immutable as $$
  select jsonb_typeof(p) = 'array'
     and jsonb_array_length(p) <= 3
     and not exists (
       select 1 from jsonb_array_elements(p) e
       where jsonb_typeof(e) <> 'object'
          or (select count(*) from jsonb_object_keys(e) k where k not in ('lift', 'value')) > 0
          or jsonb_typeof(e->'lift') is distinct from 'string'
          or jsonb_typeof(e->'value') is distinct from 'string'
          or char_length(e->>'lift') > 40
          or char_length(e->>'value') > 40
     );
$$;

create or replace function zt_profile_socials_ok(p jsonb) returns boolean language sql immutable as $$
  select jsonb_typeof(p) = 'object'
     and not exists (
       select 1 from jsonb_each(p) kv
       where kv.key not in ('instagram', 'tiktok', 'youtube', 'x', 'facebook', 'website')
          or jsonb_typeof(kv.value) <> 'string'
          or char_length(kv.value #>> '{}') > case when kv.key = 'website' then 200 else 60 end
     );
$$;

alter table profiles drop constraint if exists profiles_prs_shape;
alter table profiles add constraint profiles_prs_shape check (zt_profile_prs_ok(prs) and pg_column_size(prs) <= 2000);
alter table profiles drop constraint if exists profiles_socials_shape;
alter table profiles add constraint profiles_socials_shape check (zt_profile_socials_ok(socials) and pg_column_size(socials) <= 2000);
