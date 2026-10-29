// Registration emails (031, 10/28). Pure builders; /api/registration-email sends them. Three messages:
//   received  -> athlete, right after submitting (pending or waitlisted wording)
//   notice    -> promoter (meet owner), same moment
//   decision  -> athlete, when the promoter accepts or declines
// Payment is never claimed here: ZeroTacky does not take money, so fee lines always point at the promoter.
import { renderEmail, type EmailDoc } from './layout';
import { formatShowDate } from '@/lib/website/showHistory';

export interface RegistrationEmailPayload {
  registration_id: string;
  caller_role: 'athlete' | 'promoter';
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'waitlist';
  waitlisted: boolean;
  athlete_name: string;
  athlete_email: string | null;
  division_name: string;
  meet_id: string;
  meet_slug: string;
  meet_name: string;
  meet_date: string | null;
  is_demo: boolean;
  venue: { facilityName?: string; streetAddress?: string; city?: string; state?: string; postalCode?: string } | null;
  entry_fee_display: string | null;
  promoter_contact: string | null;
  promoter_email: string | null;
  promoter_name: string;
  // 031 wrote an ISO string per kind; 033 writes {sent, count, attempt}. The server decides from it, the client never reads it.
  email_log: Record<string, string | { sent: string | null; count: number; attempt: string | null }>;
}

export type RegistrationEmailKind = 'received' | 'decision';

function firstName(name: string): string {
  return (name.trim().split(/\s+/)[0] || '').slice(0, 40);
}
function greet(name: string): string {
  const f = firstName(name);
  return f ? `Hi ${f},` : 'Hi,';
}
export function venueLine(v: RegistrationEmailPayload['venue']): string {
  if (!v) return '';
  const place = [v.facilityName, v.city && v.state ? `${v.city}, ${v.state}` : v.city || v.state].filter(Boolean);
  return place.join(', ');
}
function facts(p: RegistrationEmailPayload): EmailDoc['facts'] {
  const out: NonNullable<EmailDoc['facts']> = [{ label: 'Show', value: p.meet_name }];
  if (p.meet_date) out.push({ label: 'Date', value: formatShowDate(p.meet_date) });
  const where = venueLine(p.venue);
  if (where) out.push({ label: 'Where', value: where });
  out.push({ label: 'Division', value: p.division_name });
  if (p.entry_fee_display) out.push({ label: 'Entry fee', value: p.entry_fee_display });
  if (p.promoter_contact) out.push({ label: 'Promoter contact', value: p.promoter_contact });
  return out;
}
const FEE_NOTE = 'ZeroTacky does not collect entry fees. The promoter handles payment; use the promoter contact above for anything about the fee, the schedule or the rules.';
const ATHLETE_FOOTER = 'You received this because you registered for a show through ZeroTacky. It is not a mailing list.';

export function registrationReceivedEmail(p: RegistrationEmailPayload, siteUrl: string) {
  const site = siteUrl.replace(/\/+$/, '');
  const showUrl = `${site}/shows/${encodeURIComponent(p.meet_slug)}`;
  const myMeets = `${site}/website/account`;
  const doc: EmailDoc = p.waitlisted
    ? {
        subject: `You're on the waitlist: ${p.meet_name}`,
        heading: 'You are on the waitlist',
        greeting: greet(p.athlete_name),
        lead: `We received your registration for ${p.meet_name} in ${p.division_name}. The show is at capacity or past its deadline, so your request is on the waitlist.`,
        facts: facts(p),
        paragraphs: [
          'The promoter reviews the waitlist as spots open and you will get another email if your entry is accepted. Nothing is owed until then.',
          FEE_NOTE,
        ],
        cta: { label: 'View the show', url: showUrl },
        links: [{ label: 'Your registrations', url: myMeets }],
        footerNote: ATHLETE_FOOTER,
      }
    : {
        subject: `Registration received: ${p.meet_name}`,
        heading: 'Registration received',
        greeting: greet(p.athlete_name),
        lead: `We received your registration for ${p.meet_name} in ${p.division_name}. The promoter reviews every request and you will get another email once they decide.`,
        facts: facts(p),
        paragraphs: [FEE_NOTE],
        cta: { label: 'View the show', url: showUrl },
        links: [{ label: 'Your registrations', url: myMeets }],
        footerNote: ATHLETE_FOOTER,
      };
  return renderEmail(doc, site);
}

