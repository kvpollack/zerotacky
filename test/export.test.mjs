import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
const ROOT = process.env.ZT_ROOT || '..';
const X = await import(`${ROOT}/lib/export.ts`);
const P = await import(`${ROOT}/lib/presets/index.ts`);
const { getGroupsSeedState } = await import('./fixtures/groupsSeed.ts');

const withResults = () => {
  const s = getGroupsSeedState();
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
    const s = withResults(); s.athletes[0].name = 'Rourke, Jenna "JJ"';
    const csv = X.resultsToCsv(s);
    const lines = csv.split('\r\n').filter(Boolean);
    assert.equal(lines[0], 'Division,Flight,Athlete,Lot,Status,Ev1 Basket Deadlift (For Reps),Ev1 Place,Ev1 Pts,Ev2 Keg Over Bar (For Reps),Ev2 Place,Ev2 Pts,Ev3 50ft Harness Truck Pull,Ev3 Place,Ev3 Pts,Total Pts,Event Wins,Overall Place');
    assert.equal(lines.length, 1 + s.athletes.length);
    assert.equal(lines[1], 'Group 1,A,"Rourke, Jenna ""JJ""",1,active,12 reps,1,4,,,,,,,4,1,1');
    assert.equal(lines[3], 'Group 1,A,Ava Sinclair,3,active,0 reps,4,0,,,,,,,0,0,3');
  });
  test('standings text lists divisions in order with places and points', () => {
    const s = withResults();
    const txt = X.standingsText(s, s.divisions.filter((d) => d.id === 'sf-g1'));
    assert.equal(txt, ['IRON HARBOR GROUPS INVITATIONAL 2026', '2026-10-24', '', 'Group 1',
      '1. Jenna Rourke - 4 pts', '2. Erin Shaw - 3 pts', 'T-3. Ava Sinclair - 0 pts', 'T-3. Gia Gallo - 0 pts'].join('\n'));   // R-M5: full ties share the place
  });
  test('neutralizeFormula: formula prefixes get an apostrophe, plain numbers and words do not (BLD-05)', () => {
    assert.equal(X.neutralizeFormula('=SUM(A1)'), "'=SUM(A1)");
    assert.equal(X.neutralizeFormula('+1+1'), "'+1+1");
    assert.equal(X.neutralizeFormula('@cmd'), "'@cmd");
    assert.equal(X.neutralizeFormula('-1+1'), "'-1+1");
    assert.equal(X.neutralizeFormula('\tx'), "'\tx");
    assert.equal(X.neutralizeFormula('-5'), '-5');
    assert.equal(X.neutralizeFormula('-72.5'), '-72.5');
    assert.equal(X.neutralizeFormula('T-1'), 'T-1');
    assert.equal(X.neutralizeFormula('—'), '—');
    assert.equal(X.neutralizeFormula('Émile'), 'Émile');
    // numbers in rows are not strings, so they pass through csv untouched
    const csv = X.toCsv([['a', -5, '=x']]);
    assert.equal(csv, "a,-5,'=x\r\n");
  });

  test('withCsvBom prepends the UTF-8 BOM once (BLD-04)', async () => {
    const D = await import(`${ROOT}/lib/download.js`);
    assert.equal(D.withCsvBom('a,b'), '\uFEFFa,b');
    assert.equal(D.withCsvBom('\uFEFFa,b'), '\uFEFFa,b');
  });

  test('backup filename is slug + timestamp', () => {
    assert.equal(X.backupFilename(withResults(), new Date('2026-10-24T13:05:00Z')), 'zerotacky-iron-harbor-groups-invitational-2026-2026-10-24-13-05');
  });
});
