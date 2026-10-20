-- 016_gym_owner.sql (v2, 10/20, Kurt): a claimed gym is editable by its owner from "My Gym" (/website/account/gym).
-- Ownership is still granted by hand: Kurt approves a gym_claims row with zt_approve_gym_claim (service role only), which
-- sets gyms.owner_id + status = 'claimed'. From then on the owner reads their own rows through zt_my_gyms and updates the
-- listing columns below directly (RLS + column grants). Slug, status, owner_id and the Argon provenance columns stay
-- out of reach. Safe to re-run. Staging first, prod on Kurt's go.

-- ---------- equipment ids are the 25 the site knows (lib/website/gymEquipment.ts) ----------
create or replace function zt_known_equipment(p text[]) returns boolean language sql immutable as $$
  select coalesce(array_length(p, 1), 0) <= 25 and not exists (
    select 1 from unnest(p) e where e not in (
      'log','axle','yoke','farmers','frame','stones','natural_stones','sandbags','kegs','circus_db','husafell','conans_wheel',
      'viking_press','loading_platform','car_deadlift','pull_harness','arm_over_arm','tire','power_stairs','turf_lane',
      'comp_bars','calibrated_plates','monolift','combo_rack','deadlift_platform'))
$$;
alter table gyms drop constraint if exists gyms_equipment_chk;
alter table gyms add constraint gyms_equipment_chk check (zt_known_equipment(equipment));
alter table gyms drop constraint if exists gyms_state_chk;
alter table gyms add constraint gyms_state_chk check (state = '' or state ~ '^[A-Z]{2}$');
alter table gyms drop constraint if exists gyms_zip_chk;
alter table gyms add constraint gyms_zip_chk check (zip = '' or zip ~ '^[0-9]{5}(-[0-9]{4})?$');

-- ---------- owner read: own rows, every column (owner_id included) ----------
create or replace function zt_my_gyms() returns setof gyms language sql security definer stable set search_path = public as $$
  select * from gyms where owner_id = auth.uid() and status <> 'removed' order by name
$$;
revoke all on function zt_my_gyms() from public, anon, authenticated;
grant execute on function zt_my_gyms() to authenticated;

-- ---------- owner update: listing columns only, claimed rows only ----------
drop policy if exists gyms_owner_update on gyms;
create policy gyms_owner_update on gyms for update to authenticated
  using (owner_id = auth.uid() and status = 'claimed')
  with check (owner_id = auth.uid() and status = 'claimed');
grant update (name, gym_type, street_address, city, state, zip, lat, lng, website_url, phone, instagram, contact,
  day_pass_availability, day_pass_price, day_pass_url, drop_in_policy, drop_in_hours, equipment, equipment_notes, socials)
  on gyms to authenticated;

-- An owner's save is the freshest verification we have: stamp it and drop the Argon confidence label.
create or replace function zt_gyms_owner_stamp() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and new.owner_id = auth.uid() then
    new.last_verified := current_date;
    new.confidence := 'high';
  end if;
  return new;
end $$;
drop trigger if exists gyms_owner_stamp on gyms;
create trigger gyms_owner_stamp before update on gyms for each row execute function zt_gyms_owner_stamp();

-- ---------- claims: the filer can see the state of their own claims (My Gym shows "pending") ----------
drop policy if exists gym_claims_own_read on gym_claims;
create policy gym_claims_own_read on gym_claims for select to authenticated using (user_id = auth.uid());
grant select (id, gym_id, kind, status, created_at) on gym_claims to authenticated;

-- ---------- approval, by Kurt over SQL (no grants: service role only) ----------
-- select zt_approve_gym_claim('<claim id>');  -> owner_id set, status claimed, claim approved, other pending claims by the
-- same user on the same gym approved too. Fails when the claim was filed signed-out (no user to attach).
create or replace function zt_approve_gym_claim(p_claim uuid) returns gyms language plpgsql security definer set search_path = public as $$
declare c gym_claims%rowtype; g gyms%rowtype;
begin
  select * into c from gym_claims where id = p_claim;
  if not found then raise exception 'unknown claim'; end if;
  if c.kind <> 'claim' then raise exception 'not a claim (kind=%)', c.kind; end if;
  if c.user_id is null then raise exception 'claim % was filed signed-out; ask % to create an account first', p_claim, c.email; end if;
  update gyms set owner_id = c.user_id, status = 'claimed' where id = c.gym_id and status <> 'removed' returning * into g;
  if not found then raise exception 'gym for claim % is missing or removed', p_claim; end if;
  update gym_claims set status = 'approved' where id = p_claim or (gym_id = c.gym_id and user_id = c.user_id and kind = 'claim' and status = 'pending');
  update gym_claims set status = 'rejected' where gym_id = c.gym_id and kind = 'claim' and status = 'pending';
  return g;
end $$;
-- Supabase's default privileges grant execute to anon/authenticated; revoking from public alone leaves those in place.
revoke all on function zt_approve_gym_claim(uuid) from public, anon, authenticated;

create or replace function zt_reject_gym_claim(p_claim uuid) returns void language sql security definer set search_path = public as $$
  update gym_claims set status = 'rejected' where id = p_claim and status = 'pending'
$$;
revoke all on function zt_reject_gym_claim(uuid) from public, anon, authenticated;
