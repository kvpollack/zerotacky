// kg / m audit fixes (11/12, migration 061): result unit provenance (KM-03), stale-config refusal and admin re-read
// (KM-02), server-default keys cleared on config apply (KM-01), unit-aware spec guard and plate defaults (KM-07/08),
// federation header (KM-09), exact cross-unit ranking (KM-10), flip review plan (D1).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fakeServer } from './fake_supabase.mjs';

const ROOT = process.env.ZT_ROOT || '..';
const M = await import(`${ROOT}/lib/sync/mapping.ts`);
const C = await import(`${ROOT}/lib/sync/client.ts`);
const K = await import(`${ROOT}/lib/sync/controller.ts`);
const P = await import(`${ROOT}/lib/presets/index.ts`);
const B = await import(`${ROOT}/lib/website/prBoard.ts`);
const MB = await import(`${ROOT}/lib/meetBuilder.ts`);
const F = await import(`${ROOT}/lib/exportFederation.ts`);

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
let T = 1_770_000_000_000;
const clock = () => T;
function phone(server, deviceId, initialState) {
  const storage = memStorage();
  const box = { state: initialState, incoming: [], statuses: [] };
  const client = C.createSyncClient({ url: 'https://x.supabase.co', anonKey: 'A', fetchImpl: server.fetchImpl });
  const ctl = new K.SyncController({
    client, storage, deviceId,
    getState: () => box.state,
    onIncoming: (patch) => { box.incoming.push(patch); box.state = { ...box.state, ...patch }; if (patch.config) box.state = { ...box.state, meet: M.applyServerMeet(box.state.meet, patch.config.meet) }; },
    onStatus: (s) => box.statuses.push(s),
    now: clock,
  });
  if (/^a/.test(deviceId)) ctl.setAccessToken(`TOKEN_${deviceId}`, `user-${deviceId}`);
  box.mutate = (fn) => { box.state = fn(box.state); ctl.noteLocalChange(); };
  box.ctl = ctl; box.storage = storage;
  return box;
}
function score(state, evIdx, athIdx, patch, at) {
  const ev = state.events[evIdx], a = state.athletes[athIdx];
  const id = `${ev.id}_${a.id}`;
  return { ...state, results: [...state.results.filter((r) => r.id !== id), { id, eventId: ev.id, athleteId: a.id, tier: 'heavy', ...patch, updatedAt: at }] };
}
const metricSeed = () => { const s = P.getInitialSeedState('york-iron-2026'); return { ...s, meet: { ...s.meet, units: 'metric' } }; };
/** The promoter dashboard flips the meet on the server (zt_save_meet_config): new units and a new config stamp. */
function dashboardFlip(srv, meetId, units) {
  const m = srv.db.meets.find((x) => x.id === meetId);
  if (units === 'metric') m.units = 'metric'; else delete m.units;
  m.updated_at = new Date(Date.now() + 5_000 + Math.random() * 1000).toISOString();
  return m.updated_at;
}

describe('KM-01: applying a server config clears server-default keys', () => {
  test('a metric phone handed an imperial meet loses `units`; divisionFormat likewise; id and PIN stay local', () => {
    const prev = { id: 'local', name: 'Old', units: 'metric', divisionFormat: 'novice_open', adminPin: '4242', availablePlates: [25, 20] };
    const server = { id: 'remote', name: 'New', availablePlates: [45, 25] };
    const out = M.applyServerMeet(prev, server);
    assert.equal(out.id, 'local');
    assert.equal(out.adminPin, '4242');
    assert.equal(out.name, 'New');
    assert.ok(!('units' in out), 'units cleared');
    assert.ok(!('divisionFormat' in out), 'divisionFormat cleared');
    assert.deepEqual(out.availablePlates, [45, 25]);
  });
  test('a server meet that is metric sets units on an imperial phone', () => {
    const out = M.applyServerMeet({ id: 'l', name: 'x' }, { id: 'r', name: 'x', units: 'metric' });
    assert.equal(out.units, 'metric');
  });
});

