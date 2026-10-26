# /// script
# requires-python = ">=3.10"
# ///
"""One-command meet backup and restore for ZeroTacky's Supabase backend.

Dump (anon read, safe to run against prod any time):
    uv run scripts/dump_meet.py <slug>                     # reads .env.local
    uv run scripts/dump_meet.py <slug> --join-code NS4J82  # also captures admin_pin + join_code

Restore (writes; goes through the zt_publish_meet RPC as a signed-in promoter account, 024 retired publish keys):
    ZT_ACCOUNT_EMAIL=... ZT_ACCOUNT_PASSWORD=... uv run scripts/dump_meet.py --restore dumps/<file>.json
    uv run scripts/dump_meet.py --restore dumps/<file>.json --email promoter@example.com --slug restore-test
    (the password is read from ZT_ACCOUNT_PASSWORD or prompted; the account must own the meet, or the slug must be new)

Credentials come from --env (default .env.local: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)
or from SUPABASE_URL / SUPABASE_ANON_KEY in the environment. Keys, tokens and passwords are never printed.

What a dump holds: the meet row, divisions, events, athletes, results, live_state, as returned by PostgREST
(select=*). Without --join-code the meet row has only the anon-visible columns, so a restore from it resets
admin_pin to the schema default (1050) unless --admin-pin is given. With --join-code the dump holds the join
code and admin PIN: keep it out of chat and git (dumps/ is gitignored).

What a restore does: calls zt_publish_meet with the dumped meet/divisions/events/athletes/results. Same rules
as a phone publish: slug resolves an existing meet and updates it in place, stale children are removed,
results are last-writer-wins by updated_at (a newer server row is kept). live_state is not restored; judge
phones rewrite it on their next sync.
"""
from __future__ import annotations

import argparse
import getpass
import csv
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

PAGE = 1000
CHILD_TABLES = ("divisions", "events", "athletes", "results", "live_state")
ORDER_COL = {"live_state": "station"}  # everything else orders by id
# columns zt_publish_meet reads from p_meet; everything else (join_code, owner_id, timestamps) is dropped
# anon has column-level SELECT on meets (001_schema.sql), so select=* is a 401 there
MEET_PUBLIC_COLS = ("id", "slug", "name", "date", "run_order_method", "tiebreaker_rule", "available_plates",
                    "collar_weight_per_pair", "stations", "is_demo", "created_at", "updated_at")
MEET_PUBLISH_COLS = ("id", "slug", "name", "date", "admin_pin", "run_order_method", "tiebreaker_rule",
                     "available_plates", "collar_weight_per_pair", "stations", "is_demo")


def load_env(path: str | None) -> tuple[str, str]:
    values: dict[str, str] = {}
    if path and Path(path).exists():
        for line in Path(path).read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            values[k.strip()] = v.strip().strip('"').strip("'")
    url = (os.environ.get("SUPABASE_URL") or values.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
    key = os.environ.get("SUPABASE_ANON_KEY") or values.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") or ""
    if not url or not key:
        sys.exit(f"no Supabase URL/anon key: pass --env <file> with NEXT_PUBLIC_SUPABASE_URL and "
                 f"NEXT_PUBLIC_SUPABASE_ANON_KEY, or set SUPABASE_URL and SUPABASE_ANON_KEY (looked at {path})")
    return url, key


class Api:
    def __init__(self, url: str, key: str, access_token: str | None = None):
        self.url, self.key = url, key
        self.access_token = access_token   # user JWT for writes; the anon key stays the apikey (LT-02)

    def sign_in(self, email: str, password: str) -> None:
        out = self._req("POST", "/auth/v1/token?grant_type=password", {"email": email, "password": password})
        tok = (out or {}).get("access_token")
        if not tok:
            sys.exit("sign-in returned no access token")
        self.access_token = tok

    def _req(self, method: str, path: str, body=None, headers: dict | None = None):
        h = {"apikey": self.key, "Authorization": f"Bearer {self.access_token or self.key}", "Accept": "application/json"}
        if body is not None:
            h["Content-Type"] = "application/json"
        h.update(headers or {})
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.url + path, data=data, method=method, headers=h)
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                raw = resp.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="replace")[:500]
            sys.exit(f"{method} {path} -> HTTP {e.code}: {detail}")
        except urllib.error.URLError as e:
            sys.exit(f"{method} {path} -> {e.reason}")

    def get_all(self, table: str, query: str) -> list[dict]:
        rows: list[dict] = []
        start = 0
        while True:
            page = self._req("GET", f"/rest/v1/{table}?{query}", headers={"Range": f"{start}-{start + PAGE - 1}"})
            rows.extend(page)
            if len(page) < PAGE:
                return rows
            start += PAGE

    def rpc(self, name: str, params: dict):
        return self._req("POST", f"/rest/v1/rpc/{name}", body=params)