export function registrationDecisionEmail(p: RegistrationEmailPayload, siteUrl: string) {
  const site = siteUrl.replace(/\/+$/, '');
  const showUrl = `${site}/shows/${encodeURIComponent(p.meet_slug)}`;
  const myMeets = `${site}/website/account`;
  if (p.status === 'accepted') {
    const doc: EmailDoc = {
      subject: `You're in: ${p.meet_name}`,
      heading: 'You are on the roster',
      greeting: greet(p.athlete_name),
      lead: `The promoter accepted your registration for ${p.meet_name} in ${p.division_name}. You are on the roster.`,
      facts: facts(p),
      paragraphs: [
        'Weigh-ins, the schedule and the rules come from the promoter. On meet day the live scoreboard runs on the show page.',
        FEE_NOTE,
      ],
      cta: { label: 'View the show', url: showUrl },
      links: [{ label: 'Your registrations', url: myMeets }],
      footerNote: ATHLETE_FOOTER,
    };
    return renderEmail(doc, site);
  }
  const doc: EmailDoc = {
    subject: `Update on your registration: ${p.meet_name}`,
    heading: 'Registration not accepted',
    greeting: greet(p.athlete_name),
    lead: `The promoter was not able to accept your registration for ${p.meet_name} in ${p.division_name}.`,
    facts: facts(p),
    paragraphs: [
      p.promoter_contact
        ? 'Promoters decline for many reasons, from a full division to an entry that landed in the wrong class. The promoter contact above is the place to ask.'
        : 'Promoters decline for many reasons, from a full division to an entry that landed in the wrong class. The show page lists any contact details the promoter shared.',
      'Other shows taking registrations are listed on ZeroTacky.',
    ],
    cta: { label: 'Find a show', url: `${site}/shows` },
    links: [{ label: 'This show', url: showUrl }],
    footerNote: ATHLETE_FOOTER,
  };
  return renderEmail(doc, site);
}

export function promoterNoticeEmail(p: RegistrationEmailPayload, siteUrl: string) {
  const site = siteUrl.replace(/\/+$/, '');
  const dashUrl = `${site}/promoter/${encodeURIComponent(p.meet_id)}`;
  const state = p.status === 'accepted' ? 'accepted automatically and on the roster' : p.waitlisted ? 'on the waitlist' : 'waiting for your decision';
  const doc: EmailDoc = {
    subject: `New registration: ${p.athlete_name} for ${p.meet_name}`,
    heading: 'New registration',
    greeting: greet(p.promoter_name),
    lead: `${p.athlete_name} registered for ${p.meet_name} in ${p.division_name}. The request is ${state}.`,
    facts: [
      { label: 'Athlete', value: p.athlete_name },
      { label: 'Division', value: p.division_name },
      { label: 'Status', value: p.status === 'accepted' ? 'Accepted' : p.waitlisted ? 'Waitlist' : 'Pending' },
      ...(p.meet_date ? [{ label: 'Show date', value: formatShowDate(p.meet_date) }] : []),
    ],
    paragraphs: [
      p.status === 'accepted'
        ? 'Nothing to do unless you want to decline: that is on the Registrations tab, and it emails the athlete. Switch new entries to "I review each one" on the Listing tab if you would rather approve them yourself.'
        : 'Accept or decline from the Registrations tab. Accepting adds the athlete to the roster and emails them; declining emails them too.',
    ],
    cta: { label: 'Open Registrations', url: dashUrl },
    footerNote: 'You received this because you own a show on ZeroTacky that takes registrations.',
  };
  return renderEmail(doc, site);
}

// Stamp key per message, so a decline after an accept still mails and a retry of the same decision does not.
export function emailLogKey(kind: RegistrationEmailKind | 'notice', status: RegistrationEmailPayload['status']): string {
  if (kind === 'decision') return `decision_${status}`;
  return kind;
}
