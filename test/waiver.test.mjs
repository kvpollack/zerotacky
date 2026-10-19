// The waiver the athlete sees is hashed into every registration (lib/promoter/waiverVersion.ts) and, since 007, the
// server accepts only versions listed in zt_waiver_versions. This test keeps the two in step: editing legal/WAIVER.md
// without adding its new hash to a migration would make every live registration fail with "waiver text has changed".
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, process.env.ZT_ROOT || '..');

describe('waiver version', () => {
  test('sha256(legal/WAIVER.md)[:12] is listed as an approved version in supabase/*.sql', () => {
    const text = readFileSync(path.join(ROOT, 'legal/WAIVER.md'), 'utf8');
    const version = createHash('sha256').update(text).digest('hex').slice(0, 12);
    const sql = readdirSync(path.join(ROOT, 'supabase'))
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(path.join(ROOT, 'supabase', f), 'utf8'))
      .join('\n');
    const listed = new RegExp(`insert into zt_waiver_versions[^;]*'${version}'`, 'i').test(sql);
    assert.ok(listed, `legal/WAIVER.md hashes to ${version}; add "insert into zt_waiver_versions (version, note) values ('${version}', ...)" to a migration`);
  });

  test('the server-only helper computes the same prefix the migration lists', async () => {
    const W = await import(`${process.env.ZT_ROOT || '..'}/lib/promoter/waiverVersion.ts`);
    const text = readFileSync(path.join(ROOT, 'legal/WAIVER.md'), 'utf8');
    const expected = createHash('sha256').update(text).digest('hex').slice(0, 12);
    assert.equal(W.waiverVersionOf(text), expected);
    assert.equal(W.WAIVER_VERSION_LENGTH, 12);
  });
});
