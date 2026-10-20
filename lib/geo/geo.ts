// Distance helpers for the Gym Directory zip + radius filter (Kurt 10/20). Pure; the zip table lives in
// zcta.ts (server only) so phones never download it.
export interface GeoPoint {
  lat: number;
  lng: number;
}

export const RADIUS_OPTIONS_MILES = [25, 50, 100] as const;
export type RadiusMiles = (typeof RADIUS_OPTIONS_MILES)[number];
export const DEFAULT_RADIUS_MILES: RadiusMiles = 50;

const EARTH_RADIUS_MILES = 3958.8;

export function haversineMiles(a: GeoPoint, b: GeoPoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Five digits, optionally with a +4 we ignore.
export function normalizeZip(raw: string): string | null {
  const m = raw.trim().match(/^(\d{5})(?:-?\d{4})?$/);
  return m ? m[1] : null;
}

export function isRadiusMiles(n: number): n is RadiusMiles {
  return (RADIUS_OPTIONS_MILES as readonly number[]).includes(n);
}

export function formatMiles(mi: number): string {
  return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
}
