// Federation membership cards (035). An athlete keeps a photo of each card on their account with the expiry date
// typed in; promoters see "USS, expires 2027-03-01, card on file" on the Registrations tab. The image is the evidence
// and the date is self-declared: no issuer offers a lookup we can trust, and the UI never claims verification.
import type { SupabaseClient } from '@supabase/supabase-js';

export const CARD_BUCKET = 'membership-cards';
export const CARD_MAX_BYTES = 5 * 1024 * 1024;
export const MAX_CARDS = 6;
export const FEDERATION_OTHER_MAX = 60;
export const MEMBER_NUMBER_MAX = 40;
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export type FederationId = 'strongman_corporation' | 'united_states_strongman' | 'other';
export const FEDERATIONS: ReadonlyArray<{ id: FederationId; label: string; short: string }> = [
  { id: 'strongman_corporation', label: 'Strongman Corporation', short: 'Strongman Corp' },
  { id: 'united_states_strongman', label: 'United States Strongman', short: 'USS' },
  { id: 'other', label: 'Other federation', short: 'Other' },
];

export interface MembershipCard {
  id: string;
  userId: string;
  federation: FederationId;
  federationOther: string | null;
  memberNumber: string | null;
  expiresOn: string;      // YYYY-MM-DD
  imagePath: string;      // <uid>/card-<ts>.<ext> in the private bucket
  createdAt: string;
}

export interface MembershipCardRow {
  id: string; user_id: string; federation: string; federation_other: string | null; member_number: string | null;
  expires_on: string; image_path: string; created_at?: string;
}

export interface CardDraft { federation: FederationId; federationOther: string; memberNumber: string; expiresOn: string }

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isFederationId(v: unknown): v is FederationId {
  return FEDERATIONS.some((f) => f.id === v);
}

export function federationLabel(card: Pick<MembershipCard, 'federation' | 'federationOther'>, form: 'label' | 'short' = 'label'): string {
  if (card.federation === 'other') return (card.federationOther ?? '').trim() || 'Other federation';
  const f = FEDERATIONS.find((x) => x.id === card.federation);
  return f ? f[form] : card.federation;
}

export function rowToCard(r: MembershipCardRow): MembershipCard {
  return {
    id: r.id,
    userId: r.user_id,
    federation: isFederationId(r.federation) ? r.federation : 'other',
    federationOther: r.federation_other ?? null,
    memberNumber: r.member_number ?? null,
    expiresOn: String(r.expires_on).slice(0, 10),
    imagePath: r.image_path,
    createdAt: r.created_at ?? '',
  };
}

// Register nudge: a listing federation that names a sanctioning body. Empty or unsanctioned shows never nudge.
export function showWantsMembershipCard(federation: string | null | undefined): boolean {
  const f = (federation ?? '').trim();
  return f.length > 0 && !/unsanctioned/i.test(f);
}

