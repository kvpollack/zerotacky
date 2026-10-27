// Profile cross-links (029, ROADMAP s7 items 3 and 5): the mapper, the upcoming/past split, the loader, the trainer
// filter and the home_gym_id patch rule.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const L = await import('../lib/website/profileLinks.ts');
const A = await import('../lib/website/athletes.ts');
const D = await import('../lib/website/data.ts');
const PR = await import('../lib/auth/profile.ts');
const PD = await import('../lib/auth/profileDraft.ts');

const payload = {
  home_gym: { slug: 'iron-culture-north-bergen-nj', name: 'Iron Culture', city: 'North Bergen', state: 'NJ' },
  shows: [
    { slug: 'iron-harbor-classic-2026', name: 'Iron Harbor Classic 2026', date: '2026-11-14', competition_status: 'upcoming', registration_status: 'open', venue_city: 'Erie', venue_state: 'PA' },
    { slug: 'old-show', name: 'Old Show', date: '2026-01-10', competition_status: 'completed', registration_status: 'closed', venue_city: '', venue_state: 'PA' },
    { slug: 'BAD SLUG', name: 'dropped', date: '2026-02-01' },
    { slug: 'no-name', name: '', date: '2026-02-01' },
    'junk',
  ],
  gyms: [{ slug: 'hercules-gym-syracuse-ny', name: 'Hercules Gym', city: 'Syracuse', state: 'NY', gym_type: 'strongman' }, { slug: '../x', name: 'nope' }],
};

describe('mapProfileLinks', () => {
  test('maps the three blocks and drops malformed rows', () => {
    const out = L.mapProfileLinks(payload);
    assert.deepEqual(out.homeGym, { slug: 'iron-culture-north-bergen-nj', name: 'Iron Culture', city: 'North Bergen', state: 'NJ', gymType: '' });
    assert.deepEqual(out.shows.map((s) => s.slug), ['iron-harbor-classic-2026', 'old-show']);
    assert.equal(out.shows[0].venue, 'Erie, PA');
    assert.equal(out.shows[1].venue, 'PA');
    assert.equal(out.shows[0].competitionStatus, 'upcoming');
    assert.deepEqual(out.gyms.map((g) => g.slug), ['hercules-gym-syracuse-ny']);
    assert.equal(out.gyms[0].gymType, 'strongman');
  });
  test('empty object (private or unknown username), null, arrays and junk all map to nothing', () => {
    for (const raw of [{}, null, undefined, [], 'x', 42, { home_gym: null, shows: null, gyms: 'no' }]) {
      assert.deepEqual(L.mapProfileLinks(raw), L.EMPTY_PROFILE_LINKS, String(raw));
    }
  });
  test('splitShows: upcoming soonest first, past as given; cancelled and completed are past; undated counts as upcoming', () => {
    const shows = L.mapProfileLinks({
      shows: [
        { slug: 'c', name: 'C', date: '2026-12-01', competition_status: 'upcoming' },
        { slug: 'b', name: 'B', date: '2026-11-01', competition_status: 'live' },
        { slug: 'x', name: 'X', date: '2026-11-20', competition_status: 'cancelled' },
        { slug: 'a', name: 'A', date: '2026-10-01', competition_status: 'completed' },
        { slug: 'n', name: 'N', date: null, competition_status: 'upcoming' },
      ],
    }).shows;
    const { upcoming, past } = L.splitShows(shows, '2026-10-27');
    assert.deepEqual(upcoming.map((s) => s.slug), ['b', 'c', 'n']);
    assert.deepEqual(past.map((s) => s.slug), ['x', 'a']);
  });
  test('competitionStatusLabel knows the five statuses and degrades gracefully', () => {
    assert.equal(L.competitionStatusLabel('live'), 'Live');
    assert.equal(L.competitionStatusLabel('upcoming'), 'Upcoming');
    assert.equal(L.competitionStatusLabel('results_pending'), 'results pending');
    assert.equal(L.competitionStatusLabel(''), '');
  });
});

