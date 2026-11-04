// Feature 2 (11/3): external show listings (lib/website/externalShows.ts) and their row treatment in sheetFormat.ts.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.env.ZT_ROOT || '..';
const X = await import(`${ROOT}/lib/website/externalShows.ts`);
const SF = await import(`${ROOT}/lib/website/sheetFormat.ts`);

const row = {
  id: 'a1b2',
  name: 'Keystone Classic',
  date: '2099-05-02',
  city: 'Harrisburg',
  state: 'PA',
  facility_name: 'Keystone Barbell',
  federation: 'USS',
  divisions_note: 'Novice; Open, Masters\nTeens',
  registration_url: 'https://www.ironpodium.com/events/keystone',
  source: 'promoter',
  status: 'listed',
  updated_at: '2026-11-03T12:00:00Z',
};

describe('externalHost', () => {
  test('strips protocol and www', () => {
    assert.equal(X.externalHost('https://www.ironpodium.com/events/1'), 'ironpodium.com');
    assert.equal(X.externalHost('http://strongmancorporation.com/x'), 'strongmancorporation.com');
  });
  test('falls back to the raw string for a non-URL', () => {
    assert.equal(X.externalHost('not a url'), 'not a url');
  });
});

describe('isoToday (US show day, BLD-09)', () => {
  test('a show still running at 19:01 ET on 11/3 is still on 11/3', () => {
    assert.equal(X.isoToday(new Date('2026-11-03T19:01:00-05:00')), '2026-11-03');
  });
  test('rolls over at midnight Pacific, not UTC', () => {
    assert.equal(X.isoToday(new Date('2026-11-03T23:30:00-05:00')), '2026-11-03');   // 20:30 PT
    assert.equal(X.isoToday(new Date('2026-11-04T02:59:00-05:00')), '2026-11-03');   // 23:59 PT
    assert.equal(X.isoToday(new Date('2026-11-04T03:00:00-05:00')), '2026-11-04');   // 00:00 PT
  });
  test('summer time too (PDT)', () => {
    assert.equal(X.isoToday(new Date('2026-07-05T02:59:00-04:00')), '2026-07-04');
  });
});

describe('externalRowToSummary', () => {
  test('maps to an upcoming PublicShowSummary that links out', () => {
    const s = X.externalRowToSummary(row);
    assert.equal(s.id, 'ext-a1b2');
    assert.equal(s.slug, 'ext-a1b2');
    assert.equal(s.name, 'Keystone Classic');
    assert.equal(s.date, '2099-05-02');
    assert.deepEqual(s.venue, { city: 'Harrisburg', state: 'PA', country: 'US', facilityName: 'Keystone Barbell' });
    assert.equal(s.federation, 'USS');
    assert.equal(s.competitionStatus, 'upcoming');
    assert.equal(s.registrationStatus, 'not_provided');
    assert.equal(s.resultsStatus, 'not_started');
    assert.equal(s.isDemoFixture, false);
    assert.deepEqual(s.implementTags, []);
    assert.deepEqual(s.divisionLabels, ['Novice', 'Open', 'Masters', 'Teens']);
    assert.equal(s.externalUrl, row.registration_url);
    assert.equal(s.externalHost, 'ironpodium.com');
  });
  test('omits facilityName and federation when null; empty note gives no division labels', () => {
    const s = X.externalRowToSummary({ ...row, facility_name: null, federation: null, divisions_note: null });
    assert.deepEqual(s.venue, { city: 'Harrisburg', state: 'PA', country: 'US' });
    assert.equal(s.federation, undefined);
    assert.deepEqual(s.divisionLabels, []);
  });
});

describe('sheetFormat external branch', () => {
  test('status reads "Registers elsewhere" and is never live', () => {
    const s = X.externalRowToSummary(row);
    assert.deepEqual(SF.showRowStatus(s), { text: 'Upcoming · Registers elsewhere', live: false });
  });
  test('row link goes to the registration page, flagged external', () => {
    const s = X.externalRowToSummary(row);
    assert.deepEqual(SF.showRowLink(s), { href: row.registration_url, label: 'Listing', external: true });
  });
  test('ordinary rows are untouched', () => {
    assert.deepEqual(SF.showRowLink({ slug: 'x', competitionStatus: 'completed' }), { href: '/shows/x', label: 'Results' });
  });
});
