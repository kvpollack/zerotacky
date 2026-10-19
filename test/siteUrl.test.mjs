import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.env.ZT_ROOT || '..';
const { siteUrl } = await import(`${ROOT}/lib/website/siteUrl.ts`);

describe('siteUrl (metadataBase for link previews)', () => {
  const saved = { ...process.env };
  const reset = () => { for (const k of ['NEXT_PUBLIC_SITE_URL', 'VERCEL_ENV', 'VERCEL_URL']) delete process.env[k]; };
  test('explicit NEXT_PUBLIC_SITE_URL wins', () => {
    reset(); process.env.NEXT_PUBLIC_SITE_URL = 'https://example.org'; process.env.VERCEL_ENV = 'production';
    assert.equal(siteUrl().origin, 'https://example.org');
  });
  test('production on Vercel is www.zerotacky.com, previews use VERCEL_URL, local falls back to :3079', () => {
    reset(); process.env.VERCEL_ENV = 'production'; process.env.VERCEL_URL = 'zerotacky-abc.vercel.app';
    assert.equal(siteUrl().origin, 'https://www.zerotacky.com');
    reset(); process.env.VERCEL_ENV = 'preview'; process.env.VERCEL_URL = 'zerotacky-abc.vercel.app';
    assert.equal(siteUrl().origin, 'https://zerotacky-abc.vercel.app');
    reset();
    assert.equal(siteUrl().origin, 'http://localhost:3079');
    Object.assign(process.env, saved);
  });
});
