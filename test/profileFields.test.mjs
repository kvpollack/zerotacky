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
    // Astra P-L2: never return a URL cut mid-escape; over-long URLs are dropped whole
    const long = 'https://example.com/' + 'a'.repeat(180) + encodeURIComponent('\u{1F4AA}');
    assert.equal(PR.cleanWebsite(long), '');
    assert.equal(PR.cleanWebsite('https://example.com/' + 'a'.repeat(100)), 'https://example.com/' + 'a'.repeat(100));
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
    assert.equal(PR.socialUrl('website', 'javascript:alert(1)'), '');
    assert.equal(PR.socialUrl('website', 'ftp://x.y'), '');
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

// Astra P-H1 (10/20): replacement order is upload -> save path -> remove old. A failed save must leave the old
// photo in place and remove the orphaned new upload; a failed upload must touch nothing.
describe('avatar replace ordering (P-H1)', () => {
  function fakeStorage(opts = {}) {
    const objects = new Set(opts.existing ?? []);
    const log = [];
    const sb = {
      storage: {
        from(bucket) {
          assert.equal(bucket, 'avatars');
          return {
            async upload(path) {
              log.push(['upload', path]);
              if (opts.failUpload) return { error: { message: 'upload boom' } };
              objects.add(path);
              return { error: null };
            },
            async remove(paths) {
              log.push(['remove', ...paths]);
              if (opts.failRemove) return { error: { message: 'remove boom' } };
              for (const p of paths) objects.delete(p);
              return { error: null };
            },
          };
        },
      },
    };
    return { sb, objects, log };
  }
  const file = { type: 'image/png', size: 100 };

  test('happy path: new object uploaded, path saved, old object removed, in that order', async () => {
    const { sb, objects, log } = fakeStorage({ existing: ['u1/avatar-1.png'] });
    const saved = [];
    const path = await AV.replaceAvatar(sb, 'u1', file, 'u1/avatar-1.png', async (p) => { saved.push(p); });
    assert.deepEqual(saved, [path]);
    assert.deepEqual(log.map((l) => l[0]), ['upload', 'remove']);
    assert.deepEqual(log[1], ['remove', 'u1/avatar-1.png']);
    assert.deepEqual([...objects], [path]);
  });

  test('save fails: old object kept, new upload removed, error surfaces', async () => {
    const { sb, objects, log } = fakeStorage({ existing: ['u1/avatar-1.png'] });
    await assert.rejects(
      () => AV.replaceAvatar(sb, 'u1', file, 'u1/avatar-1.png', async () => { throw new Error('db down'); }),
      /db down/,
    );
    assert.ok(objects.has('u1/avatar-1.png'), 'old photo still in storage');
    assert.equal(objects.size, 1, 'orphaned upload removed');
    const removed = log.filter((l) => l[0] === 'remove').flatMap((l) => l.slice(1));
    assert.ok(!removed.includes('u1/avatar-1.png'), 'old object never removed');
  });

  test('upload fails: nothing saved, nothing removed', async () => {
    const { sb, objects, log } = fakeStorage({ existing: ['u1/avatar-1.png'], failUpload: true });
    let saveCalls = 0;
    await assert.rejects(() => AV.replaceAvatar(sb, 'u1', file, 'u1/avatar-1.png', async () => { saveCalls++; }), /upload boom/);
    assert.equal(saveCalls, 0);
    assert.deepEqual(log.map((l) => l[0]), ['upload']);
    assert.ok(objects.has('u1/avatar-1.png'));
  });

  test('old-object removal failing is swallowed; the saved path still wins', async () => {
    const { sb, log } = fakeStorage({ existing: ['u1/avatar-1.png'], failRemove: true });
    const path = await AV.replaceAvatar(sb, 'u1', file, 'u1/avatar-1.png', async () => {});
    assert.ok(path.startsWith('u1/avatar-'));
    assert.equal(log.filter((l) => l[0] === 'remove').length, 1);
  });

  test('rejects a bad file before touching storage', async () => {
    const { sb, log } = fakeStorage();
    await assert.rejects(() => AV.replaceAvatar(sb, 'u1', { type: 'image/gif', size: 5 }, '', async () => {}), /JPG, PNG, or WebP/);
    assert.equal(log.length, 0);
  });
});
