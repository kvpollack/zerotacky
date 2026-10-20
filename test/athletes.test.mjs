// Athlete Directory (020, ROADMAP s7). Pure helpers plus the data loaders against a fake client.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const A = await import('../lib/website/athletes.ts');
const D = await import('../lib/website/data.ts');
const PR = await import('../lib/auth/profile.ts');

const row = (over = {}) => ({
  id: '22222222-2222-2222-2222-222222222222', username: 'kurt_lifts', display_name: 'Kurt P', is_athlete: true,
  is_promoter: true, is_gym_owner: false, is_trainer: true, trainer_in_person: true, trainer_online: false,
  favorite_lift: 'log', favorite_lift_note: 'Best 275', location: 'Aston, PA', home_gym_name: 'Power Plant Gym',
  prs: [{ lift: 'Log', value: '275 lb' }, { lift: 'Deadlift', value: '600 lb' }], socials: { instagram: 'kurt', website: 'https://zerotacky.com/' },
  avatar_path: '22222222-2222-2222-2222-222222222222/avatar-1.jpg', updated_at: '2026-10-21T12:00:00Z', ...over,
});

describe('username rules (mirror of zt_set_username)', () => {
  test('normalizeUsername lowercases, trims, drops a leading @', () => {
    assert.equal(PR.normalizeUsername('  @Kurt_Lifts '), 'kurt_lifts');
    assert.equal(PR.normalizeUsername(null), '');
  });
  test('usernameProblem: empty is fine (clears), length, charset, reserved', () => {
    assert.equal(PR.usernameProblem(''), '');
    assert.equal(PR.usernameProblem('kurt_lifts'), '');
    assert.match(PR.usernameProblem('ab'), /3 to 30/);
    assert.match(PR.usernameProblem('a'.repeat(31)), /3 to 30/);
    assert.match(PR.usernameProblem('kurt-lifts'), /underscores only/);
    assert.match(PR.usernameProblem('kurt lifts'), /underscores only/);
    assert.match(PR.usernameProblem('Admin'), /reserved/);
    assert.match(PR.usernameProblem('athletes'), /reserved/);
  });
  test('profile row carries username and is_public; patch accepts is_public but never username', () => {
    const p = PR.normalizeProfile({ id: 'x', username: 'kurt', is_public: true });
    assert.equal(p.username, 'kurt');
    assert.equal(p.is_public, true);
    assert.equal(PR.normalizeProfile({ id: 'x', username: '' }).username, null);
    assert.deepEqual(PR.cleanProfilePatch({ is_public: 1 }), { is_public: true });
    assert.deepEqual(PR.cleanProfilePatch({ username: 'hack' }), {});
    assert.match(PR.PROFILE_COLUMNS, /username,is_public/);
  });
  test('athleteProfilePath encodes', () => {
    assert.equal(PR.athleteProfilePath('kurt_lifts'), '/athletes/kurt_lifts');
  });
});

describe('stateFromLocation', () => {
  test('codes, names, trailing country, nothing', () => {
    assert.equal(A.stateFromLocation('Aston, PA'), 'PA');
    assert.equal(A.stateFromLocation('Aston PA 19014'), 'PA');
    assert.equal(A.stateFromLocation('Columbus, Ohio, USA'), 'OH');
    assert.equal(A.stateFromLocation('New York, NY'), 'NY');
    assert.equal(A.stateFromLocation('Washington, DC'), 'DC');
    assert.equal(A.stateFromLocation('Nashville'), '');
    assert.equal(A.stateFromLocation('London, UK'), '');
    assert.equal(A.stateFromLocation('in the gym'), '');   // "in" is not Indiana
    assert.equal(A.stateFromLocation(''), '');
  });
});

describe('mapPublicProfileRow', () => {
  test('badges, trainer detail, labels, avatar URL, sanitised prs/socials', () => {
    const a = A.mapPublicProfileRow(row(), 'https://abc.supabase.co/');
    assert.equal(a.displayName, 'Kurt P');
    assert.deepEqual(a.roles, ['athlete', 'promoter', 'trainer']);
    assert.deepEqual(a.badges, ['Athlete', 'Promoter', 'Trainer (in person)']);
    assert.equal(a.favoriteLift, 'Log press');
    assert.equal(a.state, 'PA');
    assert.equal(a.avatarUrl, 'https://abc.supabase.co/storage/v1/object/public/avatars/22222222-2222-2222-2222-222222222222/avatar-1.jpg');
    assert.equal(a.prs.length, 2);
    assert.deepEqual(a.socials, { instagram: 'kurt', website: 'https://zerotacky.com/' });
  });
  test('blank display name falls back to @username; junk prs/socials/avatars dropped', () => {
    const a = A.mapPublicProfileRow(row({ display_name: '  ', prs: 'nope', socials: [1], avatar_path: '../etc/passwd' }), 'https://abc.supabase.co');
    assert.equal(a.displayName, '@kurt_lifts');
    assert.deepEqual(a.prs, []);
    assert.deepEqual(a.socials, {});
    assert.equal(a.avatarUrl, '');
    assert.equal(A.avatarUrlFromPath(null, 'x/y.jpg'), '');
    assert.equal(A.avatarUrlFromPath('https://abc.supabase.co', ''), '');
  });
});

