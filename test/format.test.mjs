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
