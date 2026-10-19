-- Every column of every row in the eight tables that exist before the upgrade, ordered by primary key.
select jsonb_build_object(
  'meets',        (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from meets t),
  'divisions',    (select coalesce(jsonb_agg(to_jsonb(t) order by t.meet_id, t.id), '[]') from divisions t),
  'events',       (select coalesce(jsonb_agg(to_jsonb(t) order by t.meet_id, t.id), '[]') from events t),
  'athletes',     (select coalesce(jsonb_agg(to_jsonb(t) order by t.meet_id, t.id), '[]') from athletes t),
  'results',      (select coalesce(jsonb_agg(to_jsonb(t) order by t.meet_id, t.id), '[]') from results t),
  'live_state',   (select coalesce(jsonb_agg(to_jsonb(t) order by t.meet_id, t.station), '[]') from live_state t),
  'meet_members', (select coalesce(jsonb_agg(to_jsonb(t) order by t.meet_id, t.user_id), '[]') from meet_members t),
  'publish_keys', (select coalesce(jsonb_agg(to_jsonb(t) order by t.key), '[]') from publish_keys t)
) as snap;
