// Public profile cross-links (029_profile_links.sql, ROADMAP s7 items 3 and 5): the home gym as a directory link,
// the listed shows a promoter runs and the claimed gyms an owner holds. One RPC returns all three for a public
// username; this file is the defensive mapper so a malformed payload renders as "nothing to show" rather than a
// crash. Pure, so the tests hit it directly.

export interface ProfileGymLink {
  slug: string;
  name: string;
  city: string;
  state: string;
  gymType: string;   // 'strongman' | 'powerlifting' | 'mixed' | ''
}

export interface ProfileShowLink {
  slug: string;
  name: string;
  date: string | null;              // ISO date
  competitionStatus: string;        // ShowCompetitionStatus as text: upcoming | live | completed | postponed | cancelled
  registrationStatus: string;
  venue: string;                    // "Erie, PA", "Erie", "PA" or ''
}

export interface ProfileLinks {
  homeGym: ProfileGymLink | null;
  shows: ProfileShowLink[];
  gyms: ProfileGymLink[];
}

export const EMPTY_PROFILE_LINKS: ProfileLinks = { homeGym: null, shows: [], gyms: [] };

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function s(v: unknown, max = 160): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}
function slug(v: unknown): string {
  const x = s(v, 120);
  return SLUG_RE.test(x) ? x : '';
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function venueLine(city: unknown, state: unknown): string {
  return [s(city, 80), s(state, 40)].filter(Boolean).join(', ');
}

function mapGym(v: unknown): ProfileGymLink | null {
  if (!isRecord(v)) return null;
  const sl = slug(v.slug);
  const name = s(v.name, 120);
  if (!sl || !name) return null;
  return { slug: sl, name, city: s(v.city, 80), state: s(v.state, 40), gymType: s(v.gym_type, 20) };
}

function mapShow(v: unknown): ProfileShowLink | null {
  if (!isRecord(v)) return null;
  const sl = slug(v.slug);
  const name = s(v.name, 160);
  if (!sl || !name) return null;
  const date = typeof v.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v.date) ? v.date.slice(0, 10) : null;
  return {
    slug: sl,
    name,
    date,
    competitionStatus: s(v.competition_status, 30),
    registrationStatus: s(v.registration_status, 30),
    venue: venueLine(v.venue_city, v.venue_state),
  };
}

export function mapProfileLinks(raw: unknown): ProfileLinks {
  if (!isRecord(raw)) return EMPTY_PROFILE_LINKS;
  const shows = Array.isArray(raw.shows) ? raw.shows.map(mapShow).filter((x): x is ProfileShowLink => x !== null) : [];
  const gyms = Array.isArray(raw.gyms) ? raw.gyms.map(mapGym).filter((x): x is ProfileGymLink => x !== null) : [];
  return { homeGym: mapGym(raw.home_gym), shows, gyms };
}

// Upcoming first (soonest at the top), then past shows newest first; the RPC orders by date desc so this only
// splits the list. `today` is injectable for tests.
export function splitShows(shows: ProfileShowLink[], today = new Date().toISOString().slice(0, 10)): { upcoming: ProfileShowLink[]; past: ProfileShowLink[] } {
  const upcoming = shows.filter((x) => !['completed', 'cancelled'].includes(x.competitionStatus) && (x.date === null || x.date >= today)).sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
  const past = shows.filter((x) => !upcoming.includes(x));
  return { upcoming, past };
}

export const COMPETITION_STATUS_LABELS: Record<string, string> = {
  upcoming: 'Upcoming',
  live: 'Live',
  completed: 'Completed',
  postponed: 'Postponed',
  cancelled: 'Cancelled',
};
export function competitionStatusLabel(status: string): string {
  return COMPETITION_STATUS_LABELS[status] ?? (status ? status.replace(/_/g, ' ') : '');
}
