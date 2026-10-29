-- 035_membership_cards.sql (10/29, ROADMAP "Org membership cards on profiles", Kurt 10/19 and 10/29):
-- an athlete keeps a photo of each federation membership card on their account with the expiry date typed in; the
-- promoter's Registrations tab shows "USS, expires 2027-03-01, card on file" for every registrant who has one, so
-- nobody checks paper at weigh-in. No issuer has a lookup we can trust: the image is the evidence, the date is
-- self-declared, and the UI says so.
--
--   membership_cards        one row per card, owner-only through RLS (select/insert/update/delete on user_id = auth.uid())
--   membership-cards bucket PRIVATE. Owner folder <uid>/... for writes and reads; a meet owner/member may read the
--                           folder of an athlete with a live registration on one of their meets (zt_can_view_cards).
--   zt_registration_cards(p_meet_id)  owner/member only: cards for the meet's registrants, keyed by registration id.
--
-- Deleting the account cascades the rows; the objects are removed by the account-deletion path (storage policies
-- let the owner delete their own folder).

create table if not exists membership_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  federation text not null check (federation in ('strongman_corporation', 'united_states_strongman', 'other')),
  federation_other text check (federation_other is null or (length(federation_other) between 1 and 60)),
  member_number text check (member_number is null or length(member_number) <= 40),
  expires_on date not null,
  image_path text not null check (length(image_path) between 3 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint membership_cards_other_named check (federation <> 'other' or federation_other is not null),
  constraint membership_cards_own_folder check (image_path like (user_id::text || '/%'))
);
create index if not exists membership_cards_user_idx on membership_cards (user_id);

alter table membership_cards enable row level security;
drop policy if exists membership_cards_own_select on membership_cards;
create policy membership_cards_own_select on membership_cards for select to authenticated using (user_id = auth.uid());
drop policy if exists membership_cards_own_insert on membership_cards;
create policy membership_cards_own_insert on membership_cards for insert to authenticated with check (user_id = auth.uid());
drop policy if exists membership_cards_own_update on membership_cards;
create policy membership_cards_own_update on membership_cards for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists membership_cards_own_delete on membership_cards;
create policy membership_cards_own_delete on membership_cards for delete to authenticated using (user_id = auth.uid());
revoke all on membership_cards from public, anon;
grant select, insert, update (federation, federation_other, member_number, expires_on, image_path, updated_at), delete on membership_cards to authenticated;

-- May the caller see the cards of this athlete? Their own, or an athlete with a live registration on a meet the
-- caller owns or belongs to. `p_folder` is the first path segment of the object name; a non-uuid is simply "no".
create or replace function zt_can_view_cards(p_folder text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid;
begin
  if auth.uid() is null then return false; end if;
  begin
    v_uid := p_folder::uuid;
  exception when others then
    return false;
  end;
  if v_uid = auth.uid() then return true; end if;
  return exists (
    select 1 from registrations r
    where r.user_id = v_uid and r.status not in ('withdrawn', 'declined') and zt_is_owner_or_member(r.meet_id)
  );
end $$;
revoke all on function zt_can_view_cards(text) from public, anon;
grant execute on function zt_can_view_cards(text) to authenticated, service_role;

-- ---------- membership-cards bucket (private) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('membership-cards', 'membership-cards', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists cards_read on storage.objects;
create policy cards_read on storage.objects for select to authenticated
  using (bucket_id = 'membership-cards' and zt_can_view_cards((storage.foldername(name))[1]));
drop policy if exists cards_insert_own on storage.objects;
create policy cards_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'membership-cards' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists cards_update_own on storage.objects;
create policy cards_update_own on storage.objects for update to authenticated
  using (bucket_id = 'membership-cards' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'membership-cards' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists cards_delete_own on storage.objects;
create policy cards_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'membership-cards' and (storage.foldername(name))[1] = auth.uid()::text);

-- Promoter view: cards of the meet's registrants (live registrations only), keyed by registration id.
create or replace function zt_registration_cards(p_meet_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode = 'P0001'; end if;
  if not zt_is_owner_or_member(p_meet_id) then
    raise exception 'You do not have access to this meet.' using errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'registration_id', r.id,
      'id', c.id,
      'federation', c.federation,
      'federation_other', c.federation_other,
      'member_number', c.member_number,
      'expires_on', c.expires_on,
      'image_path', c.image_path
    ) order by r.id, c.expires_on desc)
    from registrations r
    join membership_cards c on c.user_id = r.user_id
    where r.meet_id = p_meet_id and r.status not in ('withdrawn', 'declined')
  ), '[]'::jsonb);
end $$;
revoke all on function zt_registration_cards(uuid) from public, anon;
grant execute on function zt_registration_cards(uuid) to authenticated, service_role;
