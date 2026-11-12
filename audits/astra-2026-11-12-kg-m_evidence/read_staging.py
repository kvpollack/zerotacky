from pathlib import Path
import urllib.request,json
out=Path.home()/'.aki/tmp/astra-units-1112';kit=Path.home()/'.aki/tmp/zt'
REF='hryiqiopkihkcrkdyllg'
def read(name,q):
 assert q.strip().lower().startswith('select')
 req=urllib.request.Request(f'https://api.supabase.com/v1/projects/{REF}/database/query',data=json.dumps({'query':q}).encode(),headers={'Authorization':'Bearer '+(kit/'supabase_pat.txt').read_text().strip(),'Content-Type':'application/json'},method='POST')
 with urllib.request.urlopen(req,timeout=90) as r: data=json.load(r)
 (out/(name+'.json')).write_text(json.dumps(data,indent=2))
read('staging-functions',"select p.proname,pg_get_functiondef(p.oid) as body from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('zt_publish_meet','zt_save_meet_config','zt_my_meets','zt_get_my_meet','zt_public_meet_by_slug','zt_adopt_archive_competition','zt_scoring_type_for')")
read('staging-fixtures',"select m.id,m.slug,m.units,m.available_plates,m.collar_weight_per_pair,m.updated_at,m.competition_status,(select count(*) from results r where r.meet_id=m.id) as results,(select jsonb_agg(e order by event_number) from events e where e.meet_id=m.id) as events from meets m where m.slug in ('metric-test-open-2026','the-scarlet-strongman-show-2024','iron-harbor-classic-2026','all-out-strongfest-2026-dryrun2')")
read('staging-public-rpc',"select slug,zt_public_meet_by_slug(slug) as response from meets where slug in ('metric-test-open-2026','the-scarlet-strongman-show-2024')")
read('staging-grants',"select grantee,column_name,privilege_type from information_schema.column_privileges where table_schema='public' and table_name='meets' and grantee in ('anon','authenticated') order by grantee,privilege_type,column_name")
read('staging-triggers',"select event_object_table,trigger_name,action_statement from information_schema.triggers where event_object_schema='public' and event_object_table in ('meets','events','results')")
read('archive-unit-counts',"select unit,count(*) from archive_results group by unit order by unit")
read('scarlet-results',"select r.payload from results r join meets m on m.id=r.meet_id where m.slug='the-scarlet-strongman-show-2024' order by r.id limit 12")
