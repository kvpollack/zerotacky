-- 019 (10/21): fixes from Astra's gym owner + admin audit (audits/astra-2026-10-21-gym-admin.md). Same file for staging and prod.

-- G-M1: an owner could UPDATE a pending row but not SELECT it, so PostgREST's filtered update matched nothing and the
-- UI reported a save that never happened. Owners can now read their own rows through the table path (the SELECT
-- column grant from 015 still applies, so owner_id and provenance stay hidden there; zt_my_gyms has the full row).
-- Public readers are unchanged: gyms_public_read stays unclaimed|claimed, and the public query helpers now filter on
-- status explicitly as well.
drop policy if exists gyms_owner_read on gyms;
create policy gyms_owner_read on gyms for select to authenticated using (owner_id = auth.uid() and status <> 'removed');

-- G-M4: impossible coordinates were storable. Both null or both in range.
alter table gyms drop constraint if exists gyms_latlng_chk;
alter table gyms add constraint gyms_latlng_chk check (
  (lat is null and lng is null)
  or (lat is not null and lng is not null and lat between -90 and 90 and lng between -180 and 180)
);  -- the "is not null" terms matter: a CHECK that evaluates to NULL passes, so a half pin would slip through

-- G-M3: removing a gym (admin) or rejecting an owner-submitted listing left sibling claims and reports pending and
-- actionable. Both now close everything open on that gym: claims rejected, reports approved (= handled, the gym is gone).
create or replace function zt_close_gym_claims(p_gym uuid) returns void language sql security definer set search_path = public as $$
  update gym_claims set status = case when kind = 'report' then 'approved' else 'rejected' end where gym_id = p_gym and status = 'pending';
$$;
revoke all on function zt_close_gym_claims(uuid) from public, anon, authenticated;

