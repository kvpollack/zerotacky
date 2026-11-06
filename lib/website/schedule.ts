// Meet-day schedule (044, 11/6, feature gaps #7a). A show stores its timeline as structured times instead of a free-text
// note: check-in, weigh-in window, rules meeting, first event, estimated finish, plus an optional weigh-in the evening
// before (Strongman Corporation allows weigh-in up to 24 hours ahead). Times are local to the venue ("HH:MM", 24-hour)
// with an IANA time zone, so the show page, the .ics download and the reminders all read the same clock. Pure
// functions, no React; mirrored on the server by zt_schedule_ok.

export interface MeetSchedule {
  timezone?: string;          // IANA, e.g. 'America/New_York'. Absent = inferred from the venue state when needed.
  eveWeighInStart?: string;   // the day before the meet
  eveWeighInEnd?: string;
  checkIn?: string;           // doors / check-in opens
  weighInStart?: string;
  weighInEnd?: string;
  rulesMeeting?: string;
  start?: string;             // first event on the platform
  estimatedEnd?: string;
  notes?: string;             // <= 200 chars, e.g. 'Weigh-in is at the gym next door'
}

export type ScheduleTimeKey =
  | 'eveWeighInStart' | 'eveWeighInEnd' | 'checkIn' | 'weighInStart' | 'weighInEnd' | 'rulesMeeting' | 'start' | 'estimatedEnd';

