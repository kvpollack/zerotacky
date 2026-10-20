import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const M = await import('../lib/website/myGym.ts');

// 016 My Gym (10/20): the owner edit form cleans a draft before it reaches `gyms`; the limits mirror gyms_len_chk.
const base = () => ({
  name: ' Hercules Gym ', gym_type: 'powerlifting', street_address: ' 6361 Thompson Rd ', city: ' Syracuse ', state: 'ny', zip: '13206',
  website_url: 'herculesgymsyracuse.com', phone: '315-433-1361', instagram: '@hercules', contact: '',
  day_pass_availability: 'available', day_pass_price: '$15', day_pass_url: '', drop_in_policy: '', drop_in_hours: '',
  equipment: ['monolift', 'stones', 'sleds', 'monolift'], equipment_notes: { monolift: ' two ', stones: '', yoke: 'orphan note' },
  socials: { facebook: ' fb.com/hercules ', tiktok: '', bogus: 'x' },
});

describe('cleanGymPatch', () => {
  test('trims, upper-cases state, adds https, strips @, dedupes equipment, drops orphan notes and empty socials', () => {
    const r = M.cleanGymPatch(base());
    assert.equal(r.problem, null);
    const p = r.patch;
    assert.equal(p.name, 'Hercules Gym');
    assert.equal(p.state, 'NY');
    assert.equal(p.city, 'Syracuse');
    assert.equal(p.website_url, 'https://herculesgymsyracuse.com');
    assert.equal(p.instagram, 'hercules');
    assert.deepEqual(p.equipment, ['monolift', 'stones']);           // sleds unknown, duplicate removed
    assert.deepEqual(p.equipment_notes, { monolift: 'two' });        // empty + orphan notes gone
    assert.deepEqual(p.socials, { facebook: 'fb.com/hercules' });     // tiktok empty, bogus key dropped
  });
  test('rejects a bad state, a bad zip, a missing city, a one-letter name', () => {
    assert.match(M.cleanGymPatch({ ...base(), state: 'New York' }).problem, /two-letter/);
    assert.match(M.cleanGymPatch({ ...base(), zip: '1320' }).problem, /Zip/);
    assert.match(M.cleanGymPatch({ ...base(), city: '  ' }).problem, /City and state/);
    assert.match(M.cleanGymPatch({ ...base(), name: 'H' }).problem, /name/);
  });
  test('accepts zip+4 and an empty zip; unknown type and pass values fall back', () => {
    assert.equal(M.cleanGymPatch({ ...base(), zip: '13206-1234' }).patch.zip, '13206-1234');
    assert.equal(M.cleanGymPatch({ ...base(), zip: '' }).patch.zip, '');
    const p = M.cleanGymPatch({ ...base(), gym_type: 'crossfit', day_pass_availability: 'maybe' }).patch;
    assert.equal(p.gym_type, 'mixed');
    assert.equal(p.day_pass_availability, 'not_provided');
  });
  test('clips to the 015 limits', () => {
    const p = M.cleanGymPatch({ ...base(), drop_in_policy: 'x'.repeat(700), name: 'N'.repeat(200) }).patch;
    assert.equal(p.drop_in_policy.length, M.GYM_LIMITS.drop_in_policy);
    assert.equal(p.name.length, M.GYM_LIMITS.name);
  });
});

describe('patchKey / patchFromRow', () => {
  test('whitespace-only edits are not dirty', () => {
    const a = base(); const b = { ...base(), name: 'Hercules Gym', state: 'NY' };
    assert.equal(M.patchKey(a), M.patchKey(b));
  });
  test('patchFromRow copies arrays and objects so edits do not mutate the row', () => {
    const row = { ...base(), id: 'x', slug: 's', status: 'claimed', owner_id: 'u', lat: 1, lng: 2, equipment: ['log'], equipment_notes: { log: 'a' }, socials: null };
    const p = M.patchFromRow(row);
    p.equipment.push('yoke'); p.equipment_notes.log = 'b';
    assert.deepEqual(row.equipment, ['log']);
    assert.equal(row.equipment_notes.log, 'a');
    assert.deepEqual(p.socials, {});
  });
});

describe('zipLatLng', () => {
  test('uses /api/zip and returns null for bad zips or misses', async () => {
    const calls = [];
    const fetchImpl = async (u) => { calls.push(u); return { ok: true, json: async () => ({ lat: 40.1, lng: -75.2 }) }; };
    assert.deepEqual(await M.zipLatLng('19063', fetchImpl), { lat: 40.1, lng: -75.2 });
    assert.deepEqual(calls, ['/api/zip/19063']);
    assert.equal(await M.zipLatLng('abc', fetchImpl), null);
    assert.equal(await M.zipLatLng('19063', async () => ({ ok: false })), null);
  });
});
