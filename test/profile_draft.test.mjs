// Account page draft reconcile (Astra AD-M1, retest 2026-10-21): a profile change arriving from the server (own save,
// another tab, username / visibility RPC) replaces only the draft members whose stored value changed.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const PD = await import('../lib/auth/profileDraft.ts');

const profile = (over = {}) => ({
  id: 'u1', email: 'a@b.c', display_name: 'Astra', is_athlete: true, is_promoter: false, is_gym_owner: false,
  favorite_lift: 'log', favorite_lift_note: '', location: 'Kansas City, Missouri', home_gym_name: '',
  prs: [{ lift: 'Log', value: '275' }], is_trainer: false, trainer_in_person: false, trainer_online: false,
  socials: { instagram: 'astra' }, avatar_path: '', username: 'astra', is_public: false, ...over,
});

describe('reconcileAbout', () => {
  test("Astra's two-tab repro: tab 1 saved a home gym, tab 2 keeps its unsaved location", () => {
    const prev = profile();
    const next = profile({ home_gym_name: 'Astra saved gym from tab one' });
    const cur = { ...PD.aboutFromProfile(prev), location: 'TAB2 MUST SURVIVE' };
    const out = PD.reconcileAbout(cur, prev, next);
    assert.equal(out.location, 'TAB2 MUST SURVIVE');
    assert.equal(out.home_gym_name, 'Astra saved gym from tab one');
  });
  test('a member the server changed wins over a draft of the same member', () => {
    const prev = profile();
    const next = profile({ location: 'Aston, PA' });
    const cur = { ...PD.aboutFromProfile(prev), location: 'typing here' };
    assert.equal(PD.reconcileAbout(cur, prev, next).location, 'Aston, PA');
  });
  test('no server change: every draft survives, including PR rows and socials', () => {
    const prev = profile();
    const cur = { ...PD.aboutFromProfile(prev), location: 'x', favorite_lift_note: 'y', is_trainer: true };
    cur.prs[1] = { lift: 'Yoke', value: '800' };
    cur.socials = { ...cur.socials, website: 'example.com' };
    const out = PD.reconcileAbout(cur, prev, profile());
    assert.deepEqual(out, cur);
  });
  test('PR rows reconcile per row: server changed row 0, draft on row 1 survives', () => {
    const prev = profile();
    const next = profile({ prs: [{ lift: 'Log', value: '300' }] });
    const cur = PD.aboutFromProfile(prev);
    cur.prs[1] = { lift: 'Yoke', value: '800' };
    const out = PD.reconcileAbout(cur, prev, next);
    assert.deepEqual(out.prs[0], { lift: 'Log', value: '300' });
    assert.deepEqual(out.prs[1], { lift: 'Yoke', value: '800' });
    assert.deepEqual(out.prs[2], { lift: '', value: '' });
  });
  test('socials reconcile per link: server set youtube, draft instagram survives, server-cleared link clears', () => {
    const prev = profile({ socials: { instagram: 'astra', tiktok: 'old' } });
    const next = profile({ socials: { instagram: 'astra', youtube: 'astra_tv' } });
    const cur = { ...PD.aboutFromProfile(prev), socials: { instagram: 'astra_new', tiktok: 'old' } };
    const out = PD.reconcileAbout(cur, prev, next);
    assert.equal(out.socials.instagram, 'astra_new');
    assert.equal(out.socials.youtube, 'astra_tv');
    assert.equal(out.socials.tiktok, '');
  });
  test('trainer flags are their own members', () => {
    const prev = profile();
    const next = profile({ trainer_online: true });
    const cur = { ...PD.aboutFromProfile(prev), is_trainer: true, location: 'draft' };
    const out = PD.reconcileAbout(cur, prev, next);
    assert.equal(out.is_trainer, true);
    assert.equal(out.trainer_online, true);
    assert.equal(out.location, 'draft');
  });
  test('no draft yet: takes the next profile', () => {
    const next = profile({ location: 'Aston, PA' });
    assert.deepEqual(PD.reconcileAbout(null, profile(), next), PD.aboutFromProfile(next));
  });
  test('aboutKey ignores empty PR rows and whitespace', () => {
    const a = PD.aboutFromProfile(profile());
    const b = { ...a, location: 'Kansas City, Missouri  ' };
    assert.equal(PD.aboutKey(a), PD.aboutKey(b));
  });
});
