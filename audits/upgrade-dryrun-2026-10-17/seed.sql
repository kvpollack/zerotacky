-- Meet day on a prod-shaped database (001+002+004): a keyed phone publishes an ownerless meet, a judge phone scores,
-- a second meet exists. Mirrors what Strongfest on prod looks like before the v2 merge.
insert into publish_keys (key, label) values ('UPGRADE-KEY-1', 'dry run') on conflict do nothing;
select zt_publish_meet('UPGRADE-KEY-1',
  '{"id":"11111111-1111-4111-8111-111111111111","slug":"upgrade-strongfest","name":"Upgrade Strongfest","date":"2026-10-24","admin_pin":"7391","stations":[{"id":"A","label":"Platform"}]}',
  '[{"id":"div-1","name":"Open Men","flight":"A","sort_order":0},{"id":"div-2","name":"Open Women","flight":"A","sort_order":1}]',
  '[{"id":"ev-1","event_number":1,"name":"Log Press","scoring_type":"reps","time_cap_seconds":60,"lanes":1},{"id":"ev-2","event_number":2,"name":"Yoke","scoring_type":"time_or_distance","time_cap_seconds":60,"lanes":1}]',
  '[{"id":"ath-1","division_id":"div-1","name":"Scored Sam","bodyweight":231.5,"lot_number":1,"status":"active"},{"id":"ath-2","division_id":"div-1","name":"Unscored Uma","lot_number":2,"status":"active"},{"id":"ath-3","division_id":"div-2","name":"Walkon Wren","lot_number":3,"status":"withdrawn"}]',
  '[]');
-- judge phone writes a locked result (REST upsert path = plain insert here)
insert into results (id, meet_id, event_id, athlete_id, payload, locked, updated_at, updated_by)
values ('ev-1_ath-1', '11111111-1111-4111-8111-111111111111', 'ev-1', 'ath-1', '{"reps":7,"points":3}', true, now() - interval '1 hour', 'judge-phone-1');
insert into live_state (meet_id, station, current_event_id, current_division_id, current_athlete_id, updated_at, updated_by)
values ('11111111-1111-4111-8111-111111111111', 'A', 'ev-1', 'div-1', 'ath-2', now(), 'judge-phone-1');
select zt_publish_meet('UPGRADE-KEY-1',
  '{"id":"22222222-2222-4222-8222-222222222222","slug":"upgrade-second","name":"Upgrade Second Meet","date":"2026-11-07","admin_pin":"1050","is_demo":true}',
  '[{"id":"d","name":"Novice","flight":"A","sort_order":0}]', '[]', '[{"id":"a","division_id":"d","name":"Solo","lot_number":1,"status":"active"}]', '[]');
