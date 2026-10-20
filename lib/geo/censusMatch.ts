// Decide whether a Census geocoder match is the address we asked for. Pure, so the route stays thin and this is testable.
// Astra G-L2 (10/21): the "nearest" Census answer can be the right number on another street or in another town, and a
// response with no addressComponents must not pass by default. Evidence has to be present and agree, or we fall back to
// the zip centroid.
export interface CensusMatch {
  matchedAddress?: string;
  coordinates?: { x: number; y: number };
  addressComponents?: { city?: string; state?: string; zip?: string };
}
export interface GeocodeRequest { street: string; city: string; state: string; zip: string }

// matchedAddress is "717 SCHOOL ST, PAWTUCKET, RI, 02860" (number street, city, state, zip). Used when addressComponents are absent.
function parseMatched(addr: string): { city?: string; state?: string; zip?: string } {
  const parts = addr.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) return {};
  const [city, state, zip] = parts.slice(1, 4);
  return { city, state: /^[A-Za-z]{2}$/.test(state ?? '') ? state : undefined, zip: /^\d{5}/.test(zip ?? '') ? zip.slice(0, 5) : undefined };
}

export function censusMatchAgrees(m: CensusMatch | undefined, req: GeocodeRequest): boolean {
  if (!m || !m.matchedAddress || !m.coordinates) return false;
  if (!Number.isFinite(m.coordinates.x) || !Number.isFinite(m.coordinates.y)) return false;
  const want = req.street.trim().split(/\s+/)[0];
  if (!want || m.matchedAddress.split(/\s+/)[0] !== want) return false;
  const ac = m.addressComponents && (m.addressComponents.state || m.addressComponents.city || m.addressComponents.zip)
    ? m.addressComponents : parseMatched(m.matchedAddress);
  // State is always required. Of city and zip, every one we asked for must be present in the match and agree.
  if (!ac.state || ac.state.toUpperCase() !== req.state.toUpperCase()) return false;
  const zip5 = req.zip.trim().slice(0, 5);
  if (zip5 && (!ac.zip || ac.zip.slice(0, 5) !== zip5)) return false;
  if (req.city.trim() && (!ac.city || ac.city.trim().toUpperCase() !== req.city.trim().toUpperCase())) return false;
  return true;
}
