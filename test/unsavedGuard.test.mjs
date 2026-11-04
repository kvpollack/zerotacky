// BLD-03: the promoter editor's leave guard (lib/promoter/unsavedGuard.ts), pure decision only.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
const ROOT = process.env.ZT_ROOT || '..';
const G = await import(`${ROOT}/lib/promoter/unsavedGuard.ts`);

const here = 'https://www.zerotacky.com/promoter/abc?tab=events';
const info = (o) => ({ href: null, target: null, currentHref: here, modifier: false, download: false, ...o });

describe('leavesPage', () => {
  test('in-app link to another page asks', () => {
    assert.equal(G.leavesPage(info({ href: 'https://www.zerotacky.com/promoter' })), true);
    assert.equal(G.leavesPage(info({ href: 'https://www.zerotacky.com/promoter/abc?tab=listing' })), true);
  });
  test('external link in the same tab asks; new tab does not', () => {
    assert.equal(G.leavesPage(info({ href: 'https://ironpodium.com/x' })), true);
    assert.equal(G.leavesPage(info({ href: 'https://ironpodium.com/x', target: '_blank' })), false);
  });
  test('same page hash, mailto, download, modifier clicks and non-links are left alone', () => {
    assert.equal(G.leavesPage(info({ href: 'https://www.zerotacky.com/promoter/abc?tab=events#athletes' })), false);
    assert.equal(G.leavesPage(info({ href: 'mailto:a@b.c' })), false);
    assert.equal(G.leavesPage(info({ href: 'https://www.zerotacky.com/x.csv', download: true })), false);
    assert.equal(G.leavesPage(info({ href: 'https://www.zerotacky.com/promoter', modifier: true })), false);
    assert.equal(G.leavesPage(info({})), false);
  });
  test('message names the stakes', () => {
    assert.match(G.LEAVE_MESSAGE, /unsaved/i);
  });
});
