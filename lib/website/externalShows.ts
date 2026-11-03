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

/** Today's date as YYYY-MM-DD in UTC; the listing query drops shows before it. */
export function isoToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
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