def dump(api: Api, slug: str, out_dir: Path, join_code: str | None) -> Path:
    if join_code:
        meet = api.rpc("zt_meet_by_join_code", {"p_code": join_code})
        if not meet or not meet.get("id"):
            sys.exit(f"no meet for join code {join_code}")
        if meet["slug"] != slug:
            sys.exit(f"join code {join_code} belongs to slug {meet['slug']!r}, not {slug!r}")
    else:
        rows = api.get_all("meets", f"slug=eq.{urllib.parse.quote(slug)}&select={','.join(MEET_PUBLIC_COLS)}")
        if not rows:
            sys.exit(f"no meet with slug {slug!r} at {api.url}")
        meet = rows[0]
    meet_id = meet["id"]

    payload = {
        "dumped_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "supabase_url": api.url,
        "slug": slug,
        "meet_id": meet_id,
        "has_private_meet_columns": "admin_pin" in meet,
        "meet": meet,
    }
    for table in CHILD_TABLES:
        payload[table] = api.get_all(table, f"meet_id=eq.{meet_id}&select=*&order={ORDER_COL.get(table, 'id')}.asc")

    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    json_path = out_dir / f"{slug}_{stamp}.json"
    json_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    csv_path = out_dir / f"{slug}_{stamp}_results.csv"
    write_results_csv(payload, csv_path)

    print(f"meet   {meet['name']!r} ({slug}) id {meet_id}")
    for table in CHILD_TABLES:
        print(f"{table:<10} {len(payload[table])}")
    print(f"private meet columns: {'yes (join code + admin PIN are in this file)' if payload['has_private_meet_columns'] else 'no (restore needs --admin-pin to keep the PIN)'}")
    print(f"wrote  {json_path}")
    print(f"wrote  {csv_path}")
    return json_path


def write_results_csv(payload: dict, path: Path) -> None:
    athletes = {a["id"]: a for a in payload["athletes"]}
    divisions = {d["id"]: d for d in payload["divisions"]}
    events = {e["id"]: e for e in payload["events"]}
    payload_keys: list[str] = []
    for r in payload["results"]:
        for k in (r.get("payload") or {}):
            if k not in payload_keys:
                payload_keys.append(k)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["event_number", "event", "division", "athlete", "lot_number", *payload_keys,
                    "locked", "updated_at", "updated_by", "result_id"])
        def sort_key(r):
            e = events.get(r["event_id"], {})
            a = athletes.get(r["athlete_id"], {})
            return (e.get("event_number") or 0, a.get("division_id") or "", a.get("lot_number") or 0, a.get("name") or "")
        for r in sorted(payload["results"], key=sort_key):
            e = events.get(r["event_id"], {})
            a = athletes.get(r["athlete_id"], {})
            d = divisions.get(a.get("division_id"), {})
            p = r.get("payload") or {}
            w.writerow([e.get("event_number"), e.get("name"), d.get("name"), a.get("name"), a.get("lot_number"),
                        *[p.get(k) for k in payload_keys], r.get("locked"), r.get("updated_at"), r.get("updated_by"), r["id"]])


