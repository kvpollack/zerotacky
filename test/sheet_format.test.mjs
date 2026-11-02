// UI transition Phase 3: pure formatting behind the website sheets (lib/website/sheetFormat.ts).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.env.ZT_ROOT || '..';
const F = await import(`${ROOT}/lib/website/sheetFormat.ts`);

describe('sheetFormat dates', () => {
  test('splitIsoDate splits an ISO day into pen numeral and caption', () => {
    assert.deepEqual(F.splitIsoDate('2026-10-24'), { day: '24', rest: 'Oct 2026' });
    assert.deepEqual(F.splitIsoDate('2026-11-14T09:00:00Z'), { day: '14', rest: 'Nov 2026' });
    assert.deepEqual(F.splitIsoDate('TBD'), { day: '', rest: 'TBD' });
    assert.deepEqual(F.splitIsoDate(undefined), { day: '', rest: '' });
  });
  test('longIsoDate is weekday-day-month-year with no time zone drift', () => {
    assert.equal(F.longIsoDate('2026-11-14'), 'Sat 14 Nov 2026');
    assert.equal(F.longIsoDate('2026-10-24'), 'Sat 24 Oct 2026');
    assert.equal(F.longIsoDate('2026-01-01'), 'Thu 01 Jan 2026');
    assert.equal(F.longIsoDate('soon'), 'soon');
  });
  test('shortIsoDate is day and month', () => {
    assert.equal(F.shortIsoDate('2026-08-15'), '15 Aug');
    assert.equal(F.shortIsoDate(''), '');
  });
});

describe('sheetFormat venue and rows', () => {
  test('venueLine joins facility and place, collapsing repeated placeholders', () => {
    assert.equal(F.venueLine({ facilityName: 'The Power Plant Gym', city: 'York', state: 'PA', country: 'US' }), 'The Power Plant Gym, York PA');
    assert.equal(F.venueLine({ city: 'Erie', state: 'PA', country: 'US' }), 'Erie PA');
    assert.equal(F.venueLine({ facilityName: 'Not provided', city: 'Not provided', state: '', country: 'US' }), 'Not provided');
  });
  test('showRowStatus reads one phrase per lifecycle, live in pen', () => {
    assert.deepEqual(F.showRowStatus({ competitionStatus: 'live', registrationStatus: 'closed', resultsStatus: 'in_progress' }), { text: 'Live Now · Live Provisional Standings', live: true });
    assert.deepEqual(F.showRowStatus({ competitionStatus: 'completed', registrationStatus: 'closed', resultsStatus: 'finalized' }).live, false);
    assert.equal(F.showRowStatus({ competitionStatus: 'upcoming', registrationStatus: 'open', resultsStatus: 'not_started' }).text, 'Upcoming · Registration Open');
    assert.equal(F.showRowStatus({ competitionStatus: 'cancelled', registrationStatus: 'closed', resultsStatus: 'not_started' }).text, 'Cancelled');
  });
  test('showRowLink prefers the live board, then results, then the show page', () => {
    assert.deepEqual(F.showRowLink({ slug: 'x', competitionStatus: 'live', liveScoreboardPath: '/m/x' }), { href: '/m/x', label: 'Live board' });
    assert.deepEqual(F.showRowLink({ slug: 'x', competitionStatus: 'live' }), { href: '/shows/x', label: 'Show details' });
    assert.deepEqual(F.showRowLink({ slug: 'x', competitionStatus: 'completed' }), { href: '/shows/x', label: 'Results' });
    assert.deepEqual(F.showRowLink({ slug: 'x', competitionStatus: 'upcoming' }), { href: '/shows/x', label: 'Show details' });
  });
});

describe('sheetFormat fee', () => {
  test('splitFee lifts the amount out of a free-text fee', () => {
    assert.deepEqual(F.splitFee('$75 (Venmo or cash at weigh-in)'), { amount: '$75', note: '(Venmo or cash at weigh-in)' });
    assert.deepEqual(F.splitFee('$80'), { amount: '$80', note: '' });
    assert.deepEqual(F.splitFee('US$ 1,250.50 early bird'), { amount: 'US$1,250.50', note: 'early bird' });
    assert.deepEqual(F.splitFee('Free for members'), { amount: '', note: 'Free for members' });
    assert.deepEqual(F.splitFee(undefined), { amount: '', note: '' });
  });
});
