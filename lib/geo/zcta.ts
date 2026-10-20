// Zip centroids from the US Census 2023 ZCTA gazetteer (public domain), rounded to 0.01 degrees (about 1 km),
// 33,791 zips. Import this only from server code (app/api/zip/[zip]): the JSON is ~760 KB and must not reach a client bundle. Rebuild with the snippet in
// ROADMAP section 6 step 3 when a newer gazetteer lands.
import table from './zcta.json';
import { normalizeZip, type GeoPoint } from './geo';

const ZCTA = table as unknown as Record<string, [number, number]>;

export function zipCentroid(raw: string): GeoPoint | null {
  const zip = normalizeZip(raw);
  if (!zip) return null;
  const hit = ZCTA[zip];
  return hit ? { lat: hit[0], lng: hit[1] } : null;
}

export const ZCTA_COUNT = Object.keys(ZCTA).length;
