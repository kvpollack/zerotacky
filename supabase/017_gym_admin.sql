-- 017_gym_admin.sql (v2, 10/21, Kurt): claims approval page + "add my gym".
-- 1. zt_admins: who may approve. Rows go in by SQL (Kurt's accounts). zt_require_admin() passes for direct SQL
--    (no JWT in the request), for the service role, and for signed-in users on the list; everyone else is refused.
-- 2. The approve/reject RPCs from 016 become callable by signed-in admins; zt_list_gym_claims feeds the page;
--    zt_resolve_gym_report closes reports; zt_remove_gym hides a listing.
-- 3. zt_add_gym: a signed-in owner adds a gym that is not in the directory. It lands as status 'pending' (not public),
--    owned by the submitter, with a claim row so it shows on the approval page; approval flips it to 'claimed'.
-- Safe to re-run. Staging first, prod on Kurt's go (then: insert into zt_admins values ('<kurt user id>')).

create table if not exists zt_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  note       text not null default '',
  created_at timestamptz not null default now()
);
alter table zt_admins enable row level security;
revoke all on zt_admins from anon, authenticated;

create or replace function zt_is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from zt_admins where user_id = auth.uid())
$$;
revoke all on function zt_is_admin() from public, anon;
grant execute on function zt_is_admin() to authenticated;

create or replace function zt_require_admin() returns void language plpgsql stable security definer set search_path = public as $$
begin
  if current_setting('request.jwt.claims', true) is null then return; end if;           -- direct SQL (Kurt / Slate)
  if coalesce(current_setting('request.jwt.claim.role', true), (current_setting('request.jwt.claims', true)::jsonb ->> 'role')) = 'service_role' then return; end if;
  if not zt_is_admin() then raise exception 'admin only'; end if;
end $$;
revoke all on function zt_require_admin() from public, anon, authenticated;

-- ---------- gyms: a 'pending' status for owner-submitted listings ----------
alter table gyms drop constraint if exists gyms_status_chk;
alter table gyms add constraint gyms_status_chk check (status in ('pending', 'unclaimed', 'claimed', 'removed'));
drop policy if exists gyms_public_read on gyms;
create policy gyms_public_read on gyms for select to anon, authenticated using (status in ('unclaimed', 'claimed'));
drop policy if exists gyms_owner_update on gyms;
create policy gyms_owner_update on gyms for update to authenticated
  using (owner_id = auth.uid() and status in ('claimed', 'pending'))
  with check (owner_id = auth.uid() and status in ('claimed', 'pending'));
-- zt_my_gyms already returns every non-removed row the caller owns, pending included.

-- ---------- approval RPCs: admins over PostgREST, Kurt over SQL ----------
create or replace function zt_approve_gym_claim(p_claim uuid) returns gyms language plpgsql security definer set search_path = public as $$
declare c gym_claims%rowtype; g gyms%rowtype;
begin
  perform zt_require_admin();
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
revoke all on function zt_approve_gym_claim(uuid) from public, anon;
grant execute on function zt_approve_gym_claim(uuid) to authenticated;

create or replace function zt_reject_gym_claim(p_claim uuid) returns void language plpgsql security definer set search_path = public as $$
declare c gym_claims%rowtype;
begin
  perform zt_require_admin();
  update gym_claims set status = 'rejected' where id = p_claim and status = 'pending' returning * into c;
  -- an owner-submitted listing that is rejected disappears with its claim
  if found then update gyms set status = 'removed' where id = c.gym_id and status = 'pending'; end if;
end $$;
revoke all on function zt_reject_gym_claim(uuid) from public, anon;
grant execute on function zt_reject_gym_claim(uuid) to authenticated;

