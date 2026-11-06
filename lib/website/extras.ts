// Show extras (046, 11/6, feature gaps #12 staff roster, #14 sponsor blocks, #17 livestream link). Pure functions, no
// React; the server mirrors every check (zt_sponsors_ok, zt_staff_ok, zt_https_url_ok in 046). Sponsors and the
// livestream link are public (show page, phone board, TV idle strip); staff is private to the promoter's editor.

export interface MeetSponsor {
  name: string;        // <= 60
  url?: string;        // https://..., <= 300
  logoPath?: string;   // "<uid>/<file>" in the public sponsor-logos bucket
}

export type StaffRole = 'judge' | 'head_judge' | 'state_rep' | 'volunteer' | 'loader' | 'scorer' | 'emcee' | 'medic' | 'other';

export interface MeetStaff {
  name: string;        // <= 60
  role: StaffRole;
  station?: string;    // <= 40: a station id ('A', 'B'; the editor saves ids since MD-15) or, on rows saved before that, a label ('Station 1')
  contact?: string;    // <= 80, phone or email, never printed on a public page
  note?: string;       // <= 160, e.g. 'Arrives 7:00, brings tape measure'
}

export const SPONSORS_MAX = 6;
export const STAFF_MAX = 40;
export const SPONSOR_NAME_MAX = 60;
export const URL_MAX = 300;
export const STAFF_LIMITS = { name: 60, station: 40, contact: 80, note: 160 } as const;
export const SPONSOR_LOGO_BUCKET = 'sponsor-logos';
export const SPONSOR_LOGO_MAX_BYTES = 1024 * 1024;

export const STAFF_ROLES: readonly StaffRole[] = ['head_judge', 'judge', 'state_rep', 'scorer', 'emcee', 'loader', 'medic', 'volunteer', 'other'];
const ROLE_LABEL: Record<StaffRole, string> = {
  head_judge: 'Head judge', judge: 'Judge', state_rep: 'State rep', scorer: 'Scorer', emcee: 'Emcee',
  loader: 'Loader', medic: 'Medic', volunteer: 'Volunteer', other: 'Other',
};
export function staffRoleLabel(role: string | undefined): string {
  return ROLE_LABEL[role as StaffRole] ?? 'Other';
}
export function isStaffRole(v: unknown): v is StaffRole {
  return typeof v === 'string' && (STAFF_ROLES as readonly string[]).includes(v);
}

