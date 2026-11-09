// 052 ownership invites (Kurt 11/9): a single-use link that makes whoever opens it the owner of a gym listing or a
// meet, with no claim form and no review. Admins mint gym (and any meet) invites; a meet's owner mints its own.
// Shapes mirror zt_invite_json / zt_invite_preview.
import type { SupabaseClient } from '@supabase/supabase-js';

export type InviteKind = 'gym' | 'meet';
export type InviteStatus = 'open' | 'expired' | 'redeemed' | 'revoked';
export interface InviteParty { username: string | null; displayName: string | null }
export interface InviteTarget { name: string; slug: string; owned: boolean; place?: string | null; date?: string | null; athletes?: number }
export interface Invite {
  id: string;
  token: string;
  kind: InviteKind;
  targetId: string;
  label: string | null;
  status: InviteStatus;
  createdAt: string;
  expiresAt: string;
  redeemedAt: string | null;
  target: InviteTarget | null;
  redeemedBy: InviteParty | null;
}
export interface InvitePreview {
  status: InviteStatus | 'unknown';
  kind?: InviteKind;
  expiresAt?: string;
  target?: InviteTarget | null;
  from?: InviteParty | null;
  isCreator?: boolean;
  isMine?: boolean;
}
export interface RedeemResult { kind: InviteKind; targetId: string; target: InviteTarget | null; already: boolean }

export const INVITE_STATUS_LABEL: Record<InviteStatus, string> = {
  open: 'Not used yet',
  expired: 'Expired',
  redeemed: 'Accepted',
  revoked: 'Withdrawn',
};

export function invitePath(token: string): string { return `/invite/${encodeURIComponent(token)}`; }

/** Absolute link to copy and send; `origin` defaults to the current page's origin in the browser. */
export function inviteUrl(token: string, origin?: string): string {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}${invitePath(token)}`;
}

export function inviteKindNoun(kind: InviteKind): string { return kind === 'gym' ? 'gym listing' : 'meet'; }

/** Where the new owner lands after accepting. */
export function afterRedeemHref(kind: InviteKind, targetId?: string | null): string {
  if (kind === 'gym') return '/website/account/gym';
  return targetId ? `/promoter/${encodeURIComponent(targetId)}` : '/promoter';
}

export function inviterLabel(p: InviteParty | null | undefined): string {
  if (!p) return 'A ZeroTacky promoter';
  if (p.displayName) return p.displayName;
  return p.username ? `@${p.username}` : 'A ZeroTacky promoter';
}

/** Days left on an open invite, floored at 0. */
export function daysLeft(expiresAt: string, now: Date = new Date()): number {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/** Plain-English headline for the invite page. */
export function previewHeadline(p: InvitePreview): string {
  if (p.status === 'unknown') return 'This invite link is not valid.';
  if (p.status === 'expired') return 'This invite has expired.';
  if (p.status === 'revoked') return 'This invite was withdrawn.';
  if (p.status === 'redeemed') return p.isMine ? 'You already accepted this invite.' : 'This invite has already been used.';
  const what = p.target?.name ?? (p.kind ? `a ${inviteKindNoun(p.kind)}` : 'something');
  return `${inviterLabel(p.from)} wants you to own ${what} on ZeroTacky.`;
}

function rpcErr(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

export async function createInvite(sb: SupabaseClient, kind: InviteKind, targetId: string, label?: string): Promise<Invite> {
  const { data, error } = await sb.rpc('zt_create_invite', { p_kind: kind, p_target: targetId, p_label: label?.trim() || null });
  if (error) throw new Error(rpcErr(error));
  return data as Invite;
}
export async function revokeInvite(sb: SupabaseClient, id: string): Promise<Invite> {
  const { data, error } = await sb.rpc('zt_revoke_invite', { p_id: id });
  if (error) throw new Error(rpcErr(error));
  return data as Invite;
}
export async function listInvites(sb: SupabaseClient, kind: InviteKind, targetId: string): Promise<Invite[]> {
  const { data, error } = await sb.rpc('zt_list_invites', { p_kind: kind, p_target: targetId });
  if (error) throw new Error(rpcErr(error));
  return (data ?? []) as Invite[];
}
export async function previewInvite(sb: SupabaseClient, token: string): Promise<InvitePreview> {
  const { data, error } = await sb.rpc('zt_invite_preview', { p_token: token });
  if (error) throw new Error(rpcErr(error));
  return (data ?? { status: 'unknown' }) as InvitePreview;
}
export async function redeemInvite(sb: SupabaseClient, token: string): Promise<RedeemResult> {
  const { data, error } = await sb.rpc('zt_redeem_invite', { p_token: token });
  if (error) throw new Error(rpcErr(error));
  return data as RedeemResult;
}