// 'expired' past the date, 'expiring' inside 30 days, else 'valid'. `today` is YYYY-MM-DD.
export function cardStatus(expiresOn: string, today: string): 'valid' | 'expiring' | 'expired' {
  if (!ISO_DATE.test(expiresOn) || !ISO_DATE.test(today)) return 'valid';
  if (expiresOn < today) return 'expired';
  const days = Math.round((Date.parse(expiresOn + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
  return days <= 30 ? 'expiring' : 'valid';
}

export function cardStatusLabel(status: ReturnType<typeof cardStatus>, expiresOn: string): string {
  if (status === 'expired') return `Expired ${expiresOn}`;
  if (status === 'expiring') return `Expires ${expiresOn} (soon)`;
  return `Expires ${expiresOn}`;
}

export function cardExt(mime: string): string | null {
  return EXT[mime.toLowerCase()] ?? null;
}

// Why a file cannot be used, or null. Mirrors the bucket limits so the user hears it before the upload.
export function cardFileProblem(file: { type: string; size: number }): string | null {
  if (!cardExt(file.type)) return 'Use a JPG, PNG, or WebP photo of the card.';
  if (file.size > CARD_MAX_BYTES) return 'Card photos need to be under 5 MB.';
  return null;
}

// Why a draft cannot be saved, or null. `today` is YYYY-MM-DD.
export function cardDraftProblem(d: CardDraft, today: string): string | null {
  if (!isFederationId(d.federation)) return 'Pick a federation.';
  const other = d.federationOther.trim();
  if (d.federation === 'other' && !other) return 'Name the federation.';
  if (other.length > FEDERATION_OTHER_MAX) return `Federation name must be ${FEDERATION_OTHER_MAX} characters or fewer.`;
  if (d.memberNumber.trim().length > MEMBER_NUMBER_MAX) return `Member number must be ${MEMBER_NUMBER_MAX} characters or fewer.`;
  if (!ISO_DATE.test(d.expiresOn) || Number.isNaN(Date.parse(d.expiresOn + 'T00:00:00Z'))) return 'Enter the expiry date on the card.';
  if (d.expiresOn < today) return 'That card has already expired. Enter the date from a current card.';
  if (d.expiresOn > `${Number(today.slice(0, 4)) + 10}-12-31`) return 'Expiry date looks too far out; check the year.';
  return null;
}

export function cardObjectPath(userId: string, mime: string, now = Date.now()): string {
  return `${userId}/card-${now}.${cardExt(mime) ?? 'jpg'}`;
}

export function draftToInsert(userId: string, d: CardDraft, imagePath: string): Omit<MembershipCardRow, 'id' | 'created_at'> {
  return {
    user_id: userId,
    federation: d.federation,
    federation_other: d.federation === 'other' ? d.federationOther.trim() : null,
    member_number: d.memberNumber.trim() || null,
    expires_on: d.expiresOn,
    image_path: imagePath,
  };
}

export async function listMyCards(sb: SupabaseClient, userId: string): Promise<MembershipCard[]> {
  const { data, error } = await sb.from('membership_cards').select('*').eq('user_id', userId).order('expires_on', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as MembershipCardRow[]).map(rowToCard);
}

// Upload first, then insert the row; if the insert fails the orphaned object is removed best effort (same order as
// avatars, Astra P-H1): nothing ever points at a missing object.
export async function addCard(sb: SupabaseClient, userId: string, draft: CardDraft, file: File, today: string): Promise<MembershipCard> {
  const problem = cardDraftProblem(draft, today) ?? cardFileProblem(file);
  if (problem) throw new Error(problem);
  const path = cardObjectPath(userId, file.type);
  const up = await sb.storage.from(CARD_BUCKET).upload(path, file, { contentType: file.type, upsert: false, cacheControl: '3600' });
  if (up.error) throw new Error(up.error.message);
  const { data, error } = await sb.from('membership_cards').insert(draftToInsert(userId, draft, path)).select('*').single();
  if (error || !data) {
    await sb.storage.from(CARD_BUCKET).remove([path]).catch(() => undefined);
    throw new Error(error?.message ?? 'The card could not be saved.');
  }
  return rowToCard(data as MembershipCardRow);
}

// Row first, then the object: a leftover object with no row is harmless and owner-deletable; a row pointing at a
// deleted object would show a broken card.
export async function deleteCard(sb: SupabaseClient, card: MembershipCard): Promise<void> {
  const { error } = await sb.from('membership_cards').delete().eq('id', card.id);
  if (error) throw new Error(error.message);
  await sb.storage.from(CARD_BUCKET).remove([card.imagePath]).catch(() => undefined);
}

// Short-lived link to the private image. Storage RLS (zt_can_view_cards) decides who may mint one.
export async function cardImageUrl(sb: SupabaseClient, imagePath: string, seconds = 300): Promise<string> {
  const { data, error } = await sb.storage.from(CARD_BUCKET).createSignedUrl(imagePath, seconds);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'Could not open the card.');
  return data.signedUrl;
}

// Open the card in a new tab. The tab is opened synchronously (inside the click) so popup blockers let it through,
// then pointed at the signed URL once it arrives. Rejects with the storage error; the caller shows it.
export async function openCardInNewTab(sb: SupabaseClient, imagePath: string): Promise<void> {
  const tab = typeof window === 'undefined' ? null : window.open('about:blank', '_blank');
  if (tab) tab.opener = null;
  try {
    const url = await cardImageUrl(sb, imagePath);
    if (tab) tab.location.href = url;
    else if (typeof window !== 'undefined') window.location.assign(url);
  } catch (e) {
    tab?.close();
    throw e;
  }
}

// Promoter side: cards of a meet's live registrants, keyed by registration id (zt_registration_cards).
export interface RegistrationCardRow extends MembershipCardRow { registration_id: string }
export async function fetchRegistrationCards(sb: SupabaseClient, meetId: string): Promise<Record<string, MembershipCard[]>> {
  const { data, error } = await sb.rpc('zt_registration_cards', { p_meet_id: meetId });
  if (error) throw new Error(error.message);
  return groupRegistrationCards((data ?? []) as RegistrationCardRow[]);
}
export function groupRegistrationCards(rows: RegistrationCardRow[]): Record<string, MembershipCard[]> {
  const out: Record<string, MembershipCard[]> = {};
  for (const r of rows) {
    const card = rowToCard({ ...r, user_id: r.user_id ?? '' });
    (out[r.registration_id] ??= []).push(card);
  }
  return out;
}