create or replace function zt_remove_gym(p_gym uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  perform zt_require_admin();
  update gyms set status = 'removed' where id = p_gym;
  perform zt_close_gym_claims(p_gym);
end $$;

create or replace function zt_reject_gym_claim(p_claim uuid) returns void language plpgsql security definer set search_path = public as $$
declare c gym_claims%rowtype; v_removed int;
begin
  perform zt_require_admin();
  update gym_claims set status = 'rejected' where id = p_claim and status = 'pending' returning * into c;
  if not found then return; end if;
  -- an owner-submitted listing that is rejected disappears with its claim, and so does everything else filed on it
  update gyms set status = 'removed' where id = c.gym_id and status = 'pending';
  get diagnostics v_removed = row_count;
  if v_removed > 0 then perform zt_close_gym_claims(c.gym_id); end if;
end $$;

-- G-M2: the queue compared the claimant's self-typed contact email with the gym's site and showed it as a match. The
-- signal now comes from the account's confirmed sign-in email (auth.users), returned separately; the typed address is
-- shown as an unverified contact when it differs.
drop function if exists zt_list_gym_claims();
create or replace function zt_list_gym_claims() returns table (
  id uuid, kind text, status text, name text, email text, role text, message text, user_id uuid, created_at timestamptz,
  gym_id uuid, gym_slug text, gym_name text, gym_city text, gym_state text, gym_status text, gym_website text,
  gym_source_url text, claimant_display_name text, account_email text, pending_claims_on_gym int
) language sql stable security definer set search_path = public as $$
  select c.id, c.kind, c.status, c.name, c.email, c.role, c.message, c.user_id, c.created_at,
         g.id, g.slug, g.name, g.city, g.state, g.status, g.website_url, g.source_url,
         p.display_name,
         case when u.email_confirmed_at is not null then u.email end,
         (select count(*)::int from gym_claims x where x.gym_id = g.id and x.kind = 'claim' and x.status = 'pending')
  from gym_claims c
  join gyms g on g.id = c.gym_id
  left join profiles p on p.id = c.user_id
  left join auth.users u on u.id = c.user_id
  where zt_is_admin() and c.status = 'pending'
  order by c.created_at
$$;
revoke all on function zt_list_gym_claims() from public, anon;
grant execute on function zt_list_gym_claims() to authenticated;

-- G-L1: the per-caller daily cap and the slug suffix loop were read-then-write. A per-caller advisory lock serialises
-- the cap; the insert retries on a slug collision from another caller.
create or replace function zt_add_gym(
  p_name text, p_gym_type text, p_street text, p_city text, p_state text, p_zip text, p_website text, p_phone text,
  p_instagram text, p_contact text, p_role text, p_message text, p_lat double precision, p_lng double precision
) returns gyms language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_email text; v_name text; v_base text; v_slug text; v_n int := 1; v_try int := 0; g gyms%rowtype;
begin
  if v_uid is null then raise exception 'sign in to add a gym'; end if;
  perform pg_advisory_xact_lock(hashtext('zt_add_gym:' || v_uid::text));
  select email into v_email from auth.users where id = v_uid;
  select display_name into v_name from profiles where id = v_uid;
  if (select count(*) from gyms where owner_id = v_uid and created_at > now() - interval '1 day') >= 3 then
    raise exception 'that is three gyms today; email us if you run more than that';
  end if;
  if char_length(trim(p_name)) < 2 then raise exception 'gym name is needed'; end if;
  if trim(p_city) = '' or upper(trim(p_state)) !~ '^[A-Z]{2}$' then raise exception 'city and two-letter state are needed'; end if;
  if p_gym_type not in ('strongman', 'powerlifting', 'mixed') then raise exception 'bad gym type'; end if;
  if (p_lat is null) <> (p_lng is null) or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'map pin is out of range';
  end if;
  v_base := left(regexp_replace(lower(trim(p_name) || '-' || trim(p_city) || '-' || trim(p_state)), '[^a-z0-9]+', '-', 'g'), 72);
  v_base := trim(both '-' from v_base);
  loop
    v_slug := case when v_n = 1 then v_base else v_base || '-' || v_n end;
    while exists (select 1 from gyms where slug = v_slug) loop
      v_n := v_n + 1; v_slug := v_base || '-' || v_n;
    end loop;
    begin
      insert into gyms (slug, name, status, owner_id, gym_type, street_address, city, state, zip, lat, lng, website_url, phone, instagram, contact,
                        source_url, source_evidence, confidence, last_verified)
      values (v_slug, left(trim(p_name), 120), 'pending', v_uid, p_gym_type, left(coalesce(trim(p_street), ''), 160), left(trim(p_city), 80),
              upper(trim(p_state)), left(coalesce(trim(p_zip), ''), 10), p_lat, p_lng, left(coalesce(trim(p_website), ''), 300),
              left(coalesce(trim(p_phone), ''), 30), left(coalesce(ltrim(trim(p_instagram), '@'), ''), 60), left(coalesce(trim(p_contact), ''), 200),
              'owner-submitted', 'Submitted by the owner from My Gym; awaiting review.', 'medium', current_date)
      returning * into g;
      exit;
    exception when unique_violation then
      v_try := v_try + 1; v_n := v_n + 1;
      if v_try > 5 then raise exception 'could not find a free web address for this gym; try again'; end if;
    end;
  end loop;
  insert into gym_claims (gym_id, kind, name, email, role, message, user_id)
  values (g.id, 'claim', left(coalesce(nullif(trim(v_name), ''), split_part(coalesce(v_email, 'owner'), '@', 1)), 80), coalesce(v_email, ''),
          left(coalesce(nullif(trim(p_role), ''), 'Owner') || ' (new listing)', 40), left(coalesce(p_message, ''), 1000), v_uid);
  return g;
end $$;
revoke all on function zt_add_gym(text, text, text, text, text, text, text, text, text, text, text, text, double precision, double precision) from public, anon;
grant execute on function zt_add_gym(text, text, text, text, text, text, text, text, text, text, text, text, double precision, double precision) to authenticated;

-- Spot check (Astra): TOP Strength Project's recorded source page still shows the old address; cite the move notice directly.
update gyms set source_url = 'https://www.thetopstrengthproject.com/' where slug = 'the-top-strength-project-pawtucket-ri' and status <> 'claimed';
