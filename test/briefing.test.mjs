import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.env.ZT_ROOT || '..';
const B = await import(`${ROOT}/lib/website/briefing.ts`);

const stations = [{ id: 'A', label: 'Station 1', eventOrder: ['e2', 'e1'] }, { id: 'B', label: 'Station 2' }];
const divisions = [
  { id: 'd1', meetId: 'm', name: 'Novice Women', flight: 'A', sortOrder: 0 },
  { id: 'd2', meetId: 'm', name: 'Open Men', flight: 'B', sortOrder: 1 },
];
const events = [
  { id: 'e1', meetId: 'm', eventNumber: 1, name: 'Log Press', scoringType: 'reps', timeCapSeconds: 60, lanes: 1, loadingPoints: 2, weightEntryMode: 'total', implementEmptyWeight: 0,
    divisionWeights: { d1: 120, d2: 230 }, spec: { implement: 'log', implementNote: '12 in', notAllowed: ['tacky'], notes: 'Elbows locked, head through.', videoUrl: 'https://youtu.be/x' } },
  { id: 'e2', meetId: 'm', eventNumber: 2, name: 'Yoke <Carry>', scoringType: 'time_or_distance', timeCapSeconds: 60, lanes: 1, loadingPoints: 4, weightEntryMode: 'total', implementEmptyWeight: 0,
    divisionWeights: { d1: 350 }, hasHeightCallout: true, heightLabel: 'Yoke height', divisionDefaultHeights: { d1: '7' } },
];
const staff = [
  { name: 'Pat', role: 'head_judge', station: 'A', contact: '555-0100', note: 'arrives 7:00' },
  { name: 'Lee', role: 'loader', station: 'station 1' },   // a row saved before ids were stored
  { name: 'Sam', role: 'scorer' },
  { name: 'Ro', role: 'judge', station: 'Pit 9' },
];
const input = { meetName: 'Iron & Harbor', meetDate: '2026-06-06', federation: 'Strongman Corporation', promoterContact: 'promo@x.y', schedule: { start: '09:00', rulesMeeting: '08:30' }, stations, divisions, events, staff };

describe('briefing cards (046, #12)', () => {
  test('one card per station in the station\'s running order, then the floating crew', () => {
    const cards = B.briefingCards(input);
    assert.deepEqual(cards.map((c) => c.title), ['Station 1', 'Station 2', 'Floating crew']);
    assert.deepEqual(cards[0].people.map((p) => `${p.name}/${p.role}`), ['Pat/Head judge', 'Lee/Loader']);
    assert.deepEqual(cards[0].divisions, ['Novice Women']);
    assert.deepEqual(cards[0].events.map((e) => e.number), [2, 1]);
    assert.deepEqual(cards[1].events.map((e) => e.number), [1, 2]);
    assert.deepEqual(cards[0].events[1].loads, ['Novice Women: 120 lb (54 kg)']);
    assert.deepEqual(cards[0].events[0].loads, ['Novice Women: 350 lb (159 kg), Yoke height 7']);
    assert.deepEqual(cards[0].events[1].spec, ['Log (12 in)', 'No tacky']);
    assert.equal(cards[0].events[1].videoUrl, 'https://youtu.be/x');
    assert.equal(cards[0].events[1].scoring, 'Reps, 60 s cap');
    assert.deepEqual(cards[2].people.map((p) => `${p.name}/${p.role}`), ['Ro/Judge (Pit 9)', 'Sam/Scorer']);
    assert.equal(cards[2].floating, true);
  });
  test('standards name the federation and flag a missing state rep and medic', () => {
    const s = B.standardsLines(input);
    assert.ok(s.some((l) => l.startsWith('Strongman Corporation sanction')));
    assert.ok(s.some((l) => l.startsWith('No state rep')));
    assert.ok(s.some((l) => l.startsWith('No medic')));
    const t = B.standardsLines({ federation: null, staff: [{ name: 'A', role: 'state_rep' }, { name: 'B', role: 'medic' }] });
    assert.ok(!t.some((l) => /No state rep|No medic|sanction/.test(l)));
    assert.ok(!B.standardsLines({ federation: 'Unsanctioned', staff: null }).some((l) => /sanction:/.test(l)));
  });
  test('briefingHtml escapes names and never leaks the contact field', () => {
    const html = B.briefingHtml(input);
    assert.ok(html.includes('Yoke &lt;Carry&gt;'));
    assert.ok(html.includes('Iron &amp; Harbor'));
    assert.ok(!html.includes('555-0100'));
    assert.ok(html.includes('Promoter: promo@x.y'));
    assert.ok(html.includes('first event 09:00'));
    assert.equal((html.match(/<section class="card">/g) ?? []).length, 3);
  });
  test('duplicate station labels keep the judge on one card and name the id (MD-15)', () => {
    const dup = [{ id: 'A', label: 'Station 1' }, { id: 'B', label: 'Station 1' }];
    const cards = B.briefingCards({ ...input, stations: dup, staff: [{ name: 'Ro', role: 'judge', station: 'B' }] });
    assert.deepEqual(cards.map((c) => c.title), ['Station 1 (A)', 'Station 1 (B)', 'Floating crew']);
    assert.deepEqual(cards.map((c) => c.people.map((p) => p.name)), [[], ['Ro'], []]);
  });
  test('a meet with no stations gets a single card holding every division', () => {
    const cards = B.briefingCards({ ...input, stations: [], divisions: divisions.map((d) => ({ ...d, flight: 'ALL' })), staff: null });
    assert.equal(cards.length, 2);
    assert.deepEqual(cards[0].divisions, ['Novice Women', 'Open Men']);
    assert.equal(cards[0].people.length, 0);
  });
});
