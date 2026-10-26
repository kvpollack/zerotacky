import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.env.ZT_ROOT || '..';
const { readResume, refreshResumeStatus, meetIsOver } = await import(`${ROOT}/lib/landing.ts`);
const { STORAGE_KEY, ROLE_STORAGE_KEY } = await import(`${ROOT}/lib/constants.ts`);
const { LINK_KEY } = await import(`${ROOT}/lib/sync/controller.ts`);

const mem = (o = {}) => ({ getItem: (k) => (k in o ? o[k] : null) });
const state = (over = {}) => JSON.stringify({ meet: { id: 'm1', name: 'Strongfest 2026', ...over.meet }, divisions: [], events: [], athletes: over.athletes ?? [], results: over.results ?? [] });
const link = (role = 'device', extra = {}) => JSON.stringify({ meetId: 'u1', localMeetId: 'm1', slug: 'strongfest-2026', joinCode: 'NS4J82', role, since: null, ...extra });
const rwMem = (o = {}) => { const m = new Map(Object.entries(o)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; };
const statusClient = (rows, log = []) => ({ select: async (table, query) => { log.push({ table, query }); if (rows instanceof Error) throw rows; return rows; } });

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
  // 10/26: a meet the promoter finalized is over for every phone that carried it.
  test('linked meet cached as completed -> nothing (Resume is for meet day)', () => {
    for (const st of ['completed', 'cancelled']) {
      assert.equal(readResume(mem({ [STORAGE_KEY]: state(), [LINK_KEY]: link('admin', { competitionStatus: st }) })), null, st);
    }
  });
  test('linked meet cached as in_progress / scheduled / absent -> still Resume', () => {
    for (const st of ['in_progress', 'scheduled', null, undefined]) {
      const l = st === undefined ? link('admin') : link('admin', { competitionStatus: st });
      assert.deepEqual(readResume(mem({ [STORAGE_KEY]: state(), [LINK_KEY]: l })), { meetName: 'Strongfest 2026', roleLabel: 'Promoter' }, String(st));
    }
  });
  test('meetIsOver: completed/cancelled only', () => {
    assert.equal(meetIsOver('completed'), true); assert.equal(meetIsOver('cancelled'), true);
    assert.equal(meetIsOver('in_progress'), false); assert.equal(meetIsOver(null), false); assert.equal(meetIsOver(undefined), false);
  });
});

describe('root splash: refreshResumeStatus (live check for a meet finalized from the website)', () => {
  test('no link -> false, no network', async () => {
    const log = [];
    assert.equal(await refreshResumeStatus(rwMem(), statusClient([], log)), false);
    assert.equal(log.length, 0);
  });
  test('server says completed -> true, status cached on the link so readResume is null next visit', async () => {
    const s = rwMem({ [STORAGE_KEY]: state(), [LINK_KEY]: link('admin') });
    const log = [];
    assert.deepEqual(readResume(s)?.roleLabel, 'Promoter');
    assert.equal(await refreshResumeStatus(s, statusClient([{ competition_status: 'completed' }], log)), true);
    assert.equal(log[0].table, 'meets'); assert.match(log[0].query, /id=eq\.u1/);
    assert.equal(JSON.parse(s.getItem(LINK_KEY)).competitionStatus, 'completed');
    assert.equal(JSON.parse(s.getItem(LINK_KEY)).joinCode, 'NS4J82');   // rest of the link intact
    assert.equal(readResume(s), null);
  });
  test('server says in_progress -> false, status cached, card stays', async () => {
    const s = rwMem({ [STORAGE_KEY]: state(), [LINK_KEY]: link('admin') });
    assert.equal(await refreshResumeStatus(s, statusClient([{ competition_status: 'in_progress' }])), false);
    assert.equal(JSON.parse(s.getItem(LINK_KEY)).competitionStatus, 'in_progress');
    assert.ok(readResume(s));
  });
  test('meet not visible (empty rows) or network error -> false, link untouched', async () => {
    for (const rows of [[], new Error('offline')]) {
      const s = rwMem({ [STORAGE_KEY]: state(), [LINK_KEY]: link('admin') });
      assert.equal(await refreshResumeStatus(s, statusClient(rows)), false);
      assert.equal(s.getItem(LINK_KEY), link('admin'));
    }
  });
  test('a meet reopened on the server clears a stale completed cache', async () => {
    const s = rwMem({ [STORAGE_KEY]: state(), [LINK_KEY]: link('admin', { competitionStatus: 'completed' }) });
    assert.equal(readResume(s), null);
    assert.equal(await refreshResumeStatus(s, statusClient([{ competition_status: 'in_progress' }])), false);
    assert.ok(readResume(s));
  });
});