describe('getProfileLinks loader', () => {
  test('demo mode and malformed usernames never call the backend', async () => {
    const d = await D.getProfileLinks('kurt', { mode: 'demo' });
    assert.deepEqual(d.data, L.EMPTY_PROFILE_LINKS);
    const calls = [];
    const client = { rpc: async (fn, args) => { calls.push([fn, args]); return payload; } };
    const bad = await D.getProfileLinks('not valid!', { client });
    assert.deepEqual(bad.data, L.EMPTY_PROFILE_LINKS);
    assert.equal(calls.length, 0);
  });
  test('live: calls zt_profile_links with the cleaned username; an error is reported, not thrown', async () => {
    const calls = [];
    const client = { rpc: async (fn, args) => { calls.push([fn, args]); return payload; } };
    const res = await D.getProfileLinks('@Kurt_Lifts', { client });
    assert.deepEqual(calls, [['zt_profile_links', { p_username: 'kurt_lifts' }]]);
    assert.equal(res.data.shows.length, 2);
    const boom = await D.getProfileLinks('kurt', { client: { rpc: async () => { throw new Error('boom'); } } });
    assert.equal(boom.error, 'boom');
    assert.deepEqual(boom.data, L.EMPTY_PROFILE_LINKS);
  });
});

describe('trainer mode filter (/trainers)', () => {
  const row = (over = {}) => ({
    id: '1', username: 'u', display_name: 'U', is_athlete: true, is_promoter: false, is_gym_owner: false,
    is_trainer: true, trainer_in_person: false, trainer_online: false, favorite_lift: '', favorite_lift_note: '',
    location: 'Erie, PA', home_gym_name: '', prs: [], socials: {}, avatar_path: '', updated_at: null, ...over,
  });
  const list = [
    A.mapPublicProfileRow(row({ id: '1', username: 'both', trainer_in_person: true, trainer_online: true }), null),
    A.mapPublicProfileRow(row({ id: '2', username: 'gym_only', trainer_in_person: true }), null),
    A.mapPublicProfileRow(row({ id: '3', username: 'remote', trainer_online: true }), null),
    A.mapPublicProfileRow(row({ id: '4', username: 'unspecified' }), null),
    A.mapPublicProfileRow(row({ id: '5', username: 'not_a_trainer', is_trainer: false, trainer_online: true }), null),
  ];
  test('trainer flags only count for trainers; mode narrows within the role', () => {
    assert.equal(list[4].trainerOnline, false);
    assert.deepEqual(A.filterPublicAthletes(list, { role: 'trainer' }).map((a) => a.username), ['both', 'gym_only', 'remote', 'unspecified']);
    assert.deepEqual(A.filterPublicAthletes(list, { role: 'trainer', mode: 'in_person' }).map((a) => a.username), ['both', 'gym_only']);
    assert.deepEqual(A.filterPublicAthletes(list, { role: 'trainer', mode: 'online' }).map((a) => a.username), ['both', 'remote']);
    assert.equal(A.filterPublicAthletes(list, { role: 'trainer', mode: 'ALL' }).length, 4);
  });
  test('cleanModeParam accepts the two modes (dash or underscore) and nothing else', () => {
    assert.equal(A.cleanModeParam('in-person'), 'in_person');
    assert.equal(A.cleanModeParam(['online']), 'online');
    assert.equal(A.cleanModeParam('both'), 'ALL');
    assert.equal(A.cleanModeParam(undefined), 'ALL');
  });
});

describe('home_gym_id on the profile', () => {
  test('cleanProfilePatch keeps a uuid, nulls anything else; normalizeProfile fills null', () => {
    const id = '884bb191-9c24-4ffc-901a-d0dcf4f66b10';
    assert.deepEqual(PR.cleanProfilePatch({ home_gym_id: id }), { home_gym_id: id });
    assert.deepEqual(PR.cleanProfilePatch({ home_gym_id: 'not-a-uuid' }), { home_gym_id: null });
    assert.deepEqual(PR.cleanProfilePatch({ home_gym_id: null }), { home_gym_id: null });
    assert.deepEqual(PR.cleanProfilePatch({ home_gym_name: 'X' }), { home_gym_name: 'X' });   // untouched when absent
    assert.equal(PR.normalizeProfile({ id: 'p' }).home_gym_id, null);
    assert.equal(PR.normalizeProfile({ id: 'p', home_gym_id: id }).home_gym_id, id);
    assert.match(PR.PROFILE_COLUMNS, /home_gym_id/);
  });
  test('reconcileAbout follows a server change of home_gym_id and leaves a local pick alone otherwise', () => {
    const id = '884bb191-9c24-4ffc-901a-d0dcf4f66b10';
    const base = PR.normalizeProfile({ id: 'p', home_gym_name: 'Hercules', home_gym_id: null });
    const cur = { ...PD.aboutFromProfile(base), home_gym_id: id };
    const same = PD.reconcileAbout(cur, base, base);
    assert.equal(same.home_gym_id, id);
    const serverPicked = PD.reconcileAbout(cur, base, { ...base, home_gym_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
    assert.equal(serverPicked.home_gym_id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  });
});
