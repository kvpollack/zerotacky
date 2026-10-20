import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const PR = await import('../lib/auth/profile.ts');
const AV = await import('../lib/auth/avatar.ts');

// Kurt 10/20: optional "about you" fields on the account page. The sanitiser is the only path to the database.
describe('profile about-you fields', () => {
  test('handles lose @, URL prefixes, trailing slashes and query strings', () => {
    assert.equal(PR.cleanHandle('@kurt'), 'kurt');
    assert.equal(PR.cleanHandle('https://www.instagram.com/kurt.lifts/'), 'kurt.lifts');
    assert.equal(PR.cleanHandle('instagram.com/kurt?igsh=abc'), 'kurt');
    assert.equal(PR.cleanHandle('tiktok.com/@kurt'), 'kurt');
    assert.equal(PR.cleanHandle('kurt.lifts'), 'kurt.lifts');
    assert.equal(PR.cleanHandle('slate.staging'), 'slate.staging');
    assert.equal(PR.cleanHandle('  '), '');
    assert.equal(PR.cleanHandle('x'.repeat(100)).length, 60);
  });
  test('website gets https and must look like a host; junk is dropped', () => {
    assert.equal(PR.cleanWebsite('zerotacky.com'), 'https://zerotacky.com/');
    assert.equal(PR.cleanWebsite('http://gym.example/pass'), 'http://gym.example/pass');
    assert.equal(PR.cleanWebsite('javascript:alert(1)'), '');
    assert.equal(PR.cleanWebsite('not a url'), '');
    assert.equal(PR.cleanWebsite(''), '');
  });
  test('socials keep only known keys with non-empty values', () => {
    const s = PR.cleanSocials({ instagram: '@a', youtube: '', bogus: 'x', website: 'b.co', x: 'https://x.com/kp' });
    assert.deepEqual(s, { instagram: 'a', x: 'kp', website: 'https://b.co/' });
    assert.deepEqual(PR.cleanSocials(null), {});
  });
  test('PRs drop empty rows, cap at three, trim and cap lengths', () => {
    const prs = PR.cleanPRs([
      { lift: ' Log  press ', value: '275 lb' },
      { lift: '', value: '' },
      { lift: 'Deadlift', value: '' },
      { lift: 'Yoke', value: '700 x 50ft' },
      { lift: 'Stones', value: '300' },
    ]);
    assert.deepEqual(prs, [{ lift: 'Log press', value: '275 lb' }, { lift: 'Deadlift', value: '' }, { lift: 'Yoke', value: '700 x 50ft' }]);
    assert.deepEqual(PR.cleanPRs('nope'), []);
  });
  test('cleanProfilePatch validates favorite lift, forces trainer flags off for non-trainers, keeps only given keys', () => {
    const c = PR.cleanProfilePatch({ favorite_lift: 'log', favorite_lift_note: '  big  ', is_trainer: false, trainer_online: true, location: ' Nashville, TN ' });
    assert.deepEqual(c, { favorite_lift: 'log', favorite_lift_note: 'big', is_trainer: false, trainer_online: false, trainer_in_person: false, location: 'Nashville, TN' });
    assert.equal(PR.cleanProfilePatch({ favorite_lift: 'bench' }).favorite_lift, '');
    assert.deepEqual(PR.cleanProfilePatch({ display_name: ' K ' }), { display_name: 'K' });
    const t = PR.cleanProfilePatch({ is_trainer: true, trainer_in_person: true });
    assert.deepEqual(t, { is_trainer: true, trainer_in_person: true });
  });
  test('normalizeProfile fills missing columns for rows written before 013', () => {
    const p = PR.normalizeProfile({ id: 'u1', display_name: 'K', is_promoter: true });
    assert.equal(p.favorite_lift, '');
    assert.deepEqual(p.prs, []);
    assert.deepEqual(p.socials, {});
    assert.equal(p.is_trainer, false);
    assert.equal(p.avatar_path, '');
  });
  test('roleBadges adds Trainer; favoriteLiftLabel and socialUrl resolve', () => {
    assert.deepEqual(PR.roleBadges({ is_athlete: true, is_trainer: true }), ['Athlete', 'Trainer']);
    assert.equal(PR.favoriteLiftLabel('stones'), 'Atlas stones');
    assert.equal(PR.favoriteLiftLabel('zzz'), '');
    assert.equal(PR.socialUrl('instagram', 'kurt'), 'https://www.instagram.com/kurt/');
    assert.equal(PR.socialUrl('website', 'https://b.co/'), 'https://b.co/');
    assert.equal(PR.FAVORITE_LIFT_OPTIONS.at(-1).id, 'other');
  });
});

describe('avatar helpers', () => {
  test('only jpg/png/webp under 2 MB pass; path lives under the user folder (matches the 013 policies)', () => {
    assert.equal(AV.avatarProblem({ type: 'image/gif', size: 10 }), 'Use a JPG, PNG, or WebP photo.');
    assert.equal(AV.avatarProblem({ type: 'image/png', size: AV.AVATAR_MAX_BYTES + 1 }), 'Photos need to be under 2 MB.');
    assert.equal(AV.avatarProblem({ type: 'image/jpeg', size: 1000 }), null);
    assert.equal(AV.avatarObjectPath('u1', 'image/webp', 5), 'u1/avatar-5.webp');
    assert.ok(AV.avatarObjectPath('u1', 'image/png').startsWith('u1/'));
  });
});
