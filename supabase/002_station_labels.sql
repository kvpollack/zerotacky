-- 10/16: default station labels renamed from "Stn n" to "Station n". Clients normalize saved labels on load,
-- so this only changes the server-side default for rows inserted without stations.
alter table meets alter column stations set default '[{"id":"A","label":"Station 1"},{"id":"B","label":"Station 2"}]';
