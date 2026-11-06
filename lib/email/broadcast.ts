// Promoter broadcasts and automatic reminders (042, 11/5, feature gaps #10). Pure builders; /api/broadcast and
// /api/cron/reminders send them. A broadcast carries the promoter's own words; a reminder is written here from the
// meet's facts. Both end with a one-click unsubscribe (registration id + mail token) and reply to the promoter.
import { renderEmail, type EmailDoc } from './layout';
import { venueLine } from './registration';
import { formatShowDate } from '@/lib/website/showHistory';

export type BroadcastKind = 'broadcast' | 'reminder_7d' | 'reminder_1d';
export type BroadcastAudience = 'accepted' | 'all_active';

export interface BroadcastRecipient {
  id: string;                    // meet_broadcast_recipients.id
  registration_id: string | null;
  email: string;
  athlete_name: string;
  division_name: string;
  division_id?: string | null;   // joined from registrations; the 7-day reminder links the athlete's own prep sheet
  mail_token: string | null;
}

export interface BroadcastPayload {
  id: string;
  kind: BroadcastKind;
  audience: BroadcastAudience;
  subject: string;
  body: string;
  test_only: boolean;
  meet_id: string;
  meet_name: string;
  meet_date: string | null;
  meet_slug: string;
  venue: { facilityName?: string; streetAddress?: string; city?: string; state?: string; postalCode?: string } | null;
  promoter_email: string | null;
  promoter_name: string;
  promoter_contact: string | null;
  recipients: BroadcastRecipient[];
}

export const BROADCAST_LIMITS = { subject: 120, body: 2000, recipients: 500, perDay: 3, testsPerDay: 10 } as const;

function firstName(name: string): string {
  return (name.trim().split(/\s+/)[0] || '').slice(0, 40);
}
function greet(name: string): string {
  const f = firstName(name);
  return f && f !== 'Test' ? `Hi ${f},` : 'Hi,';
}

/** The promoter's text as paragraphs: blank lines split, single newlines become spaces, nothing else interpreted. */
export function bodyParagraphs(body: string): string[] {
  return String(body ?? '')
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
}

/** The link in the mail body: a page with one confirm key (a scanner prefetching the link opts nobody out). */
export function unsubscribeUrl(site: string, r: Pick<BroadcastRecipient, 'registration_id' | 'mail_token'>): string | null {
  if (!r.registration_id || !r.mail_token) return null;
  return `${site.replace(/\/+$/, '')}/unsubscribe?r=${encodeURIComponent(r.registration_id)}&t=${encodeURIComponent(r.mail_token)}`;
}
/** The List-Unsubscribe header: accepts the one-click POST (RFC 8058); a GET there redirects to the page above. */
export function unsubscribePostUrl(site: string, r: Pick<BroadcastRecipient, 'registration_id' | 'mail_token'>): string | null {
  const u = unsubscribeUrl(site, r);
  return u ? u.replace('/unsubscribe?', '/api/unsubscribe?') : null;
}

function showUrl(site: string, slug: string): string {
  return `${site.replace(/\/+$/, '')}/shows/${encodeURIComponent(slug)}`;
}

const BROADCAST_FOOTER = (meet: string) => `You received this because you registered for ${meet} through ZeroTacky. The promoter wrote it; ZeroTacky delivered it.`;
const REMINDER_FOOTER = (meet: string) => `You received this because you are on the roster for ${meet} through ZeroTacky. One reminder a week out, one the day before.`;

export interface BuiltMail { to: string; subject: string; text: string; html: string; unsubscribe: string | null /* header URL */ }

/** The promoter's message to one athlete. The test send gets the same mail with a [Test] prefix on the subject. */
export function broadcastEmail(p: BroadcastPayload, r: BroadcastRecipient, siteUrl: string): BuiltMail {
  const site = siteUrl.replace(/\/+$/, '');
  const unsub = unsubscribeUrl(site, r);
  const paragraphs = bodyParagraphs(p.body);
  const doc: EmailDoc = {
    subject: `${p.test_only ? '[Test] ' : ''}${p.subject}`,
    heading: p.subject,
    greeting: greet(r.athlete_name),
    lead: paragraphs[0] ?? '',
    paragraphs: [
      ...paragraphs.slice(1),
      `From ${p.promoter_name || 'the promoter'} of ${p.meet_name}${p.meet_date ? ` (${formatShowDate(p.meet_date)})` : ''}. Reply to this email to reach them.`,
    ],
    cta: { label: 'View the show', url: showUrl(site, p.meet_slug) },
    links: unsub ? [{ label: 'Stop messages and reminders for this show', url: unsub }] : [],
    footerNote: BROADCAST_FOOTER(p.meet_name),
  };
  const m = renderEmail(doc, site);
  return { to: r.email, ...m, unsubscribe: unsubscribePostUrl(site, r) };
}

