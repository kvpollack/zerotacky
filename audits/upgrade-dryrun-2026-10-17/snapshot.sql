select jsonb_build_object(
  'meets', (select jsonb_agg(jsonb_build_object('id',id,'slug',slug,'join_code',join_code,'admin_pin',admin_pin,'owner_id',owner_id,'stations',stations,'is_demo',is_demo) order by slug) from meets),
  'athletes', (select jsonb_agg(jsonb_build_object('meet',meet_id,'id',id,'name',name,'div',division_id,'bw',bodyweight,'status',status) order by meet_id, id) from athletes),
  'results', (select jsonb_agg(jsonb_build_object('meet',meet_id,'id',id,'payload',payload,'locked',locked,'updated_at',updated_at,'by',updated_by) order by id) from results),
  'events', (select count(*) from events), 'divisions', (select count(*) from divisions),
  'live', (select jsonb_agg(jsonb_build_object('station',station,'athlete',current_athlete_id)) from live_state),
  'members', (select count(*) from meet_members), 'keys', (select count(*) from publish_keys)
) snap;