describe('KM-03: result rows carry their unit; the server refuses a mismatch and the phone holds the row', () => {
  test('resultToRow stamps payload.units; rowToResult strips it so the result object stays unit-free', () => {
    const r = { id: 'e_a', eventId: 'e', athleteId: 'a', tier: 'heavy', reps: 5, updatedAt: T };
    const row = M.resultToRow(r, 'meet', 'dev', 'metric');
    assert.equal(row.payload.units, 'metric');
    const imperial = M.resultToRow(r, 'meet', 'dev', 'imperial');
    assert.equal(imperial.payload.units, 'imperial');
    assert.ok(!('units' in M.resultToRow(r, 'meet', 'dev').payload), 'no stamp when the caller gives no unit');
    const back = M.rowToResult(row);
    assert.ok(!('units' in back));
    assert.equal(back.reps, 5);
  });
  test('stateToRows stamps every result with the meet unit', () => {
    const s = score(metricSeed(), 0, 0, { reps: 3 }, T);
    const rows = M.stateToRows(s, { meetId: s.meet.id, slug: 'x', deviceId: 'd' });
    assert.ok(rows.results.length >= 1);
    assert.ok(rows.results.every((r) => r.payload.units === 'metric'));
  });
  test('offline score, then a legal server-side flip: the row is held with the server message, not relabelled', async () => {
    const srv = fakeServer();
    const admin = phone(srv, 'a1', metricSeed());
    const link = await admin.ctl.publish({ slug: 'metric-show' });
    assert.equal(srv.db.meets[0].units, 'metric');
    const judge = phone(srv, 'judge1', P.getInitialSeedState('york-iron-2026'));
    const remote = await judge.ctl.lookupJoinCode(link.joinCode);
    judge.state = remote.state;
    judge.ctl.attach(remote); await judge.ctl.checkAdminPin('1050');
    assert.equal(judge.state.meet.units, 'metric');
    srv.setOffline(true);
    judge.mutate((s) => score(s, 0, 0, { reps: 4 }, T += 1000));   // a 4-rep set scored while the pad said kg
    await judge.ctl.tick().catch(() => {});
    assert.equal(judge.ctl.status.pending, 1);
    dashboardFlip(srv, link.meetId, 'imperial');
    srv.setOffline(false);
    await judge.ctl.tick().catch(() => {});
    assert.equal(srv.db.results.length, 0, 'the kg-stamped row did not land on the lb meet');
    assert.equal(judge.ctl.status.held, 1);
    assert.match(judge.ctl.status.error, /UNITS_MISMATCH/);
    assert.equal(judge.ctl.status.pending, 1, 'still queued, never dropped');
    // the device also re-read the config: units gone (KM-01 through the merge)
    assert.ok(judge.incoming.some((p) => p.config), 'config re-read after the stamp moved');
    assert.ok(!('units' in judge.state.meet), 'judge meet is imperial again');
  });
});

describe('KM-02: admin phones follow the dashboard and cannot republish a stale setup', () => {
  test('publish records the server config stamp; a dashboard change is re-read on the next tick', async () => {
    const srv = fakeServer();
    const admin = phone(srv, 'a1', P.getInitialSeedState('york-iron-2026'));
    const link = await admin.ctl.publish({ slug: 'sf' });
    assert.equal(link.configAt, srv.db.meets[0].updated_at);
    assert.ok(link.configAt);
    const stamp = dashboardFlip(srv, link.meetId, 'metric');
    await admin.ctl.tick();
    assert.ok(admin.incoming.some((p) => p.config?.meet?.units === 'metric'), 'admin applied the dashboard flip');
    assert.equal(admin.state.meet.units, 'metric');
    assert.equal(admin.ctl.link.configAt, stamp);
    // republishing now is built on the fresh stamp and goes through, keeping metric
    const again = await admin.ctl.publish({ slug: 'sf' });
    assert.equal(srv.db.meets[0].units, 'metric');
    assert.equal(again.configAt, srv.db.meets[0].updated_at);
  });
  test('publish after an unseen dashboard change: the pre-pull loads it and the publish stops instead of overwriting', async () => {
    const srv = fakeServer();
    const admin = phone(srv, 'a1', P.getInitialSeedState('york-iron-2026'));
    const link = await admin.ctl.publish({ slug: 'sf' });
    const stamp = dashboardFlip(srv, link.meetId, 'metric');
    // no tick in between: the admin edits a name and publishes
    admin.state = { ...admin.state, meet: { ...admin.state.meet, name: 'Renamed' } };
    await assert.rejects(admin.ctl.publish({ slug: 'sf' }), /setup changed on the server/);
    assert.equal(srv.db.meets[0].units, 'metric', 'the server kept the dashboard flip');
    assert.notEqual(srv.db.meets[0].name, 'Renamed');
    assert.match(admin.ctl.status.publishError, /setup changed on the server/);
    assert.equal(admin.ctl.link.configAt, stamp, 'pull() recorded the server stamp');
    assert.equal(admin.state.meet.units, 'metric', 'the phone now shows the dashboard setup');
    // second attempt, now built on the fresh setup, goes through and keeps metric
    const again = await admin.ctl.publish({ slug: 'sf' });
    assert.equal(again.configAt, srv.db.meets[0].updated_at);
    assert.equal(srv.db.meets[0].units, 'metric');
  });
  test('race: a dashboard write between the pre-pull and the publish is refused server-side (STALE_CONFIG) and re-read', async () => {
    const srv = fakeServer();
    let armed = false;
    const racing = { ...srv, fetchImpl: (url, init) => { if (armed && /zt_publish_meet/.test(String(url))) { armed = false; dashboardFlip(srv, srv.db.meets[0].id, 'metric'); } return srv.fetchImpl(url, init); } };
    const admin = phone(racing, 'a1', P.getInitialSeedState('york-iron-2026'));
    await admin.ctl.publish({ slug: 'sf' });
    armed = true;
    admin.state = { ...admin.state, meet: { ...admin.state.meet, name: 'Renamed' } };
    await assert.rejects(admin.ctl.publish({ slug: 'sf' }), /STALE_CONFIG/);
    assert.equal(srv.db.meets[0].units, 'metric', 'the server kept the dashboard flip');
    assert.notEqual(srv.db.meets[0].name, 'Renamed');
    assert.match(admin.ctl.status.publishError, /STALE_CONFIG/);
    assert.equal(admin.ctl.link.configAt, srv.db.meets[0].updated_at, 'the refusal triggered a re-read');
    assert.equal(admin.state.meet.units, 'metric');
  });
  test('an admin link with no recorded stamp (pre-061) only records it, as before', async () => {
    const srv = fakeServer();
    const admin = phone(srv, 'a1', P.getInitialSeedState('york-iron-2026'));
    const link = await admin.ctl.publish({ slug: 'sf' });
    admin.ctl.link = { ...admin.ctl.link, configAt: null };
    dashboardFlip(srv, link.meetId, 'metric');
    await admin.ctl.tick();
    assert.ok(!admin.incoming.some((p) => p.config), 'no re-read without a stamp to compare against');
    assert.ok(admin.ctl.link.configAt, 'the stamp is recorded for next time');
  });
});

