-- 049_meet_report.sql (11/8): feature gaps #19, host-gym page + post-meet report.
-- The report itself is computed from the public meet data (/shows/<slug>/report). This adds the one read the public
-- data cannot answer: where the field came from. Linked accounts (023 / 048) with a PUBLIC profile are aggregated by
-- home gym (directory row when set, otherwise the free-text name), counts only, no names and no account ids. A gym
-- that hosted the show reads "28 athletes, 11 with ZeroTacky profiles, from 6 gyms" and sees who travelled.
--
-- Verify after apply:
--   select zt_meet_report_origins((select id from meets where is_demo = false limit 1));   -- {"linked":n,"public":n,"homeGyms":[...]}

create or replace function zt_meet_report_origins(p_meet_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_linked int; v_public int; v_gyms jsonb; v_demo boolean;
begin
  select is_demo into v_demo from meets where id = p_meet_id;
  if v_demo is null or v_demo then return jsonb_build_object('linked', 0, 'public', 0, 'homeGyms', '[]'::jsonb); end if;
  select count(*) into v_linked from athlete_accounts aa where aa.meet_id = p_meet_id;
  select count(*) into v_public
    from athlete_accounts aa join profiles p on p.id = aa.user_id
   where aa.meet_id = p_meet_id and p.is_public and p.username is not null;
  select coalesce(jsonb_agg(row_to_json(q)::jsonb order by q.n desc, q.name), '[]'::jsonb) into v_gyms
    from (
      select coalesce(g.name, nullif(trim(both from p.home_gym_name), '')) as name,
             g.slug as slug,
             count(*)::int as n
        from athlete_accounts aa
        join profiles p on p.id = aa.user_id
        left join gyms g on g.id = p.home_gym_id and g.status in ('unclaimed', 'claimed')
       where aa.meet_id = p_meet_id and p.is_public and p.username is not null
         and (g.id is not null or nullif(trim(both from p.home_gym_name), '') is not null)
       group by 1, 2
    ) q;
  return jsonb_build_object('linked', v_linked, 'public', v_public, 'homeGyms', v_gyms);
end $$;
revoke all on function zt_meet_report_origins(uuid) from public;
grant execute on function zt_meet_report_origins(uuid) to anon, authenticated;
