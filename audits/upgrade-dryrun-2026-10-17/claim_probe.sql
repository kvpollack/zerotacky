create temp table zt_v (step text, outcome text) on commit drop;
do $$
declare
  mid uuid := '11111111-1111-4111-8111-111111111111';
  uid uuid := 'aaaaaaaa-0000-4000-8000-00000000aaaa';
  log text[] := '{}';
  p_m jsonb; p_d jsonb; p_e jsonb; p_a jsonb; v jsonb; n int; o uuid; pin text;
begin
  begin
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'upgrade-claim@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
    select count(*) into n from profiles where id = uid;
    log := log || ('profile trigger rows for new user = ' || n);

    p_m := (select row_to_json(m)::jsonb - 'join_code' - 'owner_id' - 'admin_pin' from meets m where m.id = mid);
    p_d := (select coalesce(jsonb_agg(row_to_json(d)), '[]') from divisions d where d.meet_id = mid);
    p_e := (select coalesce(jsonb_agg(row_to_json(e)), '[]') from events e where e.meet_id = mid);
    p_a := (select coalesce(jsonb_agg(row_to_json(a)), '[]') from athletes a where a.meet_id = mid);

    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    log := log || ('auth.uid() = ' || coalesce(auth.uid()::text, 'null'));

    -- keyless signed-in publish of the ownerless slug -> refused
    begin
      perform zt_publish_meet(null, p_m, p_d, p_e, p_a, '[]');
      log := log || ('keyless signed-in publish -> accepted (BAD)')::text;
    exception when others then log := log || ('keyless signed-in publish -> ' || sqlstate || ' ' || left(sqlerrm, 100)); end;
    select owner_id, admin_pin into o, pin from meets where id = mid;
    log := log || ('after refusal owner=' || coalesce(o::text,'null') || ' pin=' || pin);

    -- wrong key + JWT -> refused
    begin
      perform zt_publish_meet('WRONG-KEY', p_m, p_d, p_e, p_a, '[]');
      log := log || ('wrong key signed-in publish -> ' || case when (select owner_id from meets where id = mid) is null then 'owner still null (ok: non-keyed path)' else 'CLAIMED (BAD)' end)::text;
    exception when others then log := log || ('wrong key signed-in publish -> ' || sqlstate || ' ' || left(sqlerrm, 100)); end;

    -- key + JWT claims it, PIN absent in payload keeps 7391
    v := zt_publish_meet('UPGRADE-KEY-1', p_m, p_d, p_e, p_a, '[]');
    select owner_id, admin_pin into o, pin from meets where id = mid;
    log := log || ('key+JWT publish -> owner=' || coalesce(o::text,'null') || ' pin=' || pin || ' join=' || (v->>'join_code'));
    select count(*) into n from meet_members where meet_id = mid and user_id = uid and role = 'owner';
    log := log || ('owner membership rows = ' || n);
    select count(*) into n from results where meet_id = mid and locked;
    log := log || ('locked results after claim = ' || n);

    -- now owned: keyless signed-in owner republish works, stranger refused
    perform zt_publish_meet(null, p_m, p_d, p_e, p_a, '[]');
    log := log || ('owner keyless republish -> ok')::text;
    perform set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-00000000bbbb","role":"authenticated"}', true);
    begin
      perform zt_publish_meet(null, p_m, p_d, p_e, p_a, '[]');
      log := log || ('stranger keyless publish -> accepted (BAD)')::text;
    exception when others then log := log || ('stranger keyless publish -> ' || sqlstate || ' ' || left(sqlerrm, 60)); end;

    -- anon, no key
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    begin
      perform zt_publish_meet(null, p_m, p_d, p_e, p_a, '[]');
      log := log || ('anon keyless publish -> accepted (BAD)')::text;
    exception when others then log := log || ('anon keyless publish -> ' || sqlstate || ' ' || left(sqlerrm, 60)); end;

    raise exception 'ROLLBACK_MARKER';
  exception when others then
    if sqlerrm <> 'ROLLBACK_MARKER' then log := log || ('OUTER ERROR -> ' || sqlstate || ' ' || sqlerrm); end if;
  end;
  insert into zt_v select 'v' || lpad(ordinality::text, 2, '0'), x from unnest(log) with ordinality as u(x, ordinality);
end $$;
select * from zt_v order by step;