export const SCHEDULE_TIME_KEYS: readonly ScheduleTimeKey[] = [
  'eveWeighInStart', 'eveWeighInEnd', 'checkIn', 'weighInStart', 'weighInEnd', 'rulesMeeting', 'start', 'estimatedEnd',
];
export const SCHEDULE_KEYS: readonly string[] = ['timezone', ...SCHEDULE_TIME_KEYS, 'notes'];
export const SCHEDULE_NOTES_MAX = 200;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Accepts a `<input type="time">` value or typed text ('9:00', '9am', '9:30 PM', '0900'); returns 'HH:MM' or null. */
export function normalizeClock(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  if (!s) return null;
  if (HHMM.test(s)) return s;
  const m = s.match(/^(\d{1,2})(?::?([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ap = m[3] ? m[3][0] : '';
  if (ap) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (ap === 'p' ? 12 : 0);
  } else if (h > 23) {
    return null;
  }
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){1,2}$/.test(tz) || tz.length > 40) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Row value (jsonb) -> MeetSchedule, or null when absent or empty. Unknown keys and bad values are dropped, never thrown. */
export function parseSchedule(v: unknown): MeetSchedule | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const out: MeetSchedule = {};
  for (const k of SCHEDULE_TIME_KEYS) {
    const t = normalizeClock(o[k]);
    if (t) out[k] = t;
  }
  if (isValidTimeZone(o.timezone)) out.timezone = o.timezone;
  if (typeof o.notes === 'string' && o.notes.trim()) out.notes = o.notes.trim().slice(0, SCHEDULE_NOTES_MAX);
  return Object.keys(out).length ? out : null;
}

export function hasScheduleTimes(s: MeetSchedule | null | undefined): boolean {
  return Boolean(s && SCHEDULE_TIME_KEYS.some((k) => s[k]));
}

/** Form text -> saveable schedule. All blank = null (no schedule). Order problems are refused with plain words. */
export function cleanSchedule(input: Partial<Record<keyof MeetSchedule, unknown>> | null | undefined):
  { schedule: MeetSchedule | null; problem: null } | { schedule: null; problem: string } {
  if (!input) return { schedule: null, problem: null };
  const out: MeetSchedule = {};
  for (const k of SCHEDULE_TIME_KEYS) {
    const raw = input[k];
    if (raw === undefined || raw === null || String(raw).trim() === '') continue;
    const t = normalizeClock(raw);
    if (!t) return { schedule: null, problem: `${SCHEDULE_LABELS[k]} is not a time of day (use the picker, or type something like 9:00 AM).` };
    out[k] = t;
  }
  const notes = typeof input.notes === 'string' ? input.notes.trim() : '';
  if (notes.length > SCHEDULE_NOTES_MAX) return { schedule: null, problem: `Schedule note is too long (${SCHEDULE_NOTES_MAX} characters max).` };
  if (notes) out.notes = notes;
  const tz = typeof input.timezone === 'string' ? input.timezone.trim() : '';
  if (tz) {
    if (!isValidTimeZone(tz)) return { schedule: null, problem: 'Time zone must be a known zone name (like America/Chicago).' };
    out.timezone = tz;
  }
  if (!hasScheduleTimes(out) && !out.notes) return { schedule: null, problem: null };
  if (out.weighInStart && out.weighInEnd && out.weighInEnd <= out.weighInStart) return { schedule: null, problem: 'Weigh-in must end after it starts.' };
  if (out.eveWeighInStart && out.eveWeighInEnd && out.eveWeighInEnd <= out.eveWeighInStart) return { schedule: null, problem: 'The day-before weigh-in must end after it starts.' };
  if (out.start && out.estimatedEnd && out.estimatedEnd <= out.start) return { schedule: null, problem: 'Estimated finish must be after the first event.' };
  if (out.start && out.weighInEnd && out.weighInEnd > out.start) return { schedule: null, problem: 'Weigh-in should close before the first event starts.' };
  return { schedule: out, problem: null };
}

export function sameSchedule(a: MeetSchedule | null | undefined, b: MeetSchedule | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return SCHEDULE_KEYS.every((k) => (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k]);
}

export const SCHEDULE_LABELS: Record<ScheduleTimeKey, string> = {
  eveWeighInStart: 'Day-before weigh-in opens',
  eveWeighInEnd: 'Day-before weigh-in closes',
  checkIn: 'Check-in opens',
  weighInStart: 'Weigh-in opens',
  weighInEnd: 'Weigh-in closes',
  rulesMeeting: 'Rules meeting',
  start: 'First event',
  estimatedEnd: 'Estimated finish',
};

/** 'HH:MM' -> '9:00 AM'. Anything else comes back unchanged. */
export function formatClock(hhmm: string | undefined | null): string {
  if (!hhmm || !HHMM.test(hhmm)) return hhmm ?? '';
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}

export interface TimelineRow { label: string; value: string; dayBefore?: boolean }

/** The rows a show page or an email prints, in clock order, with windows joined ('7:00 AM to 8:15 AM'). */
export function scheduleTimeline(s: MeetSchedule | null | undefined): TimelineRow[] {
  if (!s) return [];
  const rows: TimelineRow[] = [];
  const window = (a?: string, b?: string) => (a && b ? `${formatClock(a)} to ${formatClock(b)}` : formatClock(a || b || ''));
  if (s.eveWeighInStart || s.eveWeighInEnd) rows.push({ label: 'Weigh-in, day before', value: window(s.eveWeighInStart, s.eveWeighInEnd), dayBefore: true });
  if (s.checkIn) rows.push({ label: 'Check-in opens', value: formatClock(s.checkIn) });
  if (s.weighInStart || s.weighInEnd) rows.push({ label: 'Weigh-in', value: window(s.weighInStart, s.weighInEnd) });
  if (s.rulesMeeting) rows.push({ label: 'Rules meeting', value: formatClock(s.rulesMeeting) });
  if (s.start) rows.push({ label: 'First event', value: formatClock(s.start) });
  if (s.estimatedEnd) rows.push({ label: 'Estimated finish', value: formatClock(s.estimatedEnd) });
  return rows;
}

// ---------------------------------------------------------------------------------------------------------------
// Time zones. A short US list for the promoter's picker, and a default from the venue state so most promoters never
// touch it. Split states take the zone most of the state keeps.
// ---------------------------------------------------------------------------------------------------------------

export const US_TIME_ZONES: readonly { id: string; label: string }[] = [
  { id: 'America/New_York', label: 'Eastern' },
  { id: 'America/Chicago', label: 'Central' },
  { id: 'America/Denver', label: 'Mountain' },
  { id: 'America/Phoenix', label: 'Arizona (no DST)' },
  { id: 'America/Los_Angeles', label: 'Pacific' },
  { id: 'America/Anchorage', label: 'Alaska' },
  { id: 'Pacific/Honolulu', label: 'Hawaii' },
  { id: 'America/Puerto_Rico', label: 'Atlantic (Puerto Rico)' },
];

const STATE_TZ: Record<string, string> = {
  CT: 'America/New_York', DE: 'America/New_York', DC: 'America/New_York', FL: 'America/New_York', GA: 'America/New_York',
  IN: 'America/New_York', KY: 'America/New_York', ME: 'America/New_York', MD: 'America/New_York', MA: 'America/New_York',
  MI: 'America/New_York', NH: 'America/New_York', NJ: 'America/New_York', NY: 'America/New_York', NC: 'America/New_York',
  OH: 'America/New_York', PA: 'America/New_York', RI: 'America/New_York', SC: 'America/New_York', VT: 'America/New_York',
  VA: 'America/New_York', WV: 'America/New_York',
  AL: 'America/Chicago', AR: 'America/Chicago', IL: 'America/Chicago', IA: 'America/Chicago', KS: 'America/Chicago',
  LA: 'America/Chicago', MN: 'America/Chicago', MS: 'America/Chicago', MO: 'America/Chicago', NE: 'America/Chicago',
  ND: 'America/Chicago', OK: 'America/Chicago', SD: 'America/Chicago', TN: 'America/Chicago', TX: 'America/Chicago',
  WI: 'America/Chicago',
  CO: 'America/Denver', ID: 'America/Denver', MT: 'America/Denver', NM: 'America/Denver', UT: 'America/Denver', WY: 'America/Denver',
  AZ: 'America/Phoenix',
  CA: 'America/Los_Angeles', NV: 'America/Los_Angeles', OR: 'America/Los_Angeles', WA: 'America/Los_Angeles',
  AK: 'America/Anchorage', HI: 'Pacific/Honolulu', PR: 'America/Puerto_Rico',
};

export function timeZoneForState(state: string | null | undefined): string | null {
  if (!state) return null;
  return STATE_TZ[state.trim().toUpperCase()] ?? null;
}

/** The zone the schedule runs in: its own, else the venue state's, else Eastern (where most ZeroTacky shows are). */
export function scheduleTimeZone(s: MeetSchedule | null | undefined, venueState?: string | null): string {
  return s?.timezone || timeZoneForState(venueState) || 'America/New_York';
}

export function timeZoneLabel(tz: string): string {
  const hit = US_TIME_ZONES.find((z) => z.id === tz);
  if (hit) return hit.label;
  return tz.replace(/^.*\//, '').replace(/_/g, ' ');
}

// ---------------------------------------------------------------------------------------------------------------
// Local wall clock -> UTC instant, via Intl (no library). Good for the DST transitions a meet can realistically hit.
// ---------------------------------------------------------------------------------------------------------------

function tzOffsetMinutes(utc: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p: Record<string, number> = {};
  for (const part of dtf.formatToParts(utc)) if (part.type !== 'literal') p[part.type] = Number(part.value);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return Math.round((asUtc - utc.getTime()) / 60000);
}

export function zonedToUtc(dateIso: string, hhmm: string, tz: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso) || !HHMM.test(hhmm)) return null;
  const [y, mo, d] = dateIso.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const off1 = tzOffsetMinutes(new Date(guess), tz);
  let utc = guess - off1 * 60000;
  const off2 = tzOffsetMinutes(new Date(utc), tz);
  if (off2 !== off1) utc = guess - off2 * 60000;
  return new Date(utc);
}

