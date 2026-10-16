import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
const ROOT = process.env.ZT_ROOT || '..';
const X = await import(`${ROOT}/lib/export.ts`);
const P = await import(`${ROOT}/lib/presets/index.ts`);

const withResults = () => {
  const s = P.getInitialSeedState('strongfest-2026');
  const g1 = s.athletes.filter((a) => a.divisionId === 'sf-g1');
  s.results = [
    { id: `sf-ev-1_${g1[0].id}`, eventId: 'sf-ev-1', athleteId: g1[0].id, reps: 12, updatedAt: 1 },
    { id: `sf-ev-1_${g1[1].id}`, eventId: 'sf-ev-1', athleteId: g1[1].id, reps: 8, locked: true, updatedAt: 2 },
    { id: `sf-ev-1_${g1[2].id}`, eventId: 'sf-ev-1', athleteId: g1[2].id, reps: 0, updatedAt: 3 },
  ];
  return s;
};

describe('export/import', () => {
  test('JSON export round-trips through parseImportedState', () => {
    const s = withResults();
    const txt = X.exportStateJson(s, new Date('2026-10-24T13:00:00Z'));
    const parsed = JSON.parse(txt);
    assert.equal(parsed.format, 'zerotacky-meet'); assert.equal(parsed.exportedAt, '2026-10-24T13:00:00.000Z');
    assert.deepEqual(X.parseImportedState(txt), s);
  });
  test('bare localStorage state is accepted too', () => {
    const s = withResults();
    assert.deepEqual(X.parseImportedState(JSON.stringify(s)), s);
  });
  test('rejects garbage and dangling references with readable errors', () => {
    assert.throws(() => X.parseImportedState('nope'), /Not valid JSON/);
    assert.throws(() => X.parseImportedState('{"a":1}'), /Not a ZeroTacky file|Missing meet/);
    const s = withResults(); s.results.push({ id: 'x', eventId: 'sf-ev-1', athleteId: 'ghost', updatedAt: 1 });
    assert.throws(() => X.parseImportedState(JSON.stringify(s)), /unknown athlete/);
    const s2 = withResults(); s2.athletes[0].divisionId = 'nowhere';
    assert.throws(() => X.parseImportedState(JSON.stringify(s2)), /unknown division/);
  });
  test('CSV: header per event, one row per athlete, scores only for scored events, quoting', () => {
    const s = withResults(); s.athletes[0].name = 'Rucci, Jessica "JR"';
    const csv = X.resultsToCsv(s);
    const lines = csv.split('\r\n').filter(Boolean);
    assert.equal(lines[0], 'Division,Flight,Athlete,Lot,Status,Ev1 Basket Deadlift (For Reps),Ev1 Place,Ev1 Pts,Ev2 Keg Over Bar (For Reps),Ev2 Place,Ev2 Pts,Ev3 50ft Harness Truck Pull,Ev3 Place,Ev3 Pts,Total Pts,Event Wins,Overall Place');
    assert.equal(lines.length, 1 + s.athletes.length);
    assert.equal(lines[1], 'Group 1,A,"Rucci, Jessica ""JR""",1,active,12 reps,1,4,,,,,,,4,1,1');
    assert.equal(lines[3], 'Group 1,A,Amber Simcox,3,active,0 reps,4,0,,,,,,,0,0,3');
  });
  test('standings text lists divisions in order with places and points', () => {
    const s = withResults();
    const txt = X.standingsText(s, s.divisions.filter((d) => d.id === 'sf-g1'));
    assert.equal(txt, ['ALL OUT STRONGFEST 2026 (THE POWER PLANT GYM)', '2026-10-24', '', 'Group 1',
      '1. Jessica Rucci - 4 pts', '2. Emily Shaff - 3 pts', '3. Amber Simcox - 0 pts', '4. Grace Gullo - 0 pts'].join('\n'));
  });
  test('backup filename is slug + timestamp', () => {
    assert.equal(X.backupFilename(withResults(), new Date('2026-10-24T13:05:00Z')), 'zerotacky-all-out-strongfest-2026-the-power-plant-2026-10-24-13-05');
  });
});
