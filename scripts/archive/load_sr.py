"""Load strongmanresults.com open data (CC BY 4.0) into the ZeroTacky archive_* tables.
usage: uv run python archive/load_sr.py [--ref staging|prod] [--years 2024,2025,2026] [--no-fetch] [--batch 1500]
Downloads placements.csv + results-<year>.csv to archive/snapshots/<UTC stamp>/ (kept: the license is irrevocable, the
weekly rebuild upstream is not), then replaces the 'sr' rows: competitions, placements, results, source counts.
Prod requires --ref prod and Kurt's OK each time (sql.py --allow-prod). Not atomic across HTTP calls: the archive is
partially loaded for the minutes the run takes.

Unattended path (GitHub Actions, 062): set ZT_ARCHIVE_DSN to the `zt_archive_loader` connection string (pooler, session
mode) and every statement runs over one psycopg connection as that role instead of the Management API. The role can
write only the archive_* tables and call zt_refresh_archive_athletes(); the matview refresh goes through that function."""
import csv, io, json, os, pathlib, re, subprocess, sys, time, urllib.request, datetime
HERE = pathlib.Path(__file__).resolve().parent
ZT = HERE.parent
args = sys.argv[1:]
def opt(name, default=None):
    if name in args:
        i = args.index(name); v = args[i + 1]; del args[i:i + 2]; return v
    return default
REF = opt('--ref', 'staging'); YEARS = opt('--years'); BATCH = int(opt('--batch', '1500')); NOFETCH = '--no-fetch' in args
BASE = 'https://strongmanresults.com'
UA = {'User-Agent': 'zerotacky-archive-loader (privacy@zerotacky.com)'}

def norm(s):
    return re.sub(r'[^a-z0-9]+', ' ', (s or '').lower()).strip()
def slugify(s):
    return re.sub(r'[^a-z0-9]+', '-', (s or '').lower()).strip('-')[:80]
def q(v):
    if v is None or v == '': return 'null'
    return "'" + str(v).replace("'", "''") + "'"
def num(v):
    try: return float(v) if v not in (None, '') else None
    except ValueError: return None
def intv(v):
    try: return int(float(v)) if v not in (None, '') else None
    except ValueError: return None

DSN = os.environ.get('ZT_ARCHIVE_DSN')
_conn = None
def sql(query):
    if DSN:
        global _conn
        import psycopg
        if _conn is None: _conn = psycopg.connect(DSN, connect_timeout=20)
        if query.strip().lower().startswith('refresh materialized view'): query = 'select zt_refresh_archive_athletes()'
        with _conn.cursor() as cur:
            cur.execute(query); _conn.commit()
            try: return json.dumps(cur.fetchall(), default=str)
            except psycopg.ProgrammingError: return ''
    if not (ZT / 'sql.py').exists():
        raise SystemExit('ZT_ARCHIVE_DSN is not set and sql.py (Management API helper) is not beside this script; '
                         'set ZT_ARCHIVE_DSN to the zt_archive_loader connection string (see 062_archive_loader_role.sql)')
    cmd = [sys.executable, str(ZT / 'sql.py')]
    if REF == 'prod': cmd += ['--ref', 'kagitbfthapxmaljsdtz', '--allow-prod']
    qf = HERE / '.batch.sql'; qf.write_text(query, encoding='utf-8')   # Windows caps argv at 32 KB
    cmd += ['--file-abs', str(qf)]
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=str(ZT))
    if r.returncode != 0 or r.stdout.startswith('HTTP'):
        raise SystemExit(f'SQL failed: {r.stdout[:600]} {r.stderr[:300]}')
    return r.stdout

def fetch(path, dest):
    with urllib.request.urlopen(urllib.request.Request(BASE + path, headers=UA), timeout=180) as x:
        data = x.read()
    dest.write_bytes(data); return data.decode('utf-8-sig')

# 1. snapshot
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
snaps = sorted(p for p in (HERE / 'snapshots').iterdir() if p.is_dir()) if (HERE / 'snapshots').exists() else []
if NOFETCH:
    if not snaps: raise SystemExit('no snapshot to reuse')
    snap = snaps[-1]; print('reusing snapshot', snap.name)
    page = (snap / 'data.html').read_text(encoding='utf-8')
    placements_txt = (snap / 'placements.csv').read_text(encoding='utf-8-sig')
