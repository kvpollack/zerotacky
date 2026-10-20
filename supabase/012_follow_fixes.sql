-- 012: follows go through the RPC only, and an existing follow can always be removed (Astra R-M1, R-M2, 2026-10-19).
--
-- R-M1: authenticated users could INSERT into meet_follows directly (own rows only), which skipped the "listed and
-- not demo" rule the RPC enforces. The client never writes the table itself (lib/ uses zt_follow_meet), so INSERT and
-- DELETE grants go; SELECT stays for own rows.
-- R-M2: zt_follow_meet checked visibility before looking at p_follow, so a bookmark on a meet the promoter later
-- unlisted could not be removed. Visibility now applies to adding only; removing matches by slug alone.

revoke insert, delete on meet_follows from authenticated;
drop policy if exists meet_follows_own on meet_follows;
create policy meet_follows_own on meet_follows for select to authenticated using (user_id = auth.uid());

create or replace function zt_follow_meet(p_slug text, p_follow boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v_meet_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Sign in to follow a show.' using errcode = '42501';
  end if;
  if p_follow then
    select id into v_meet_id from meets
      where lower(slug) = lower(trim(coalesce(p_slug, ''))) and is_public_listed = true and is_demo = false;
    if v_meet_id is null then
      raise exception 'This show cannot be followed (not listed).' using errcode = 'P0002';
    end if;
    insert into meet_follows (user_id, meet_id) values (v_uid, v_meet_id) on conflict do nothing;
  else
    delete from meet_follows f using meets m
      where f.meet_id = m.id and f.user_id = v_uid and lower(m.slug) = lower(trim(coalesce(p_slug, '')));
  end if;
  return jsonb_build_object('slug', p_slug, 'following', p_follow);
end $$;
revoke all on function zt_follow_meet(text, boolean) from public, anon;
grant execute on function zt_follow_meet(text, boolean) to authenticated;
