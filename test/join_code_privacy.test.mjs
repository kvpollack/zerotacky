// MD-01 canary (Astra audit 11/6): zt_meet_by_join_code returns a whole meets row to anyone holding a volunteer join code,
// so every meets column that is NOT in the public column grant must be nulled inside the function (046's `staff` was
// not, and judges' phone numbers leaked). This test recomputes the private set from the migrations themselves, so a
// future `alter table meets add column` without a grant line fails here until the RPC nulls it.
import { test, describe } from 'bun:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.env.ZT_ROOT || '..';
const dir = join(import.meta.dir, ROOT, 'supabase');
const files = readdirSync(dir).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort();
const strip = (s) => s.replace(/--[^\n]*/g, '');          // drop line comments before pattern matching
const sql = files.map((f) => ({ f, body: strip(readFileSync(join(dir, f), 'utf8')) }));

function meetsColumns() {
  const cols = new Set();
  const create = sql[0].body.match(/create table if not exists meets \(([\s\S]*?)\n\);/);
  assert.ok(create, '001 must define meets');
  for (const line of create[1].split('\n')) {
    const m = line.match(/^\s*([a-z_]+)\s+[a-z]/);
    if (m) cols.add(m[1]);
  }
  for (const { body } of sql) {
    for (const m of body.matchAll(/alter table meets add column if not exists ([a-z_]+)/g)) cols.add(m[1]);
  }
  return cols;
}

function publicGrant() {
  // The newest column-level grant list wins; later single-column grants add to it.
  let base = null, extra = [];
  for (const { body } of sql) {
    for (const m of body.matchAll(/grant select \(([^)]+)\) on meets to anon, authenticated/g)) {
      const list = m[1].split(',').map((s) => s.trim()).filter(Boolean);
      if (list.length > 3) { base = list; extra = []; } else extra.push(...list);
    }
  }
  assert.ok(base, 'a column-level grant list must exist');
  return new Set([...base, ...extra]);
}

function latestJoinRpcBody() {
  let body = null;
  for (const { body: b } of sql) {
    for (const m of b.matchAll(/create or replace function zt_meet_by_join_code\(p_code text\)[\s\S]*?\$\$([\s\S]*?)\$\$;/g)) body = m[1];
  }
  assert.ok(body, 'zt_meet_by_join_code must be defined');
  return body;
}

describe('zt_meet_by_join_code privacy canary (MD-01)', () => {
  const cols = meetsColumns();
  const pub = publicGrant();
  const body = latestJoinRpcBody();
  const priv = [...cols].filter((c) => !pub.has(c) && c !== 'join_code');

  test('the migrations define the columns this test expects to reason about', () => {
    assert.ok(cols.has('staff') && cols.has('admin_pin') && cols.has('owner_id'), [...cols].join(','));
    assert.ok(pub.has('sponsors') && pub.has('schedule') && !pub.has('staff'), [...pub].join(','));
    assert.ok(priv.includes('staff') && priv.includes('admin_pin'));
  });

  test('every private meets column is nulled before the row leaves the RPC', () => {
    const missing = priv.filter((c) => !new RegExp(`r\\.${c}\\s*:=\\s*null`).test(body));
    assert.deepEqual(missing, [], `zt_meet_by_join_code must null: ${missing.join(', ')} (add r.<col> := null in the newest migration)`);
  });

  test('the client fake mirrors the server: join-code rows carry no admin_pin or staff', async () => {
    const F = await import('./fake_supabase.mjs');
    const src = readFileSync(join(import.meta.dir, 'fake_supabase.mjs'), 'utf8');
    assert.match(src, /zt_meet_by_join_code[\s\S]*?admin_pin: null, staff: null/);
    assert.ok(F, 'fake module loads');
  });
});