// MD-17: a hostname with at least one dot (no 'https://?', no localhost); mirrors zt_https_url_ok in 047
const HTTPS = /^https:\/\/[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+(:\d{1,5})?([/?#]\S*)?$/;
const LOGO_PATH = /^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,120}$/;

/** 'https://host.tld/...' within the limit; a bare domain, http:// or a scheme with no host is refused (the server does the same). */
export function httpsUrlOk(v: unknown, max = URL_MAX): v is string {
  if (typeof v !== 'string' || v.length > max || !HTTPS.test(v)) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && u.hostname.includes('.');
  } catch {
    return false;
  }
}

/** Typed text -> saveable link or null (blank). `problem` is set when the text is not an https link. */
export function cleanLivestreamUrl(v: unknown): { url: string | null; problem: string | null } {
  if (typeof v !== 'string' || !v.trim()) return { url: null, problem: null };
  let s = v.trim();
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(s) && !/^[a-z]+:\/\//i.test(s)) s = `https://${s}`;   // 'youtube.com/live/x' -> https
  if (!httpsUrlOk(s)) return { url: null, problem: 'Livestream link must start with https:// (300 characters max).' };
  return { url: s, problem: null };
}

/** Row value (jsonb) -> sponsors, or null when absent or empty. Bad entries are dropped, never thrown. */
export function parseSponsors(v: unknown): MeetSponsor[] | null {
  if (!Array.isArray(v)) return null;
  const out: MeetSponsor[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim().slice(0, SPONSOR_NAME_MAX) : '';
    if (!name) continue;
    const s: MeetSponsor = { name };
    if (httpsUrlOk(o.url)) s.url = o.url;
    if (typeof o.logoPath === 'string' && LOGO_PATH.test(o.logoPath)) s.logoPath = o.logoPath;
    out.push(s);
    if (out.length >= SPONSORS_MAX) break;
  }
  return out.length ? out : null;
}

/** Form rows -> saveable list. Blank rows are dropped; all blank = null (no sponsors). */
export function cleanSponsors(list: Array<Partial<Record<keyof MeetSponsor, unknown>>> | null | undefined):
  { sponsors: MeetSponsor[] | null; problem: string | null } {
  if (!list) return { sponsors: null, problem: null };
  const out: MeetSponsor[] = [];
  for (const [i, raw] of list.entries()) {
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    const urlText = typeof raw.url === 'string' ? raw.url.trim() : '';
    const logoPath = typeof raw.logoPath === 'string' ? raw.logoPath.trim() : '';
    if (!name && !urlText && !logoPath) continue;
    if (!name) return { sponsors: null, problem: `Sponsor ${i + 1} needs a name.` };
    if (name.length > SPONSOR_NAME_MAX) return { sponsors: null, problem: `Sponsor "${name.slice(0, 20)}..." name is over ${SPONSOR_NAME_MAX} characters.` };
    const s: MeetSponsor = { name };
    if (urlText) {
      const u = cleanLivestreamUrl(urlText);
      if (!u.url) return { sponsors: null, problem: `Sponsor "${name}" link must start with https:// (300 characters max).` };
      s.url = u.url;
    }
    if (logoPath) {
      if (!LOGO_PATH.test(logoPath)) return { sponsors: null, problem: `Sponsor "${name}" logo path is not from the logo uploader.` };
      s.logoPath = logoPath;
    }
    out.push(s);
  }
  if (out.length > SPONSORS_MAX) return { sponsors: null, problem: `Up to ${SPONSORS_MAX} sponsors can be shown.` };
  return { sponsors: out.length ? out : null, problem: null };
}

/** Public URL of a logo in the public bucket; '' when no path or no Supabase URL (fixtures). */
export function sponsorLogoUrl(path: string | undefined, baseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL): string {
  if (!path || !baseUrl) return '';
  return `${baseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${SPONSOR_LOGO_BUCKET}/${path}`;
}

const LOGO_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export function sponsorLogoProblem(file: { type: string; size: number }): string | null {
  if (!LOGO_EXT[file.type.toLowerCase()]) return 'Use a JPG, PNG, or WebP logo.';
  if (file.size > SPONSOR_LOGO_MAX_BYTES) return 'Logos need to be under 1 MB.';
  return null;
}
export function sponsorLogoObjectPath(userId: string, mime: string, now = Date.now()): string {
  return `${userId}/logo-${now}.${LOGO_EXT[mime.toLowerCase()] ?? 'png'}`;
}

/** Row value (jsonb) -> staff, or null. Bad rows are dropped, never thrown. */
export function parseStaff(v: unknown): MeetStaff[] | null {
  if (!Array.isArray(v)) return null;
  const out: MeetStaff[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim().slice(0, STAFF_LIMITS.name) : '';
    if (!name || !isStaffRole(o.role)) continue;
    const s: MeetStaff = { name, role: o.role };
    for (const k of ['station', 'contact', 'note'] as const) {
      const t = typeof o[k] === 'string' ? (o[k] as string).trim() : '';
      if (t) s[k] = t.slice(0, STAFF_LIMITS[k]);
    }
    out.push(s);
    if (out.length >= STAFF_MAX) break;
  }
  return out.length ? out : null;
}

/** Form rows -> saveable list. A row with only a role (the default) is dropped; all blank = null. */
export function cleanStaff(list: Array<Partial<Record<keyof MeetStaff, unknown>>> | null | undefined):
  { staff: MeetStaff[] | null; problem: string | null } {
  if (!list) return { staff: null, problem: null };
  const out: MeetStaff[] = [];
  for (const [i, raw] of list.entries()) {
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    const extras = (['station', 'contact', 'note'] as const).map((k) => (typeof raw[k] === 'string' ? (raw[k] as string).trim() : ''));
    if (!name && extras.every((t) => !t)) continue;
    if (!name) return { staff: null, problem: `Staff row ${i + 1} needs a name.` };
    if (name.length > STAFF_LIMITS.name) return { staff: null, problem: `"${name.slice(0, 20)}..." is over ${STAFF_LIMITS.name} characters.` };
    if (!isStaffRole(raw.role)) return { staff: null, problem: `${name} needs a role.` };
    const s: MeetStaff = { name, role: raw.role };
    const keys = ['station', 'contact', 'note'] as const;
    for (const [j, k] of keys.entries()) {
      if (!extras[j]) continue;
      if (extras[j].length > STAFF_LIMITS[k]) return { staff: null, problem: `${name}: ${k} is over ${STAFF_LIMITS[k]} characters.` };
      s[k] = extras[j];
    }
    out.push(s);
  }
  if (out.length > STAFF_MAX) return { staff: null, problem: `Up to ${STAFF_MAX} staff can be listed.` };
  return { staff: out.length ? out : null, problem: null };
}

/** Staff grouped by station for the briefing cards, keyed by station id (MD-15: two stations may share a label, ids are
 *  unique). A row's `station` is matched as an id first, then as a label (rows saved before ids were stored; when two
 *  stations share that label the row goes to the first and is flagged nowhere else, so the editor shows ids). '' = floating. */
export function staffByStation(staff: MeetStaff[] | null | undefined, stations: Array<{ id: string; label: string }>): Array<{ station: string; label: string; people: MeetStaff[] }> {
  const groups = new Map<string, MeetStaff[]>();
  const norm = (s: string) => s.trim().toLowerCase().replace(/^station\s+/, '');
  const byId = new Map(stations.map((s) => [s.id, s] as const));
  const byLabel = new Map<string, string>();
  for (const s of stations) if (!byLabel.has(norm(s.label))) byLabel.set(norm(s.label), s.id);
  for (const p of staff ?? []) {
    const raw = p.station?.trim() ?? '';
    const key = !raw ? '' : byId.has(raw) ? raw : (byLabel.get(norm(raw)) ?? raw);
    const list = groups.get(key) ?? [];
    list.push(p);
    groups.set(key, list);
  }
  const ordered: Array<{ station: string; label: string; people: MeetStaff[] }> = [];
  for (const s of stations) if (groups.has(s.id)) ordered.push({ station: s.id, label: s.label, people: groups.get(s.id)! });
  for (const [k, people] of groups) if (k && !byId.has(k)) ordered.push({ station: k, label: k, people });
  if (groups.has('')) ordered.push({ station: '', label: '', people: groups.get('')! });
  return ordered;
}
