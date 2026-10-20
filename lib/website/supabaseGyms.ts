// Maps `gyms` rows (015_gyms.sql) to the website's StrongmanGymListing so GymsBrowser, the filters and the detail
// page keep working unchanged. Rows come from the Argon collection rounds (page-verified) and start `unclaimed`.

import { GYM_EQUIPMENT } from './gymEquipment';
import type { DayPassAvailability, GymEquipmentItem, StrongmanGymListing } from './types';

export const PUBLIC_GYM_COLS =
  'id,slug,name,status,gym_type,street_address,city,state,zip,lat,lng,website_url,phone,instagram,contact,' +
  'day_pass_availability,day_pass_price,day_pass_url,drop_in_policy,drop_in_hours,equipment,equipment_notes,' +
  'source_url,confidence,last_verified,updated_at';

export interface GymRow {
  id: string;
  slug: string;
  name: string;
  status: 'unclaimed' | 'claimed' | 'removed';
  gym_type: 'strongman' | 'powerlifting' | 'mixed';
  street_address: string;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
  website_url: string;
  phone: string;
  instagram: string;
  contact: string;
  day_pass_availability: DayPassAvailability;
  day_pass_price: string;
  day_pass_url: string;
  drop_in_policy: string;
  drop_in_hours: string;
  equipment: string[] | null;
  equipment_notes: Record<string, string> | null;
  source_url: string;
  confidence: 'high' | 'medium' | 'low';
  last_verified: string | null;
  updated_at: string | null;
}

const LABEL_BY_ID = new Map(GYM_EQUIPMENT.map((e) => [e.id, e.label]));
const POWERLIFTING_IDS = new Set(['comp_bars', 'calibrated_plates', 'monolift', 'combo_rack', 'deadlift_platform']);

export function equipmentLabel(id: string): string {
  return LABEL_BY_ID.get(id) ?? id.replace(/_/g, ' ');
}

function toEquipmentItems(ids: string[], notes: Record<string, string>): GymEquipmentItem[] {
  return ids.map((id) => ({
    name: equipmentLabel(id),
    category: POWERLIFTING_IDS.has(id) ? 'Powerlifting' : 'Strongman',
    ...(notes[id] ? { details: notes[id] } : {}),
  }));
}

function contactLine(row: GymRow): string | undefined {
  const parts = [row.phone.trim(), row.instagram.trim() ? `@${row.instagram.trim().replace(/^@/, '')}` : '', row.contact.trim()].filter(Boolean);
  return parts.length ? parts.join(' • ') : undefined;
}

export function mapGymRowToListing(row: GymRow): StrongmanGymListing {
  const ids = Array.isArray(row.equipment) ? row.equipment.filter((e) => typeof e === 'string' && e) : [];
  const notes = row.equipment_notes && typeof row.equipment_notes === 'object' ? row.equipment_notes : {};
  const street = row.street_address.trim() || undefined;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    city: row.city,
    state: row.state,
    ...(street ? { streetAddress: street } : {}),
    ...(row.zip ? { postalCode: row.zip } : {}),
    ...(row.website_url ? { websiteUrl: row.website_url } : {}),
    ...(contactLine(row) ? { contactInfo: contactLine(row) } : {}),
    dayPassAvailability: row.day_pass_availability,
    ...(row.day_pass_price ? { dayPassPriceDisplay: row.day_pass_price } : {}),
    ...(row.day_pass_url ? { dayPassBookingUrl: row.day_pass_url } : {}),
    ...(row.drop_in_policy ? { dropInPolicy: row.drop_in_policy } : {}),
    ...(row.drop_in_hours ? { dropInHours: row.drop_in_hours } : {}),
    implementTags: ids.map(equipmentLabel),
    equipment: toEquipmentItems(ids, notes),
    ...(typeof row.lat === 'number' && typeof row.lng === 'number' ? { lat: row.lat, lng: row.lng } : {}),
    hostedShowSlugs: [],
    lastUpdatedDate: row.last_verified ?? (row.updated_at ?? '').slice(0, 10) ?? 'Not provided',
    isDemoListing: false,
    gymType: row.gym_type,
    claimStatus: row.status === 'claimed' ? 'claimed' : 'unclaimed',
    ...(row.source_url ? { sourceUrl: row.source_url } : {}),
    confidence: row.confidence,
  };
}

// Default order with no zip filter: the fullest listings first (claimed, then most equipment, then confidence), so the
// first screen is not two address-only rows from Alabama. With a zip the browser re-sorts by distance anyway.
const CONF_RANK = { high: 0, medium: 1, low: 2 } as const;
export function sortListingsForDisplay(list: StrongmanGymListing[]): StrongmanGymListing[] {
  return [...list].sort((a, b) => {
    const ca = a.claimStatus === 'claimed' ? 0 : 1, cb = b.claimStatus === 'claimed' ? 0 : 1;
    if (ca !== cb) return ca - cb;
    if (b.implementTags.length !== a.implementTags.length) return b.implementTags.length - a.implementTags.length;
    const ra = CONF_RANK[a.confidence ?? 'medium'], rb = CONF_RANK[b.confidence ?? 'medium'];
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });
}
