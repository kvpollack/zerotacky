// 058 (11/11): the gym "intro strongman sessions" tag. Row -> listing, the directory filter, and the owner's patch cleaner.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const G = await import('../lib/website/supabaseGyms.ts');
const F = await import('../lib/website/filters.ts');
const M = await import('../lib/website/myGym.ts');

const row = (over = {}) => ({
  id: '11111111-1111-1111-1111-111111111111', slug: 'power-plant', name: 'Power Plant', status: 'claimed',
  gym_type: 'strongman', street_address: '', city: 'Harrisburg', state: 'PA', zip: '17101', lat: 40.2, lng: -76.8,
  website_url: '', phone: '', instagram: '', contact: '', day_pass_availability: 'available', day_pass_price: '', day_pass_url: '',
  drop_in_policy: '', drop_in_hours: '', equipment: ['log'], equipment_notes: {}, source_url: '', confidence: 'high',
  last_verified: '2026-11-11', updated_at: '2026-11-11T00:00:00Z', ...over,
});

describe('row -> listing', () => {
  test('absent or not_provided leaves the listing without the tag; yes carries note and link', () => {
    assert.equal(G.mapGymRowToListing(row()).introSessions, undefined);
    assert.equal(G.mapGymRowToListing(row({ intro_sessions: 'not_provided' })).introSessions, undefined);
    const l = G.mapGymRowToListing(row({ intro_sessions: 'yes', intro_sessions_note: ' Saturdays 10 am ', intro_sessions_url: 'https://pp.gym/intro' }));
    assert.equal(l.introSessions, 'yes');
    assert.equal(l.introSessionsNote, 'Saturdays 10 am');
    assert.equal(l.introSessionsUrl, 'https://pp.gym/intro');
    assert.equal(G.mapGymRowToListing(row({ intro_sessions: 'no', intro_sessions_note: '' })).introSessionsNote, undefined);
    assert.equal(G.normalizeIntroSessions('bogus'), 'not_provided');
  });
  test('the public column list carries the three columns', () => {
    assert.match(G.PUBLIC_GYM_COLS, /intro_sessions,intro_sessions_note,intro_sessions_url/);
  });
});

describe('directory filter', () => {
  const gyms = [
    G.mapGymRowToListing(row({ id: 'a', slug: 'a', intro_sessions: 'yes' })),
    G.mapGymRowToListing(row({ id: 'b', slug: 'b', intro_sessions: 'on_request' })),
    G.mapGymRowToListing(row({ id: 'c', slug: 'c', intro_sessions: 'no' })),
    G.mapGymRowToListing(row({ id: 'd', slug: 'd' })),
  ];
  test('introOnly keeps yes and on_request, drops no and unknown; off keeps all', () => {
    assert.deepEqual(F.filterPublicGyms(gyms, { introOnly: true }).map((g) => g.id), ['a', 'b']);
    assert.equal(F.filterPublicGyms(gyms, {}).length, 4);
    assert.equal(F.filterPublicGyms(gyms, { introOnly: false }).length, 4);
  });
});

describe('owner patch', () => {
  const base = () => ({
    name: 'Power Plant', gym_type: 'strongman', street_address: '', city: 'Harrisburg', state: 'PA', zip: '17101',
    website_url: '', phone: '', instagram: '', contact: '', day_pass_availability: 'available', day_pass_price: '', day_pass_url: '',
    drop_in_policy: '', drop_in_hours: '', intro_sessions: 'yes', intro_sessions_note: ' Saturdays 10 am, $20 ', intro_sessions_url: 'pp.gym/intro',
    equipment: [], equipment_notes: {}, socials: {}, theme: null,
  });
  test('yes keeps a trimmed note and a schemed link; no clears both; unknown value reads not_provided', () => {
    const y = M.cleanGymPatch(base()).patch;
    assert.equal(y.intro_sessions, 'yes');
    assert.equal(y.intro_sessions_note, 'Saturdays 10 am, $20');
    assert.equal(y.intro_sessions_url, 'https://pp.gym/intro');
    const n = M.cleanGymPatch({ ...base(), intro_sessions: 'no' }).patch;
    assert.equal(n.intro_sessions_note, ''); assert.equal(n.intro_sessions_url, '');
    assert.equal(M.cleanGymPatch({ ...base(), intro_sessions: 'maybe' }).patch.intro_sessions, 'not_provided');
    assert.equal(M.cleanGymPatch({ ...base(), intro_sessions_note: 'x'.repeat(400) }).patch.intro_sessions_note.length, 300);
  });
  test('patchFromRow reads the columns and defaults a legacy row', () => {
    const p = M.patchFromRow({ ...row({ intro_sessions: 'on_request', intro_sessions_note: 'Email us', intro_sessions_url: '' }), owner_id: 'u', socials: null });
    assert.equal(p.intro_sessions, 'on_request'); assert.equal(p.intro_sessions_note, 'Email us');
    const legacy = M.patchFromRow({ ...row(), owner_id: 'u', socials: null });
    assert.equal(legacy.intro_sessions, 'not_provided'); assert.equal(legacy.intro_sessions_note, '');
    assert.equal(M.INTRO_SESSIONS_OPTIONS.length, 4);
  });
});
