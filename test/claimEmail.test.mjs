import { test, describe, expect } from 'bun:test';

const ROOT = process.env.ZT_ROOT || '..';
const E = await import(`${ROOT}/lib/email/claimApproved.ts`);
const G = await import(`${ROOT}/lib/website/myGym.ts`);

describe('claim-approved email (027)', () => {
  test('builds subject, text and html with the gym and account links; escapes html in names', () => {
    const m = E.claimApprovedEmail({ toName: 'Dana <b>Q</b> Reyes', gymName: 'Iron & Oak', gymSlug: 'iron-oak-york-pa', siteUrl: 'https://www.zerotacky.com/' });
    expect(m.subject).toBe('You now manage Iron & Oak on ZeroTacky');
    expect(m.text).toContain('Hi Dana,');
    expect(m.text).toContain('https://www.zerotacky.com/gyms/iron-oak-york-pa');
    expect(m.text).toContain('https://www.zerotacky.com/website/account');
    expect(m.html).toContain('Iron &amp; Oak');
    expect(m.html).not.toContain('<b>Q</b>');
    expect(m.html).toContain('href="https://www.zerotacky.com/website/account"');
    expect(m.html).toContain('Reply to this email');
  });

  test('new-listing variant changes the subject and lead; empty name falls back to a plain greeting', () => {
    const m = E.claimApprovedEmail({ toName: '', gymName: 'Barn', gymSlug: 'barn', siteUrl: 'http://localhost:3079', newListing: true });
    expect(m.subject).toBe('Barn is live on ZeroTacky');
    expect(m.text).toContain('Hi,');
    expect(m.text).toContain('reviewed and published');
    expect(E.EMAIL_FROM).toBe('ZeroTacky <no-reply@zerotacky.com>');
    expect(E.EMAIL_REPLY_TO).toBe('admin@zerotacky.com');
  });

  test('sendClaimApprovedEmail forwards the session token and surfaces the server error text', async () => {
    const calls = [];
    const sb = { auth: { getSession: async () => ({ data: { session: { access_token: 'tok-123' } } }) } };
    const fetchOk = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, json: async () => ({ ok: true, to: 'a@b.c' }) }; };
    const r = await G.sendClaimApprovedEmail(sb, 'claim-1', { fetchImpl: fetchOk });
    expect(r.to).toBe('a@b.c');
    expect(calls[0].url).toBe('/api/claim-approved');
    expect(calls[0].init.headers.Authorization).toBe('Bearer tok-123');
    expect(JSON.parse(calls[0].init.body)).toEqual({ claimId: 'claim-1', force: false });

    const fetchBad = async () => ({ ok: false, status: 409, json: async () => ({ error: 'Claim is pending and the gym is unclaimed; nothing to announce.' }) });
    await expect(G.sendClaimApprovedEmail(sb, 'claim-1', { fetchImpl: fetchBad })).rejects.toThrow(/nothing to announce/);

    const noSession = { auth: { getSession: async () => ({ data: { session: null } }) } };
    await expect(G.sendClaimApprovedEmail(noSession, 'claim-1', { fetchImpl: fetchOk })).rejects.toThrow(/Sign in required/);
  });
});