export function shiftIsoDate(dateIso: string, days: number): string {
  const [y, mo, d] = dateIso.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d + days)).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------------------------------------------
// iCalendar. One VEVENT for the meet (arrive at the first thing on the timeline, leave at the estimated finish) and,
// when there is one, a second for the day-before weigh-in. No schedule at all = an all-day event on the meet date.
// ---------------------------------------------------------------------------------------------------------------

export interface IcsShow {
  slug: string;
  name: string;
  date: string;            // YYYY-MM-DD
  venueState?: string | null;
  location?: string;       // 'Facility, 1 Main St, City, ST 00000'
  schedule: MeetSchedule | null;
  url: string;             // absolute show page URL
}

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`);
}
function icsStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}
function fold(line: string): string {
  // RFC 5545 3.1: lines over 75 octets are folded with CRLF + one space. Measured in UTF-8 bytes.
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (enc.encode(cur + ch).length > 75) { out.push(cur); cur = ` ${ch}`; } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n');
}

export function buildShowIcs(show: IcsShow, now: Date = new Date()): string {
  const tz = scheduleTimeZone(show.schedule, show.venueState);
  const s = show.schedule;
  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ZeroTacky//Show Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  const stamp = icsStamp(now);
  const desc = [
    ...scheduleTimeline(s).map((r) => `${r.label}: ${r.value}${r.dayBefore ? ` (${longDate(shiftIsoDate(show.date, -1))})` : ''}`),
    ...(s?.notes ? [s.notes] : []),
    `Times are ${timeZoneLabel(tz)} (${tz}).`,
    show.url,
  ].join('\n');

  const arrive = s?.checkIn || s?.weighInStart || s?.rulesMeeting || s?.start || null;
  const startUtc = arrive ? zonedToUtc(show.date, arrive, tz) : null;
  let endUtc = s?.estimatedEnd ? zonedToUtc(show.date, s.estimatedEnd, tz) : null;
  if (startUtc && (!endUtc || endUtc <= startUtc)) endUtc = new Date(startUtc.getTime() + 8 * 3600_000);

  lines.push('BEGIN:VEVENT', `UID:show-${show.slug}@zerotacky.com`, `DTSTAMP:${stamp}`);
  if (startUtc && endUtc) {
    lines.push(`DTSTART:${icsStamp(startUtc)}`, `DTEND:${icsStamp(endUtc)}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${show.date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${shiftIsoDate(show.date, 1).replace(/-/g, '')}`);
  }
  lines.push(`SUMMARY:${icsEscape(show.name)}`);
  if (show.location) lines.push(`LOCATION:${icsEscape(show.location)}`);
  lines.push(`DESCRIPTION:${icsEscape(desc)}`, `URL:${show.url}`, 'END:VEVENT');

  if (s?.eveWeighInStart) {
    const eve = shiftIsoDate(show.date, -1);
    const a = zonedToUtc(eve, s.eveWeighInStart, tz);
    let b = s.eveWeighInEnd ? zonedToUtc(eve, s.eveWeighInEnd, tz) : null;
    if (a) {
      if (!b || b <= a) b = new Date(a.getTime() + 2 * 3600_000);
      lines.push('BEGIN:VEVENT', `UID:show-${show.slug}-weighin@zerotacky.com`, `DTSTAMP:${stamp}`,
        `DTSTART:${icsStamp(a)}`, `DTEND:${icsStamp(b)}`, `SUMMARY:${icsEscape(`${show.name}: weigh-in (day before)`)}`);
      if (show.location) lines.push(`LOCATION:${icsEscape(show.location)}`);
      lines.push(`DESCRIPTION:${icsEscape(`Early weigh-in for ${show.name}.\n${show.url}`)}`, `URL:${show.url}`, 'END:VEVENT');
    }
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' });
}

export function icsHref(slug: string): string {
  return `/shows/${encodeURIComponent(slug)}/calendar.ics`;
}
