import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.env.ZT_ROOT || '..';
const { readResume } = await import(`${ROOT}/lib/landing.ts`);
const { STORAGE_KEY, ROLE_STORAGE_KEY } = await import(`${ROOT}/lib/constants.ts`);
const { LINK_KEY } = await import(`${ROOT}/lib/sync/controller.ts`);

const mem = (o = {}) => ({ getItem: (k) => (k in o ? o[k] : null) });
const state = (over = {}) => JSON.stringify({ meet: { id: 'm1', name: 'Strongfest 2026', ...over.meet }, divisions: [], events: [], athletes: over.athletes ?? [], results: over.results ?? [] });
const link = (role = 'device') => JSON.stringify({ meetId: 'u1', localMeetId: 'm1', slug: 'strongfest-2026', joinCode: 'NS4J82', role, since: null });

describe('root splash: readResume', () => {
  test('empty phone -> nothing to resume', () => {
    assert.equal(readResume(mem()), null);
  });
  test('scorer opened once, default demo state, no athletes -> nothing', () => {
    assert.equal(readResume(mem({ [STORAGE_KEY]: state({ meet: { isDemo: true } }) })), null);
  });
  test('demo roster without a link -> nothing (demo data is not the promoter\'s work)', () => {
    assert.equal(readResume(mem({ [STORAGE_KEY]: state({ meet: { isDemo: true }, athletes: [{ id: 'a' }] }) })), null);
  });
  test('joined judge phone -> Resume with meet name and role', () => {
    const r = readResume(mem({ [STORAGE_KEY]: state(), [LINK_KEY]: link(), [ROLE_STORAGE_KEY]: 'judge' }));
    assert.deepEqual(r, { meetName: 'Strongfest 2026', roleLabel: 'Judge' });
  });
  test('published admin phone (no role key) -> Promoter', () => {
    const r = readResume(mem({ [STORAGE_KEY]: state(), [LINK_KEY]: link('admin') }));
    assert.deepEqual(r, { meetName: 'Strongfest 2026', roleLabel: 'Promoter' });
  });
  test('offline promoter building a real meet (athletes, no link) -> Offline meet', () => {
    const r = readResume(mem({ [STORAGE_KEY]: state({ athletes: [{ id: 'a' }] }) }));
    assert.deepEqual(r, { meetName: 'Strongfest 2026', roleLabel: 'Offline meet' });
  });
  test('corrupt storage -> null, never throws', () => {
    assert.equal(readResume(mem({ [STORAGE_KEY]: '{not json', [LINK_KEY]: 'x' })), null);
  });
  test('link without a meet name -> Untitled meet', () => {
    const r = readResume(mem({ [LINK_KEY]: link(), [ROLE_STORAGE_KEY]: 'pitcrew' }));
    assert.deepEqual(r, { meetName: 'Untitled meet', roleLabel: 'Pit crew' });
  });
});
