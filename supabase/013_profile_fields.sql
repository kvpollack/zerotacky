-- 013_profile_fields.sql (v2, 10/20, Kurt): optional "about you" fields on profiles, plus a public avatars
-- bucket. All self-declared and only shown on the account page for now; the training directory and gym links
-- come later (ROADMAP). Safe to re-run. Staging first, prod on Kurt's go.

alter table profiles
  add column if not exists favorite_lift      text    not null default '',
  add column if not exists favorite_lift_note text    not null default '',
  add column if not exists location           text    not null default '',
  add column if not exists home_gym_name      text    not null default '',
  add column if not exists prs                jsonb   not null default '[]'::jsonb,
  add column if not exists is_trainer         boolean not null default false,
  add column if not exists trainer_in_person  boolean not null default false,
  add column if not exists trainer_online     boolean not null default false,
  add column if not exists socials            jsonb   not null default '{}'::jsonb,
  add column if not exists avatar_path        text    not null default '';

-- Caps mirror lib/auth/profile.ts cleanProfilePatch; the client trims first, the database refuses the rest.
alter table profiles drop constraint if exists profiles_about_len;
alter table profiles add constraint profiles_about_len check (
  char_length(favorite_lift) <= 40 and char_length(favorite_lift_note) <= 120 and
  char_length(location) <= 80 and char_length(home_gym_name) <= 80 and char_length(avatar_path) <= 200
);
alter table profiles drop constraint if exists profiles_prs_shape;
alter table profiles add constraint profiles_prs_shape check (jsonb_typeof(prs) = 'array' and jsonb_array_length(prs) <= 3 and pg_column_size(prs) <= 2000);
alter table profiles drop constraint if exists profiles_socials_shape;
alter table profiles add constraint profiles_socials_shape check (jsonb_typeof(socials) = 'object' and pg_column_size(socials) <= 2000);
alter table profiles drop constraint if exists profiles_avatar_own;
alter table profiles add constraint profiles_avatar_own check (avatar_path = '' or avatar_path like (id::text || '/%'));

-- 006 limits updates to named columns (never id/email/created_at); extend the list to the new fields.
grant update (favorite_lift, favorite_lift_note, location, home_gym_name, prs, is_trainer, trainer_in_person, trainer_online, socials, avatar_path)
  on profiles to authenticated;

-- ---------- avatars bucket ----------
-- Public read (a profile photo is meant to be seen), writes only inside the caller's own folder <uid>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects for select to public using (bucket_id = 'avatars');
drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