-- reports: approved = handled, rejected = dismissed (same status vocabulary as claims)
create or replace function zt_resolve_gym_report(p_claim uuid, p_handled boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  perform zt_require_admin();
  update gym_claims set status = case when p_handled then 'approved' else 'rejected' end where id = p_claim and kind = 'report' and status = 'pending';
end $$;
revoke all on function zt_resolve_gym_report(uuid, boolean) from public, anon;
grant execute on function zt_resolve_gym_report(uuid, boolean) to authenticated;

create or replace function zt_remove_gym(p_gym uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  perform zt_require_admin();
  update gyms set status = 'removed' where id = p_gym;
end $$;
revoke all on function zt_remove_gym(uuid) from public, anon;
grant execute on function zt_remove_gym(uuid) to authenticated;

-- the approval page: pending claims and reports with the gym and the claimant alongside
create or replace function zt_list_gym_claims() returns table (
  id uuid, kind text, status text, name text, email text, role text, message text, user_id uuid, created_at timestamptz,
  gym_id uuid, gym_slug text, gym_name text, gym_city text, gym_state text, gym_status text, gym_website text,
  gym_source_url text, claimant_display_name text, pending_claims_on_gym int
) language sql stable security definer set search_path = public as $$
  select c.id, c.kind, c.status, c.name, c.email, c.role, c.message, c.user_id, c.created_at,
         g.id, g.slug, g.name, g.city, g.state, g.status, g.website_url, g.source_url,
         p.display_name,
         (select count(*)::int from gym_claims x where x.gym_id = g.id and x.kind = 'claim' and x.status = 'pending')
  from gym_claims c
  join gyms g on g.id = c.gym_id
  left join profiles p on p.id = c.user_id
  where zt_is_admin() and c.status = 'pending'
  order by c.created_at
$$;
revoke all on function zt_list_gym_claims() from public, anon;
grant execute on function zt_list_gym_claims() to authenticated;

-- ---------- add my gym ----------
create or replace function zt_add_gym(
  p_name text, p_gym_type text, p_street text, p_city text, p_state text, p_zip text, p_website text, p_phone text,
  p_instagram text, p_contact text, p_role text, p_message text, p_lat double precision, p_lng double precision
) returns gyms language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_email text; v_name text; v_base text; v_slug text; v_n int := 1; g gyms%rowtype;
begin
  if v_uid is null then raise exception 'sign in to add a gym'; end if;
  select email into v_email from auth.users where id = v_uid;
  select display_name into v_name from profiles where id = v_uid;
  if (select count(*) from gyms where owner_id = v_uid and created_at > now() - interval '1 day') >= 3 then
    raise exception 'that is three gyms today; email us if you run more than that';
  end if;
  if char_length(trim(p_name)) < 2 then raise exception 'gym name is needed'; end if;
  if trim(p_city) = '' or upper(trim(p_state)) !~ '^[A-Z]{2}$' then raise exception 'city and two-letter state are needed'; end if;
  if p_gym_type not in ('strongman', 'powerlifting', 'mixed') then raise exception 'bad gym type'; end if;
  v_base := left(regexp_replace(lower(trim(p_name) || '-' || trim(p_city) || '-' || trim(p_state)), '[^a-z0-9]+', '-', 'g'), 72);
  v_base := trim(both '-' from v_base);
  v_slug := v_base;
  while exists (select 1 from gyms where slug = v_slug) loop
    v_n := v_n + 1; v_slug := v_base || '-' || v_n;
  end loop;
  insert into gyms (slug, name, status, owner_id, gym_type, street_address, city, state, zip, lat, lng, website_url, phone, instagram, contact,
                    source_url, source_evidence, confidence, last_verified)
  values (v_slug, left(trim(p_name), 120), 'pending', v_uid, p_gym_type, left(coalesce(trim(p_street), ''), 160), left(trim(p_city), 80),
          upper(trim(p_state)), left(coalesce(trim(p_zip), ''), 10), p_lat, p_lng, left(coalesce(trim(p_website), ''), 300),
          left(coalesce(trim(p_phone), ''), 30), left(coalesce(ltrim(trim(p_instagram), '@'), ''), 60), left(coalesce(trim(p_contact), ''), 200),
          'owner-submitted', 'Submitted by the owner from My Gym; awaiting review.', 'medium', current_date)
  returning * into g;
  insert into gym_claims (gym_id, kind, name, email, role, message, user_id)
  values (g.id, 'claim', left(coalesce(nullif(trim(v_name), ''), split_part(coalesce(v_email, 'owner'), '@', 1)), 80), coalesce(v_email, ''),
          left(coalesce(nullif(trim(p_role), ''), 'Owner') || ' (new listing)', 40), left(coalesce(p_message, ''), 1000), v_uid);
  return g;
end $$;
revoke all on function zt_add_gym(text, text, text, text, text, text, text, text, text, text, text, text, double precision, double precision) from public, anon;
grant execute on function zt_add_gym(text, text, text, text, text, text, text, text, text, text, text, text, double precision, double precision) to authenticated;

-- staging seed: the test account is an admin there. Prod gets Kurt's accounts by hand after apply.
-- insert into zt_admins (user_id, note) values ('36970762-b3e1-43c2-87f0-d1093816f94e', 'slate.staging') on conflict do nothing;
