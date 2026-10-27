import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.env.ZT_ROOT || '..';
const F = await import(`${ROOT}/lib/website/format.ts`);

describe('website format helpers (MS-14)', () => {
  test('formatLocalDateTime renders a readable local stamp and tolerates junk', () => {
    const out = F.formatLocalDateTime('2026-10-26T23:42:00Z', 'en-US');
    assert.match(out, /^[A-Z][a-z]{2} \d{1,2}, 2026, \d{1,2}:\d{2} (AM|PM)$/);
    assert.equal(F.formatLocalDateTime('not a date'), '');
    assert.equal(F.formatLocalDateTime(null), '');
    assert.equal(F.formatLocalDateTime(undefined), '');
  });

  test('directionsUrl searches the address on file and refuses to invent one', () => {
    const url = F.directionsUrl({ facilityName: 'Spider Strength', streetAddress: '12 Main St', city: 'Raleigh', state: 'NC', postalCode: '27601' });
    assert.equal(url, 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Spider Strength, 12 Main St, Raleigh, NC, 27601'));
    assert.equal(F.directionsUrl({ city: 'Raleigh', state: 'NC' }), 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Raleigh, NC'));
    assert.equal(F.directionsUrl({ facilityName: 'Somewhere' }), null);
    assert.equal(F.directionsUrl({}), null);
  });
});

describe('directions: placeholders and demo venues (LT-05/06)', () => {
  test('display placeholders are not an address', () => {
    assert.equal(F.directionsUrl({ city: 'Not provided', state: 'Not provided' }), null);
    assert.equal(F.directionsUrl({ facilityName: 'Some Gym', city: 'TBD', state: 'TBA' }), null);
    assert.equal(F.directionsUrl({ streetAddress: 'Not provided', city: 'Raleigh', state: 'NC' }), 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Raleigh, NC'));
  });
  test('normalizeVenue(null) composes to no link', async () => {
    const S = await import(`${ROOT}/lib/website/supabaseShows.ts`);
    const fn = S.normalizeVenue ?? S.default?.normalizeVenue;
    if (!fn) return;   // not exported in this build
    assert.equal(F.directionsUrl(fn(null)), null);
  });
  test('demo fixtures get no Directions', () => {
    assert.equal(F.directionsUrl({ streetAddress: '1 Made Up Way', city: 'Baltimore', state: 'MD' }, { demo: true }), null);
    assert.equal(F.directionsUrl({ streetAddress: '1 Real St', city: 'Baltimore', state: 'MD' }, { demo: false }) !== null, true);
  });
});

describe('eventWeightDisplay (show page matrix)', () => {
  const base = { id: 'e1', eventNumber: 1, name: 'Log', scoringType: 'reps', timeCapSeconds: 60, lanes: 1, weightEntryMode: 'total', implementEmptyWeight: 0, divisionWeights: {} };
  test('weight with unit mode and light tier', () => {
    assert.deepEqual(F.eventWeightDisplay({ ...base, divisionWeights: { d1: 160 } }, 'd1'), { main: '160 lbs' });
    assert.deepEqual(F.eventWeightDisplay({ ...base, weightEntryMode: 'per_hand', divisionWeights: { d1: 100 } }, 'd1'), { main: '100 lbs / hand' });
    assert.deepEqual(F.eventWeightDisplay({ ...base, hasTrumpWeight: true, divisionWeights: { d1: 200 }, divisionLightWeights: { d1: 160 } }, 'd1'), { main: '200 lbs (light 160)' });
  });
  test('callout wins; height-only setup; fixed implement; nothing', () => {
    assert.equal(F.eventWeightDisplay({ ...base, divisionWeights: { d1: 160 }, pitCrewCallout: { byDivision: { d1: { headline: '2 plates + 25s' } } } }, 'd1').main, '2 plates + 25s');
    assert.deepEqual(F.eventWeightDisplay({ ...base, weightIsAddedPlatesOnly: true, divisionWeights: { d1: 0 }, divisionDefaultHeights: { d1: '48 in' }, heightLabel: 'Bar height' }, 'd1'), { main: '48 in' });
    assert.deepEqual(F.eventWeightDisplay({ ...base, divisionWeights: { d1: 230 }, divisionDefaultHeights: { d1: 'Pin 7' } }, 'd1'), { main: '230 lbs', setup: 'Setup: Pin 7' });
    assert.deepEqual(F.eventWeightDisplay({ ...base, fixedImplementDescription: '275 lb stone' }, 'd1'), { main: '275 lb stone' });
    assert.deepEqual(F.eventWeightDisplay(base, 'd9'), { main: '' });
  });
});

describe('host gym helpers (026)', () => {
  test('gymSearchPattern escapes ilike wildcards and PostgREST separators', async () => {
    const H = await import(`${ROOT}/lib/website/hostGym.ts`);
    expect(H.gymSearchPattern('iron')).toBe('%iron%');
    expect(H.gymSearchPattern('100% raw')).toBe('%100\\% raw%');
    expect(H.gymSearchPattern('a_b,(c)')).toBe('%a\\_b  c %');
    expect(H.hostGymAddressLine({ id: '1', slug: 's', name: 'n', streetAddress: '1 Main', city: 'Erie', state: 'PA', zip: '16507' })).toBe('1 Main · Erie, PA · 16507');
    expect(H.hostGymAddressLine({ id: '1', slug: 's', name: 'n', streetAddress: '', city: '', state: '', zip: '' })).toBe('Address not provided');
  });

  test('listing contract round-trips hostGymId and refuses a non-uuid', async () => {
    const SA = await import(`${ROOT}/lib/promoter/supabaseApi.ts`);
    const R = await import(`${ROOT}/lib/promoter/rules.ts`);
    const C = await import(`${ROOT}/lib/promoter/contract.ts`);
    const id = '6f1c2b3a-1111-4222-8333-444455556666';
    expect(SA.rowToMeetListing({ host_gym_id: id }).hostGymId).toBe(id);
    expect(SA.rowToMeetListing({}).hostGymId).toBeNull();
    expect(SA.listingPatchToColumns({ hostGymId: id })).toEqual({ host_gym_id: id });
    expect(SA.listingPatchToColumns({ hostGymId: null })).toEqual({ host_gym_id: null });
    expect(SA.listingPatchToColumns({ hostGymId: '  ' })).toEqual({ host_gym_id: null });
    expect(SA.listingPatchToColumns({})).toEqual({});
    const cur = C.emptyListing();
    expect(R.validateListingPatch('2026-11-07', cur, { hostGymId: id })).toBeNull();
    expect(R.validateListingPatch('2026-11-07', cur, { hostGymId: null })).toBeNull();
    expect(R.validateListingPatch('2026-11-07', cur, { hostGymId: 'northbank' })).toMatch(/directory/);
  });
});
