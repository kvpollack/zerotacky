// External show listings (feature 2 MVP, 11/3): competitions registered elsewhere, curated in `external_shows` (038).
// They ride the /shows list as PublicShowSummary rows with `externalUrl` set; there is no show page for them, the row
// links out. Pure mapping here; the fetch lives in data.ts next to the meets.
import type { PublicShowSummary } from './types';

export interface ExternalShowRow {
  id: string;
  name: string;
  date: string;             // YYYY-MM-DD
  city: string;
  state: string;
  facility_name: string | null;
  federation: string | null;
  divisions_note: string | null;
  registration_url: string;
  source: 'promoter' | 'admin';
  status: 'pending' | 'listed' | 'hidden';
  updated_at?: string;
}

export const EXTERNAL_SHOW_COLS = 'id,name,date,city,state,facility_name,federation,divisions_note,registration_url,source,status,updated_at';

/** "https://www.ironpodium.com/events/123" -> "ironpodium.com"; falls back to the raw string when it is not a URL. */
export function externalHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * The US show day as YYYY-MM-DD (BLD-09). The calendar is US-only for now, and midnight in Los Angeles is the last
 * moment any US show on that date can still be running, so a listing stays up through its whole show day everywhere
 * and comes down the day after. The same clock lives in SQL as `zt_us_show_day()` (039) for the past-date check.
 */
export const SHOW_DAY_TIME_ZONE = 'America/Los_Angeles';
export function isoToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: SHOW_DAY_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function externalRowToSummary(row: ExternalShowRow): PublicShowSummary {
  const divisionLabels = (row.divisions_note ?? '')
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
  return {
    id: `ext-${row.id}`,
    slug: `ext-${row.id}`,
    name: row.name,
    date: row.date,
    venue: { city: row.city, state: row.state, country: 'US', ...(row.facility_name ? { facilityName: row.facility_name } : {}) },
    federation: row.federation ?? undefined,
    divisionGroupingStyle: 'mixed',
    divisionLabels,
    implementTags: [],
    competitionStatus: 'upcoming',
    registrationStatus: 'not_provided',
    resultsStatus: 'not_started',
    isDemoFixture: false,
    lastUpdatedIso: row.updated_at,
    externalUrl: row.registration_url,
    externalHost: externalHost(row.registration_url),
  };
}