else:
    snap = HERE / 'snapshots' / stamp; snap.mkdir(parents=True)
    page = fetch('/data', snap / 'data.html')
    placements_txt = fetch('/downloads/placements.csv', snap / 'placements.csv'); print('placements.csv', len(placements_txt) // 1024, 'KB')
m = re.search(r'Last update:\s*(\d{4}-\d{2}-\d{2})', page)
last_update = m.group(1) if m else None
years = [int(y) for y in YEARS.split(',')] if YEARS else sorted({int(r['date'][:4]) for r in csv.DictReader(io.StringIO(placements_txt)) if r.get('date')})
results_txt = {}
for y in years:
    f = snap / f'results-{y}.csv'
    if NOFETCH and f.exists(): results_txt[y] = f.read_text(encoding='utf-8-sig')
    elif not NOFETCH:
        try: results_txt[y] = fetch(f'/downloads/results-{y}.csv', f); print(f'results-{y}.csv', len(results_txt[y]) // 1024, 'KB')
        except urllib.error.HTTPError as e: print(f'results-{y}.csv missing ({e.code})')
print('source last update:', last_update, '| years:', years)

# 2. shape rows
placements = [r for r in csv.DictReader(io.StringIO(placements_txt)) if r.get('date') and r.get('competition') and r.get('athlete')]
if YEARS: placements = [r for r in placements if int(r['date'][:4]) in years]
comps = {}
for r in placements:
    key = f"sr:{r['date']}:{slugify(r['competition'])}"
    comps.setdefault(key, (r['competition'], r['date'], r.get('sanction') or None, r.get('city') or None, r.get('state') or None))
results = []
for y, txt in results_txt.items():
    for r in csv.DictReader(io.StringIO(txt)):
        if r.get('date') and r.get('competition') and r.get('athlete') and r.get('event'):
            results.append(r)
print(f'{len(comps)} competitions, {len(placements)} placements, {len(results)} event results')

# 3. replace
t0 = time.time()
sql("delete from archive_competitions where source = 'sr'")
rows = [f"({q(k)}, {q(v[0])}, {q(v[1])}, {q(v[2])}, {q(v[3])}, {q(v[4])})" for k, v in comps.items()]
for i in range(0, len(rows), BATCH):
    sql("insert into archive_competitions (source, slug, name, date, sanction, city, state) select 'sr', v.slug, v.name, v.date::date, v.sanction, v.city, v.state from (values "
        + ','.join(rows[i:i + BATCH]) + ") as v(slug, name, date, sanction, city, state) on conflict (slug) do nothing")
print('competitions in', round(time.time() - t0), 's')
def comp_key(r): return f"sr:{r['date']}:{slugify(r['competition'])}"
rows = [f"({q(comp_key(r))}, {q(r['athlete'])}, {q(norm(r['athlete']))}, {q(r['division'])}, {q(r.get('sex') or None)}, {q(r.get('class_kind') or None)}, {q(r.get('weight_class') or None)}, {intv(r.get('overall_place')) if intv(r.get('overall_place')) is not None else 'null'}, {num(r.get('total_points')) if num(r.get('total_points')) is not None else 'null'})" for r in placements]
for i in range(0, len(rows), BATCH):
    sql("insert into archive_placements (competition_id, athlete, athlete_key, division, sex, class_kind, weight_class, place, points) select c.id, v.athlete, v.athlete_key, v.division, v.sex, v.class_kind, v.weight_class, v.place, v.points from (values "
        + ','.join(rows[i:i + BATCH]) + ") as v(slug, athlete, athlete_key, division, sex, class_kind, weight_class, place, points) join archive_competitions c on c.slug = v.slug")
    if (i // BATCH) % 10 == 0: print(f'  placements {min(i + BATCH, len(rows))}/{len(rows)}', round(time.time() - t0), 's')
rows = [f"({q(comp_key(r))}, {q(r['athlete'])}, {q(norm(r['athlete']))}, {q(r['division'])}, {intv(r.get('event_num')) if intv(r.get('event_num')) is not None else 'null'}, {q(r['event'])}, {q(r.get('event_type') or None)}, {q(r.get('canonical_lift') or None)}, {q(r.get('unit') or None)}, {q(r.get('raw_value') or None)}, {num(r.get('value')) if num(r.get('value')) is not None else 'null'}, {num(r.get('points')) if num(r.get('points')) is not None else 'null'})" for r in results]
for i in range(0, len(rows), BATCH):
    sql("insert into archive_results (competition_id, athlete, athlete_key, division, event_num, event, event_type, canonical_lift, unit, raw_value, value, points) select c.id, v.athlete, v.athlete_key, v.division, v.event_num, v.event, v.event_type, v.canonical_lift, v.unit, v.raw_value, v.value, v.points from (values "
        + ','.join(rows[i:i + BATCH]) + ") as v(slug, athlete, athlete_key, division, event_num, event, event_type, canonical_lift, unit, raw_value, value, points) join archive_competitions c on c.slug = v.slug")
    if (i // BATCH) % 20 == 0: print(f'  results {min(i + BATCH, len(rows))}/{len(rows)}', round(time.time() - t0), 's')
sql('refresh materialized view archive_athletes')
out = sql("update archive_sources set last_source_update = " + (q(last_update) + '::date' if last_update else 'null') + ", fetched_at = now(), "
    "competitions = (select count(*) from archive_competitions where source='sr'), "
    "placements = (select count(*) from archive_placements p join archive_competitions c on c.id = p.competition_id where c.source='sr'), "
    "results = (select count(*) from archive_results r join archive_competitions c on c.id = r.competition_id where c.source='sr') where key = 'sr' returning competitions, placements, results, last_source_update")
print('done in', round(time.time() - t0), 's ->', out.strip())