/** The 7-day / 1-day reminder: facts, the prep sheet for the athlete's division, the show page. */
export function reminderEmail(p: BroadcastPayload, r: BroadcastRecipient, siteUrl: string, divisionId?: string | null): BuiltMail {
  const site = siteUrl.replace(/\/+$/, '');
  const unsub = unsubscribeUrl(site, r);
  const week = p.kind === 'reminder_7d';
  const when = p.meet_date ? formatShowDate(p.meet_date) : '';
  const where = venueLine(p.venue);
  const facts: NonNullable<EmailDoc['facts']> = [{ label: 'Show', value: p.meet_name }];
  if (when) facts.push({ label: 'Date', value: when });
  if (where) facts.push({ label: 'Where', value: where });
  if (r.division_name) facts.push({ label: 'Division', value: r.division_name });
  if (p.promoter_contact) facts.push({ label: 'Promoter contact', value: p.promoter_contact });
  const prep = `${showUrl(site, p.meet_slug)}/prep${divisionId ? `?division=${encodeURIComponent(divisionId)}` : ''}`;
  const doc: EmailDoc = {
    subject: week ? `${p.meet_name} is one week away` : `${p.meet_name} is tomorrow`,
    heading: week ? 'One week out' : 'Tomorrow',
    greeting: greet(r.athlete_name),
    lead: week
      ? `${p.meet_name} is one week from today${when ? `, ${when}` : ''}. You are on the roster${r.division_name ? ` in ${r.division_name}` : ''}.`
      : `${p.meet_name} is tomorrow${when ? `, ${when}` : ''}. You are on the roster${r.division_name ? ` in ${r.division_name}` : ''}.`,
    facts,
    paragraphs: week
      ? ['The events, weights and rules are on the show page, and the prep sheet lays them out for your division. Weigh-in times, the schedule and anything about the fee come from the promoter: reply to this email to reach them.']
      : ['Check the show page tonight for the schedule and any late changes from the promoter. On meet day the live scoreboard runs on the show page. Reply to this email to reach the promoter.'],
    cta: { label: week ? 'Prep sheet' : 'Show page', url: week ? prep : showUrl(site, p.meet_slug) },
    links: [
      ...(week ? [{ label: 'Show page', url: showUrl(site, p.meet_slug) }] : [{ label: 'Prep sheet', url: prep }]),
      ...(unsub ? [{ label: 'Stop messages and reminders for this show', url: unsub }] : []),
    ],
    footerNote: REMINDER_FOOTER(p.meet_name),
  };
  const m = renderEmail(doc, site);
  return { to: r.email, ...m, unsubscribe: unsubscribePostUrl(site, r) };
}

export function buildMail(p: BroadcastPayload, r: BroadcastRecipient, siteUrl: string, divisionId?: string | null): BuiltMail {
  return p.kind === 'broadcast' ? broadcastEmail(p, r, siteUrl) : reminderEmail(p, r, siteUrl, divisionId);
}

/** 'reminder_7d' when the meet is 7 days after `today`, 'reminder_1d' the day before, else null. ISO dates, no time zones. */
export function reminderDue(meetDate: string, today: string): 'reminder_7d' | 'reminder_1d' | null {
  const d = Date.parse(`${meetDate}T00:00:00Z`);
  const t = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(d) || !Number.isFinite(t)) return null;
  const days = Math.round((d - t) / 86400000);
  return days === 7 ? 'reminder_7d' : days === 1 ? 'reminder_1d' : null;
}

/** For the UI: who a broadcast would reach, before the server snapshots it (same rule as zt_create_broadcast). */
export function audienceCount(
  regs: Array<{ status: string; email: string }>,
  audience: BroadcastAudience,
): number {
  const seen = new Set<string>();
  for (const r of regs) {
    const ok = r.status === 'accepted' || (audience === 'all_active' && (r.status === 'pending' || r.status === 'waitlist'));
    const e = (r.email ?? '').trim().toLowerCase();
    if (ok && e) seen.add(e);
  }
  return seen.size;
}

export const KIND_LABELS: Record<BroadcastKind, string> = {
  broadcast: 'Message',
  reminder_7d: 'Reminder, one week out',
  reminder_1d: 'Reminder, day before',
};
export const AUDIENCE_LABELS: Record<BroadcastAudience, string> = {
  accepted: 'Accepted athletes',
  all_active: 'Everyone registered (accepted, pending, waitlist)',
};