describe('filter, sort, states', () => {
  const list = [
    A.mapPublicProfileRow(row(), null),
    A.mapPublicProfileRow(row({ id: '3', username: 'ana_m', display_name: 'Ana', location: 'Rialto, CA', is_promoter: false, is_trainer: false }), null),
    A.mapPublicProfileRow(row({ id: '4', username: 'zed', display_name: '', location: '', is_athlete: false, is_promoter: false, is_trainer: false, is_gym_owner: true }), null),
  ];
  test('search by name or @username, state and role filters, ALL passthrough', () => {
    assert.equal(A.filterPublicAthletes(list, {}).length, 3);
    assert.deepEqual(A.filterPublicAthletes(list, { search: '@ANA' }).map((a) => a.username), ['ana_m']);
    assert.deepEqual(A.filterPublicAthletes(list, { search: 'kurt' }).map((a) => a.username), ['kurt_lifts']);
    assert.deepEqual(A.filterPublicAthletes(list, { state: 'ca' }).map((a) => a.username), ['ana_m']);
    assert.deepEqual(A.filterPublicAthletes(list, { role: 'gym_owner' }).map((a) => a.username), ['zed']);
    assert.deepEqual(A.filterPublicAthletes(list, { role: 'trainer', state: 'PA' }).map((a) => a.username), ['kurt_lifts']);
    assert.equal(A.filterPublicAthletes(list, { role: 'bogus' }).length, 0);
  });
  test('sortAthletes by display name then username; collectAthleteStates sorted unique', () => {
    assert.deepEqual(A.sortAthletes(list).map((a) => a.username), ['zed', 'ana_m', 'kurt_lifts']);
    assert.deepEqual(A.collectAthleteStates(list), ['CA', 'PA']);
  });
  test('cleanUsernameParam only passes the database shape', () => {
    assert.equal(A.cleanUsernameParam('Kurt_Lifts'), 'kurt_lifts');
    assert.equal(A.cleanUsernameParam('%40kurt'), 'kurt');
    assert.equal(A.cleanUsernameParam('a b'), '');
    assert.equal(A.cleanUsernameParam("x' or 1=1"), '');
    assert.equal(A.cleanUsernameParam(undefined), '');
  });
});

describe('data loaders', () => {
  test('demo mode: empty directory, null profile, no error', async () => {
    const l = await D.listPublicAthletes({ mode: 'demo' });
    assert.deepEqual(l, { source: 'demo', data: [], error: null });
    const g = await D.getPublicAthleteByUsername('kurt', { mode: 'demo' });
    assert.equal(g.data, null);
  });
  test('live: reads zt_public_profiles only, sorted, by-username query is cleaned', async () => {
    const calls = [];
    const client = { select: async (table, query) => { calls.push([table, query]); return [row({ display_name: 'Zed' }), row({ id: '9', username: 'ana', display_name: 'Ana' })]; } };
    const l = await D.listPublicAthletes({ client });
    assert.equal(l.source, 'live_supabase');
    assert.deepEqual(l.data.map((a) => a.displayName), ['Ana', 'Zed']);
    assert.equal(calls[0][0], 'zt_public_profiles');
    assert.match(calls[0][1], /select=id,username,display_name/);
    assert.doesNotMatch(calls[0][1], /email/);

    const one = { select: async (table, query) => { calls.push([table, query]); return [row()]; } };
    const g = await D.getPublicAthleteByUsername('@Kurt_Lifts', { client: one });
    assert.equal(g.data.username, 'kurt_lifts');
    assert.match(calls[1][1], /username=eq\.kurt_lifts&limit=1/);

    const bad = await D.getPublicAthleteByUsername('not valid!', { client: one });
    assert.equal(bad.data, null);
    assert.equal(calls.length, 2);   // no query for a malformed username
  });
  test('live: client error is reported, not thrown', async () => {
    const client = { select: async () => { throw new Error('boom'); } };
    const res = await D.listPublicAthletes({ client });
    assert.equal(res.data, null);
    assert.match(res.error, /boom/);
  });
});
