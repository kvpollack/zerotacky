// Directory listing helpers (UI pass 2, 11/27; audits/ui-audit-merged-2026-11-13.md rows 4 and 13). Pure functions, so
// the paging arithmetic and the one-line card texts are tested without rendering a component.
import type { DayPassAvailability, StrongmanGymListing } from './types';

/** Entries a directory shows before the "Show more" key. */
export const DIRECTORY_PAGE_SIZE = 24;

/** Ceiling for the `?n=` count a link can ask for, so a crafted URL cannot make the server render an unbounded list. */
export const DIRECTORY_MAX_SHOWN = 1200;

/** `?n=` on a directory URL: how many entries were open when the visitor left, so Back reopens the same list.
 *  Digits only; anything else, or less than one page, is one page. */
export function cleanShownParam(raw: string | string[] | undefined): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v || !/^\d{1,6}$/.test(v)) return DIRECTORY_PAGE_SIZE;
  return Math.min(DIRECTORY_MAX_SHOWN, Math.max(DIRECTORY_PAGE_SIZE, Number(v)));
}

/** How many entries are shown after one more press of the key. Never past the total, never below zero. */
export function nextShown(shown: number, total: number, page: number = DIRECTORY_PAGE_SIZE): number {
  return Math.max(0, Math.min(total, Math.max(0, shown) + page));
}

/** Label for the "more" key: "Show 24 more", "Show 7 more". Null when everything is already on the page. */
export function moreLabel(shown: number, total: number, page: number = DIRECTORY_PAGE_SIZE): string | null {
  const left = total - shown;
  return left > 0 ? `Show ${Math.min(page, left)} more` : null;
}

/** "Showing 24 of 169 gyms", "Showing 3 of 169 gyms" (filtered), "Showing 1 gym", "No gyms". */
export function shownLabel(shown: number, matching: number, noun: [singular: string, plural: string]): string {
  if (matching <= 0) return `No ${noun[1]}`;
  const visible = Math.min(shown, matching);
  return visible < matching ? `Showing ${visible} of ${matching} ${noun[1]}` : `Showing ${matching} ${matching === 1 ? noun[0] : noun[1]}`;
}

/** Equipment as one line of text instead of a chip per tag: the first `max` tags joined with " · " and the count left off. */
export function equipmentLine(tags: string[], max = 6): { text: string; more: number } {
  const clean = tags.map((t) => t.trim()).filter(Boolean);
  return { text: clean.slice(0, max).join(' · '), more: Math.max(0, clean.length - max) };
}

export interface DayPassSummary { label: string; value: string; strong: boolean }

/** Day pass as a label and a value for the card's name band. Null when the gym has said nothing at all. */
export function dayPassSummary(availability: DayPassAvailability, price?: string | null): DayPassSummary | null {
  const p = (price ?? '').trim();
  if (availability === 'available') return { label: 'Day pass', value: p || 'Available', strong: true };
  if (availability === 'by_appointment') return { label: 'Drop-in', value: p ? `By appointment · ${p}` : 'By appointment', strong: false };
  if (availability === 'not_available') return { label: 'Day pass', value: 'Members only', strong: false };
  // availability missing but a price on file (pass 1, finding 24): show the price, which already carries its "$"
  return p ? { label: 'Day pass', value: p, strong: false } : null;
}

type GymGaps = Pick<StrongmanGymListing, 'streetAddress' | 'dayPassAvailability' | 'dayPassPriceDisplay' | 'dropInHours' | 'dropInPolicy'>;

/** One sentence for everything a listing has not supplied, in place of a "Not provided" row per field. Null when nothing is missing. */
export function missingDetailsLine(gym: GymGaps): string | null {
  const missing: string[] = [];
  if (!gym.streetAddress?.trim()) missing.push('street address');
  if (dayPassSummary(gym.dayPassAvailability, gym.dayPassPriceDisplay) === null) missing.push('day pass');
  if (!gym.dropInHours?.trim()) missing.push('hours');
  if (!gym.dropInPolicy?.trim()) missing.push('drop-in policy');
  return missing.length ? `Not provided: ${missing.join(', ')}.` : null;
}
