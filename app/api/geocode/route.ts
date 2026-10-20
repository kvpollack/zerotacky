import { NextResponse } from 'next/server';
import { zipCentroid } from '@/lib/geo/zcta';

// GET /api/geocode?street=&city=&state=&zip= -> { lat, lng, source: 'street' | 'zip' } or 404.
// Street-level pin from the Census geocoder (free, no key, public domain), zip centroid when Census has no match.
// The street number must agree with the match so a wrong street does not silently land on a neighbour's block.
export const dynamic = 'force-dynamic';

const CENSUS = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';

export async function GET(req: Request) {
  const u = new URL(req.url);
  const street = (u.searchParams.get('street') ?? '').trim().slice(0, 160);
  const city = (u.searchParams.get('city') ?? '').trim().slice(0, 80);
  const state = (u.searchParams.get('state') ?? '').trim().toUpperCase().slice(0, 2);
  const zip = (u.searchParams.get('zip') ?? '').trim().slice(0, 10);
  const headers = { 'Cache-Control': 'public, max-age=604800' };

  if (street && /^\d/.test(street) && (city || zip) && /^[A-Z]{2}$/.test(state)) {
    try {
      const q = new URLSearchParams({ address: `${street}, ${city}, ${state} ${zip}`.trim(), benchmark: 'Public_AR_Current', format: 'json' });
      const res = await fetch(`${CENSUS}?${q}`, { signal: AbortSignal.timeout(8000), next: { revalidate: 604800 } });
      if (res.ok) {
        const j = (await res.json()) as { result?: { addressMatches?: { matchedAddress: string; coordinates: { x: number; y: number }; addressComponents?: { city?: string; state?: string; zip?: string } }[] } };
        const m = j.result?.addressMatches?.[0];
        // Accept the match only when the number, state, and whichever of zip/city we were given agree with it; the
        // Census "nearest" answer can be the right number on a different street or town (Astra G-L2).
        const ac = m?.addressComponents ?? {};
        const sameNumber = !!m && m.matchedAddress.split(' ')[0] === street.split(' ')[0];
        const sameState = !ac.state || ac.state.toUpperCase() === state;
        const sameZip = !zip || !ac.zip || ac.zip === zip.slice(0, 5);
        const sameCity = !city || !ac.city || ac.city.toUpperCase() === city.toUpperCase();
        if (m && sameNumber && sameState && sameZip && sameCity) {
          return NextResponse.json({ lat: Math.round(m.coordinates.y * 1e5) / 1e5, lng: Math.round(m.coordinates.x * 1e5) / 1e5, source: 'street' }, { headers });
        }
      }
    } catch {
      // fall through to the zip centroid
    }
  }
  const hit = zipCentroid(zip);
  if (hit) return NextResponse.json({ ...hit, source: 'zip' }, { headers });
  return NextResponse.json({ error: 'No match' }, { status: 404, headers: { 'Cache-Control': 'public, max-age=3600' } });
}
