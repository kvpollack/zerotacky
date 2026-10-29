import { test, describe, expect } from 'bun:test';

const ROOT = process.env.ZT_ROOT || '..';
const R = await import(`${ROOT}/lib/email/registration.ts`);

const base = () => ({
  registration_id: 'aa04e0da-4b0d-4aa7-b696-79f46d719f9a', caller_role: 'athlete', status: 'pending', waitlisted: false,
  athlete_name: 'Dana <b>Reyes</b>', athlete_email: 'dana@example.com', division_name: 'Open Women',
  meet_id: '23da26d1-3694-463f-90bc-99ef608def31', meet_slug: 'iron-harbor-classic-2026', meet_name: 'Iron Harbor Classic 2026',
  meet_date: '2026-11-14', is_demo: false, venue: { facilityName: 'Harbor Strength', city: 'Baltimore', state: 'MD' },
  entry_fee_display: '$80, paid to the promoter', promoter_contact: 'promo@example.com', promoter_email: 'owner@example.com',
  promoter_name: 'Sam Okafor', email_log: {},
});
const SITE = 'https://www.zerotacky.com/';

describe('registration emails (031)', () => {
  test('received: pending wording, facts, show link and My Meets link; html escaped', () => {
    const m = R.registrationReceivedEmail(base(), SITE);
    expect(m.subject).toBe('Registration received: Iron Harbor Classic 2026');
    expect(m.text).toContain('Hi Dana,');
    expect(m.text).toContain('Date: Nov 14, 2026');
    expect(m.text.indexOf('Division:')).toBeLessThan(m.text.indexOf('does not collect'));
    expect(m.text).toContain('Where: Harbor Strength, Baltimore, MD');
    expect(m.text).toContain('Division: Open Women');
    expect(m.text).toContain('Entry fee: $80, paid to the promoter');
    expect(m.text).toContain('does not collect entry fees');
    expect(m.text).toContain('https://www.zerotacky.com/shows/iron-harbor-classic-2026');
    expect(m.text).toContain('https://www.zerotacky.com/website/account');
    expect(m.html).not.toContain('<b>Reyes</b>');   // only the first name is used, and it is escaped
    expect(m.html).toContain('Hi Dana,');
    expect(m.html).toContain('href="https://www.zerotacky.com/shows/iron-harbor-classic-2026"');
    // never reads like a receipt
    expect(m.text.replace('$80, paid to the promoter', '')).not.toMatch(/receipt|payment received|you paid/i);
  });

  test('received: waitlisted wording', () => {
    const m = R.registrationReceivedEmail({ ...base(), waitlisted: true }, SITE);
    expect(m.subject).toBe("You're on the waitlist: Iron Harbor Classic 2026");
    expect(m.text).toContain('on the waitlist');
    expect(m.text).toContain('Nothing is owed until then');
  });

  test('decision: accepted and declined read differently; declined without a contact points at the show page', () => {
    const a = R.registrationDecisionEmail({ ...base(), status: 'accepted' }, SITE);
    expect(a.subject).toBe("You're in: Iron Harbor Classic 2026");
    expect(a.text).toContain('You are on the roster');
    expect(a.text).toContain('live scoreboard');
    const d = R.registrationDecisionEmail({ ...base(), status: 'declined' }, SITE);
    expect(d.subject).toBe('Update on your registration: Iron Harbor Classic 2026');
    expect(d.text).toContain('was not able to accept');
    expect(d.text).toContain('promoter contact above');
    expect(d.text).toContain('https://www.zerotacky.com/shows');
    const d2 = R.registrationDecisionEmail({ ...base(), status: 'declined', promoter_contact: null }, SITE);
    expect(d2.text).toContain('show page lists any contact');
    expect(d2.text).not.toContain('Promoter contact:');
  });

  test('promoter notice names the athlete, division and state, and links the dashboard', () => {
    const m = R.promoterNoticeEmail(base(), SITE);
    expect(m.subject).toBe('New registration: Dana <b>Reyes</b> for Iron Harbor Classic 2026');
    expect(m.text).toContain('Hi Sam,');
    expect(m.text).toContain('waiting for your decision');
    expect(m.text).toContain('Status: Pending');
    expect(m.text).toContain('https://www.zerotacky.com/promoter/23da26d1-3694-463f-90bc-99ef608def31');
    expect(m.html).not.toContain('<b>Reyes</b>');
    expect(m.html).toContain('Dana &lt;b&gt;Reyes&lt;/b&gt;');
    const w = R.promoterNoticeEmail({ ...base(), waitlisted: true, promoter_name: '' }, SITE);
    expect(w.text).toContain('Hi,');
    expect(w.text).toContain('on the waitlist');
    expect(w.text).toContain('Status: Waitlist');
    const a = R.promoterNoticeEmail({ ...base(), status: 'accepted' }, SITE);
    expect(a.text).toContain('accepted automatically and on the roster');
    expect(a.text).toContain('Status: Accepted');
    expect(a.text).toContain('I review each one');
  });

  test('missing optional facts are left out; venueLine handles partial venues', () => {
    const m = R.registrationReceivedEmail({ ...base(), meet_date: null, venue: null, entry_fee_display: null, promoter_contact: null }, SITE);
    expect(m.text).not.toContain('Date:');
    expect(m.text).not.toContain('Where:');
    expect(m.text).not.toContain('Entry fee:');
    expect(m.text).not.toContain('Promoter contact:');
    expect(R.venueLine({ city: 'York', state: 'PA' })).toBe('York, PA');
    expect(R.venueLine({ facilityName: 'Barn' })).toBe('Barn');
    expect(R.venueLine({ city: 'York' })).toBe('York');
    expect(R.venueLine(null)).toBe('');
  });

  test('emailLogKey: decisions are keyed by status, the rest by kind', () => {
    expect(R.emailLogKey('received', 'pending')).toBe('received');
    expect(R.emailLogKey('notice', 'pending')).toBe('notice');
    expect(R.emailLogKey('decision', 'accepted')).toBe('decision_accepted');
    expect(R.emailLogKey('decision', 'declined')).toBe('decision_declined');
  });
});