describe('KM-07 / KM-08: unit-aware spec guard and plate defaults', () => {
  test('normalizeState gives a metric meet kg plates and an imperial one lb plates', () => {
    const base = P.getInitialSeedState('york-iron-2026');
    const metric = MB.normalizeState({ ...base, meet: { ...base.meet, units: 'metric', availablePlates: undefined } });
    assert.deepEqual(metric.meet.availablePlates, [25, 20, 15, 10, 5, 2.5, 1.25]);
    const imperial = MB.normalizeState({ ...base, meet: { ...base.meet, availablePlates: undefined } });
    assert.ok(imperial.meet.availablePlates.includes(45));
  });
  test('validateMeet reports a course beyond the metric range and accepts it in feet', () => {
    const base = P.getInitialSeedState('york-iron-2026');
    const withCourse = (units) => ({ ...base, meet: { ...base.meet, units }, events: base.events.map((e, i) => i === 0 ? { ...e, spec: { ...(e.spec ?? {}), courseFeet: 2000 } } : e) });
    const m = MB.validateMeet(withCourse('metric'));
    assert.ok(m.problems.some((p) => /Event 1/.test(p) && /m\b|meter/i.test(p)), m.problems.join('\n'));
    const i = MB.validateMeet(withCourse('imperial'));
    assert.ok(!i.problems.some((p) => /course/i.test(p)), i.problems.join('\n'));
  });
});

describe('KM-09: federation export names the bodyweight unit', () => {
  test('header says Bodyweight (lb)', () => {
    const base = P.getInitialSeedState('york-iron-2026');
    const out = F.federationResultsCsv(base, { venue: null, federation: null, resultsUrl: 'https://www.zerotacky.com/shows/x' });
    assert.match(out, /^Division,Place,Athlete,Bodyweight \(lb\),Status,/m);
  });
});

