// Reader-facing formatting for the public site (MS-14, 10/26).

/** Full ISO instant -> the reader's local date and time, e.g. "Oct 26, 2026, 11:42 PM". '' when unparsable.
 *  Client-side only in practice: the server's zone would differ, so callers render it after mount. */
export function formatLocalDateTime(iso: string | null | undefined, locale?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(locale, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Google Maps search link for a venue; null when there is nothing to search for (no invented addresses). */
export function directionsUrl(v: { facilityName?: string; streetAddress?: string; city?: string; state?: string; postalCode?: string }): string | null {
  const parts = [v.facilityName, v.streetAddress, v.city, v.state, v.postalCode].map((p) => (p ?? '').trim()).filter(Boolean);
  if (!v.streetAddress?.trim() && !(v.city?.trim() && v.state?.trim())) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(', '))}`;
}