def restore(api: Api, dump_path: Path, slug: str | None, admin_pin: str | None) -> None:
    if not api.access_token:
        sys.exit("restore needs a signed-in account (024 retired publish keys)")
    data = json.loads(dump_path.read_text(encoding="utf-8"))
    meet = {k: v for k, v in data["meet"].items() if k in MEET_PUBLISH_COLS}
    if slug:
        meet["slug"] = slug
        meet.pop("id", None)  # a new slug is a new meet; let the server pick the id
    if admin_pin:
        meet["admin_pin"] = admin_pin
    if "admin_pin" not in meet:
        print("warning: dump has no admin_pin (taken without --join-code) and no --admin-pin given; "
              "the PIN will be the schema default 1050 after restore", file=sys.stderr)

    def strip(rows: list[dict], drop: tuple[str, ...]) -> list[dict]:
        return [{k: v for k, v in r.items() if k not in drop} for r in rows]

    children = {
        "p_divisions": strip(data["divisions"], ("meet_id",)),
        "p_events": strip(data["events"], ("meet_id",)),
        "p_athletes": strip(data["athletes"], ("meet_id",)),
        "p_results": strip(data["results"], ("meet_id", "server_at")),
    }
    print(f"restoring {data['slug']!r} from {dump_path.name} (dumped {data['dumped_at']} from {data['supabase_url']})")
    print(f"target    {api.url} slug {meet['slug']!r}")
    for k, v in children.items():
        print(f"{k[2:]:<10} {len(v)}")
    out = api.rpc("zt_publish_meet", {"p_meet": meet, **children})
    print(f"published meet id {out.get('id')} join code {out.get('join_code')}")
    # verify by counting what the server now holds
    for table in ("divisions", "events", "athletes", "results"):
        n = len(api.get_all(table, f"meet_id=eq.{out['id']}&select=id"))
        flag = "" if n == len(children["p_" + table]) else "   <-- differs from dump (LWW kept newer server rows?)"
        print(f"server {table:<10} {n}{flag}")
    print("live_state is not restored; judge phones rewrite it on their next sync.")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("slug", nargs="?", help="meet slug to dump (Meet Details -> URL slug)")
    ap.add_argument("--env", default=".env.local", help="env file with the Supabase URL and anon key (default .env.local)")
    ap.add_argument("--out", default="dumps", help="output directory for dumps (default dumps/, gitignored)")
    ap.add_argument("--join-code", help="meet join code; adds admin_pin and join_code to the dump via zt_meet_by_join_code")
    ap.add_argument("--restore", metavar="DUMP_JSON", help="restore this dump through zt_publish_meet instead of dumping")
    ap.add_argument("--email", help="with --restore: promoter account email (or env ZT_ACCOUNT_EMAIL); password from ZT_ACCOUNT_PASSWORD or a prompt")
    ap.add_argument("--slug", dest="restore_slug", help="with --restore: publish under this slug instead of the dumped one")
    ap.add_argument("--admin-pin", help="with --restore: admin PIN to set when the dump lacks one")
    args = ap.parse_args()

    url, key = load_env(args.env)
    api = Api(url, key)
    if args.restore:
        email = args.email or os.environ.get("ZT_ACCOUNT_EMAIL")
        if not email:
            sys.exit("--restore needs --email (or ZT_ACCOUNT_EMAIL in the environment)")
        password = os.environ.get("ZT_ACCOUNT_PASSWORD") or getpass.getpass(f"password for {email}: ")
        api.sign_in(email, password)
        restore(api, Path(args.restore), args.restore_slug, args.admin_pin)
    else:
        if not args.slug:
            ap.error("slug is required unless --restore is given")
        dump(api, args.slug, Path(args.out), args.join_code)


if __name__ == "__main__":
    main()
