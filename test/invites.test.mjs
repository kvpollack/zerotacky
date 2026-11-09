import { test } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.env.ZT_ROOT || '..';
const I = await import(`${ROOT}/lib/website/invites.ts`);

test('invite paths and urls encode the token and keep the origin', () => {
  assert.equal(I.invitePath('abc123'), '/invite/abc123');
  assert.equal(I.inviteUrl('abc/123', 'https://zerotacky.com'), 'https://zerotacky.com/invite/abc%2F123');
  assert.equal(I.afterRedeemHref('gym'), '/website/account/gym');
  assert.equal(I.afterRedeemHref('meet', 'm-1'), '/promoter/m-1');
  assert.equal(I.afterRedeemHref('meet', null), '/promoter');
});

test('daysLeft floors at zero and rounds up partial days', () => {
  const now = new Date('2026-11-09T12:00:00Z');
  assert.equal(I.daysLeft('2026-11-23T12:00:00Z', now), 14);
  assert.equal(I.daysLeft('2026-11-10T00:00:00Z', now), 1);
  assert.equal(I.daysLeft('2026-11-01T00:00:00Z', now), 0);
});

test('previewHeadline covers every status', () => {
  const from = { username: 'kpollack', displayName: 'Kurt' };
  assert.equal(I.previewHeadline({ status: 'unknown' }), 'This invite link is not valid.');
  assert.equal(I.previewHeadline({ status: 'expired' }), 'This invite has expired.');
  assert.equal(I.previewHeadline({ status: 'revoked' }), 'This invite was withdrawn.');
  assert.equal(I.previewHeadline({ status: 'redeemed', isMine: false }), 'This invite has already been used.');
  assert.equal(I.previewHeadline({ status: 'redeemed', isMine: true }), 'You already accepted this invite.');
  assert.equal(I.previewHeadline({ status: 'open', kind: 'gym', from, target: { name: 'Hercules Gym', slug: 'h', owned: false } }), 'Kurt wants you to own Hercules Gym on ZeroTacky.');
  assert.equal(I.previewHeadline({ status: 'open', kind: 'meet', from: { username: 'jess', displayName: null }, target: null }), '@jess wants you to own a meet on ZeroTacky.');
  assert.equal(I.previewHeadline({ status: 'open', kind: 'gym', from: null, target: null }), 'A ZeroTacky promoter wants you to own a gym listing on ZeroTacky.');
});
