import type { EventDef } from '@/lib/types';

// Reader-facing formatting for the public site (MS-14, 10/26).

/** Full ISO instant -> the reader's local date and time, e.g. "Oct 26, 2026, 11:42 PM". '' when unparsable.
 *  Client-side only in practice: the server's zone would differ, so callers render it after mount. */
export function formatLocalDateTime(iso: string | null | undefined, locale?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(locale, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Display placeholders that sometimes stand in for missing address data (LT-05). Never part of a search. */
const PLACEHOLDERS = new Set(['not provided', 'tbd', 'tba', 'n/a', 'unknown', 'pending', '']);
const real = (p: string | undefined): string => {
  const t = (p ?? '').trim();
  return PLACEHOLDERS.has(t.toLowerCase()) ? '' : t;
};

/** Google Maps search link for a venue; null when there is nothing real to search for (no invented addresses,
 *  no placeholders). Demo fixtures pass `demo: true` and get no link: their venues are made up (LT-06). */
export function directionsUrl(v: { facilityName?: string; streetAddress?: string; city?: string; state?: string; postalCode?: string }, opts: { demo?: boolean } = {}): string | null {
  if (opts.demo) return null;
  const street = real(v.streetAddress), city = real(v.city), state = real(v.state);
  if (!street && !(city && state)) return null;
  const parts = [real(v.facilityName), street, city, state, real(v.postalCode)].filter(Boolean);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(', '))}`;
}


/** What an athlete in `divisionId` lifts in `ev`, as the show page prints it. Mirrors the pit-crew callout when the
 *  promoter wrote one, else the division weight (with unit mode and light tier), else a height-only setup, else the
 *  fixed implement description. '' when the promoter provided nothing (the caller labels that explicitly). */
export function eventWeightDisplay(ev: EventDef, divisionId: string): { main: string; setup?: string } {
  const mainWeight = ev.divisionWeights?.[divisionId];
  const lightWeight = ev.divisionLightWeights?.[divisionId];
  const defaultHeight = ev.divisionDefaultHeights?.[divisionId];
  const callout = ev.pitCrewCallout?.byDivision?.[divisionId]?.headline;
  let main = '';
  if (callout) main = callout;
  else if (typeof mainWeight === 'number' && mainWeight > 0) {
    main = `${mainWeight} lbs${ev.weightIsAddedPlatesOnly ? ' added' : ev.weightEntryMode === 'per_hand' ? ' / hand' : ''}`;
    if (ev.hasTrumpWeight && typeof lightWeight === 'number' && lightWeight > 0) main += ` (light ${lightWeight})`;
  } else if (ev.weightIsAddedPlatesOnly && mainWeight === 0 && defaultHeight) main = defaultHeight;
  else if (ev.fixedImplementDescription) main = ev.fixedImplementDescription;
  const setup = defaultHeight && defaultHeight !== main ? `${ev.heightLabel || 'Setup'}: ${defaultHeight}` : undefined;
  return setup ? { main, setup } : { main };
}
