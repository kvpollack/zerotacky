import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.env.ZT_ROOT || '..';
const P = await import(`${ROOT}/lib/website/prepSheet.ts`);

const show = {
  name: 'Iron Harbor Classic 2026', date: '2026-11-14', slug: 'iron-harbor-classic-2026',
  state: {
    divisions: [
      { id: 'd2', name: 'Open Men', sortOrder: 2 },
      { id: 'd1', name: 'Novice Women', sortOrder: 1 },
    ],
    events: [
      { id: 'e2', eventNumber: 2, name: 'Yoke, "the walk"', scoringType: 'time_or_distance', timeCapSeconds: 60,
        divisionWeights: { d1: 300, d2: 600 }, spec: { implement: 'yoke', courseFeet: 50, allowed: ['belt'], notAllowed: ['tacky', 'straps'], videoUrl: 'https://youtu.be/x', notes: 'Drops allowed.' } },
      { id: 'e1', eventNumber: 1, name: 'Log Press', scoringType: 'reps', timeCapSeconds: 90, divisionWeights: { d1: 0, d2: 230 },
        fixedImplementDescription: '12 in steel log', divisionDefaultHeights: {}, spec: { videoUrl: 'javascript:alert(1)' } },
      { id: 'e3', eventNumber: 3, name: 'Stones', scoringType: 'time_or_implements', timeCapSeconds: 75, maxFormat: 'rising_bar', risingBarWeights: [200, 240, 280], divisionWeights: {} },
    ],
  },
};

describe('buildPrepSheet', () => {
  test('all divisions: events sorted, one weight per division in sort order, spec fields read', () => {
    const s = P.buildPrepSheet(show, null);
    assert.equal(s.division, null);
    assert.deepEqual(s.divisions.map((d) => d.name), ['Novice Women', 'Open Men']);
    assert.deepEqual(s.rows.map((r) => r.eventNumber), [1, 2, 3]);
    const yoke = s.rows[1];
    assert.equal(yoke.implement, 'Yoke');
    assert.equal(yoke.courseFeet, 50);
    assert.equal(yoke.allowed, 'Belt');
    assert.equal(yoke.notAllowed, 'Tacky, Straps');
    assert.equal(yoke.videoUrl, 'https://youtu.be/x');
    assert.equal(yoke.notes, 'Drops allowed.');
    assert.deepEqual(yoke.weights.map((w) => [w.divisionName, w.main, w.kg]), [['Novice Women', '300 lbs', '136 kg'], ['Open Men', '600 lbs', '272 kg']]);
    assert.equal(s.rows[2].risingBar, '200 \u2192 240 \u2192 280 lb');
    assert.equal(s.rows[2].weights[0].main, '');
  });
  test('one division narrows the weights; an unknown id means all; unsafe video dropped; fixed implement becomes a note', () => {
    const s = P.buildPrepSheet(show, 'd2');
    assert.equal(s.division.name, 'Open Men');
    assert.deepEqual(s.rows[0].weights.map((w) => w.main), ['230 lbs']);
    assert.equal(s.rows[0].videoUrl, '');
    assert.equal(s.rows[0].notes, '12 in steel log');
    assert.equal(s.rows[0].scoring, 'For reps');
    assert.equal(P.buildPrepSheet(show, 'nope').division, null);
  });
});

describe('prepSheetCsv', () => {
  test('one division: trio of weight columns; quotes and commas escaped; CRLF rows', () => {
    const csv = P.prepSheetCsv(P.buildPrepSheet(show, 'd2'));
    const lines = csv.split('\r\n');
    assert.equal(lines[0], 'Event,Name,Scoring,Time cap (s),Implement,Course (ft),Allowed,Not allowed,Rising bar,Weight (Open Men),kg,Setup,Notes,Video');
    assert.equal(lines[2], '2,"Yoke, ""the walk""",Fastest time / distance if capped,60,Yoke,50,Belt,"Tacky, Straps",,600 lbs,272 kg,,Drops allowed.,https://youtu.be/x');
    assert.equal(lines.at(-1), '');
  });
  test('all divisions: one weight column per division with kg in parentheses', () => {
    const csv = P.prepSheetCsv(P.buildPrepSheet(show, null));
    const lines = csv.split('\r\n');
    assert.match(lines[0], /Rising bar,Weight \(Novice Women\),Weight \(Open Men\),Notes,Video$/);
    assert.match(lines[2], /,300 lbs \(136 kg\),600 lbs \(272 kg\),/);
    assert.match(lines[3], /,200 \u2192 240 \u2192 280 lb,,,,/);
  });
});

describe('names and labels', () => {
  test('filename, href and time cap', () => {
    assert.equal(P.prepSheetFilename(P.buildPrepSheet(show, 'd2')), 'iron-harbor-classic-2026-prep-open-men.csv');
    assert.equal(P.prepSheetFilename(P.buildPrepSheet(show, null)), 'iron-harbor-classic-2026-prep.csv');
    assert.equal(P.prepSheetHref('a b', 'd1'), '/shows/a%20b/prep?division=d1');
    assert.equal(P.prepSheetHref('x', 'ALL'), '/shows/x/prep');
    assert.equal(P.timeCapLabel(60), '60s');
    assert.equal(P.timeCapLabel(90), '1:30');
    assert.equal(P.timeCapLabel(0), '');
  });
});