describe('KM-10 / D2: exact cross-unit ranking and mirrors on every row', () => {
  const ev = (over) => ({
    eventId: 'e', eventName: 'Log Press (for reps)', scoringType: 'reps', units: 'imperial', implement: 'log', implementNote: null, weightLbs: 250,
    courseFeet: null, timeCapSeconds: 60, reps: 0, timeSeconds: 0, finished: false, distanceFeet: 0, implementsCompleted: 0, maxWeightLbs: 0, ...over,
  });
  const entry = (meetId, date, events) => ({
    meetId, slug: meetId, name: `Show ${meetId}`, date, href: `/shows/${meetId}`, venue: null, divisionName: 'Open', athleteName: 'A',
    place: 1, isTied: false, fieldSize: 5, totalPoints: 0, eventWins: 0, eventCount: events.length, withdrawn: false, events,
  });
  test('100.025 kg (220.52 lb) beats 220.5 lb: a tenth-of-a-pound rounding no longer decides', () => {
    const h = [
      entry('lb', '2026-10-24', [ev({ reps: 3, weightLbs: 220.5 })]),
      entry('kg', '2026-05-02', [ev({ reps: 3, weightLbs: 100.025, units: 'metric' })]),
    ];
    const [b] = B.competitionBests(h);
    assert.equal(b.showName, 'Show kg');
  });
  test('10 m (32.81 ft) beats 32.8 ft on a DNF distance', () => {
    const h = [
      entry('lb', '2026-10-24', [ev({ scoringType: 'time_or_distance', weightLbs: 0, courseFeet: 100, distanceFeet: 32.8 })]),
      entry('kg', '2026-05-02', [ev({ scoringType: 'time_or_distance', weightLbs: 0, courseFeet: 30, distanceFeet: 10, units: 'metric' })]),
    ];
    const [b] = B.competitionBests(h);
    assert.equal(b.showName, 'Show kg');
  });
  test('imperial rows mirror kg and m like metric rows mirror lb and ft', () => {
    assert.equal(B.formatBestResult(ev({ reps: 3, weightLbs: 250 })), '3 reps at 250 lb (113 kg)');
    assert.equal(B.formatBestResult(ev({ reps: 3, weightLbs: 115, units: 'metric' })), '3 reps at 115 kg (254 lb)');
    assert.equal(B.formatBestResult(ev({ scoringType: 'time_or_distance', weightLbs: 700, courseFeet: 50, finished: true, timeSeconds: 19.2 })), '19.20 s at 700 lb (318 kg) over 50 ft (15 m)');
    assert.equal(B.formatBestResult(ev({ scoringType: 'time_or_distance', weightLbs: 0, courseFeet: 30, distanceFeet: 20, units: 'metric' })), '20 of 30 m (98 ft)');
  });
});

describe('D1: a unit flip plans a clear of every stored number, never a conversion', () => {
  test('planUnitFlip lists collars, implement weights, division and light weights, rising bar steps and courses', () => {
    const base = P.getInitialSeedState('york-iron-2026');
    const ev0 = { ...base.events[0], implementEmptyWeight: 110, collarWeightPerPair: 5, divisionWeights: { d1: 225 }, divisionLightWeights: { d1: 185 }, risingBarWeights: [200, 220], spec: { implement: 'log', courseFeet: 50 } };
    const ev1 = { ...base.events[1], implementEmptyWeight: 0, divisionWeights: { d1: 0 }, divisionLightWeights: undefined, collarWeightPerPair: undefined, risingBarWeights: [], spec: { implement: 'yoke' } };
    const meet = { ...base.meet, collarWeightPerPair: 5 };
    const plan = MB.planUnitFlip(meet, [ev0, ev1], 'metric');
    assert.equal(plan.meetPatch.units, 'metric');
    assert.deepEqual(plan.meetPatch.availablePlates, [25, 20, 15, 10, 5, 2.5, 1.25]);
    assert.equal(plan.meetPatch.collarWeightPerPair, 0);
    assert.equal(plan.eventPatches.length, 1, 'the event with nothing stored needs no patch');
    const p = plan.eventPatches[0].patch;
    assert.equal(p.implementEmptyWeight, 0);
    assert.deepEqual(p.divisionWeights, { d1: 0 });
    assert.deepEqual(p.divisionLightWeights, {});
    assert.deepEqual(p.risingBarWeights, []);
    assert.equal(p.collarWeightPerPair, 0);
    assert.deepEqual(p.spec, { implement: 'log' });
    assert.ok(plan.cleared[0] === 'default collar weight');
    assert.match(plan.cleared[1], /^Event 1 .*: empty implement weight, division weights, light weights, rising bar steps, collar weight, course length$/);
  });
  test('a blank meet flips with nothing to clear', () => {
    const base = P.getInitialSeedState('york-iron-2026');
    const events = base.events.map((e) => ({ ...e, implementEmptyWeight: 0, divisionWeights: {}, divisionLightWeights: undefined, risingBarWeights: undefined, collarWeightPerPair: undefined, spec: undefined }));
    const plan = MB.planUnitFlip({ ...base.meet, collarWeightPerPair: 0 }, events, 'metric');
    assert.deepEqual(plan.cleared, []);
    assert.equal(plan.eventPatches.length, 0);
  });
  test('applying the plan through updateEvent leaves a state validateMeet still accepts and the numbers at zero', () => {
    const base = P.getInitialSeedState('york-iron-2026');
    const plan = MB.planUnitFlip(base.meet, base.events, 'metric');
    let s = { ...base, meet: { ...base.meet, ...plan.meetPatch } };
    for (const { id, patch } of plan.eventPatches) s = MB.updateEvent(s, id, patch);
    assert.equal(s.meet.units, 'metric');
    assert.ok(s.events.every((e) => Object.values(e.divisionWeights).every((w) => w === 0)));
    assert.ok(s.events.every((e) => !e.spec || e.spec.courseFeet === undefined));
    assert.ok(s.events.every((e) => !(e.risingBarWeights?.length)));
  });
});
