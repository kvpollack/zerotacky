// 051 meet transfers (Kurt 11/9): request/accept handoff of a meet to another account by @username. The sender stays
// on the meet as an admin member after acceptance. Thin wrappers over the RPCs; shapes mirror zt_transfer_json.
import type { SupabaseClient } from '@supabase/supabase-js';

export type TransferStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';
export interface TransferParty { username: string | null; displayName: string | null }
export interface MeetTransfer {
  id: string;
  meetId: string;
  status: TransferStatus;
  createdAt: string;
  decidedAt: string | null;
  meet: { name: string; slug: string; date: string | null; athletes: number } | null;
  from: TransferParty | null;
  to: TransferParty | null;
  mine: boolean;
  forMe: boolean;
}
export interface MyTransfers { incoming: MeetTransfer[]; outgoing: MeetTransfer[]; settled: MeetTransfer[] }
export interface TransferState { isOwner: boolean; owner: TransferParty | null; pending: MeetTransfer | null }

export const TRANSFER_STATUS_LABEL: Record<TransferStatus, string> = {
  pending: 'Waiting on their answer',
  accepted: 'Accepted',
  declined: 'Declined',
  cancelled: 'Cancelled',
};

export function partyLabel(p: TransferParty | null | undefined): string {
  if (!p) return 'an account';
  if (p.username && p.displayName) return `${p.displayName} (@${p.username})`;
  return p.username ? `@${p.username}` : p.displayName ?? 'an account';
}

/** "@Jess_Test " -> "jess_test"; empty when nothing usable was typed. */
export function cleanTransferUsername(raw: string): string {
  return raw.trim().replace(/^@/, '').toLowerCase();
}

function rpcErr(e: unknown): string {
  return e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e);
}

export async function fetchTransferState(sb: SupabaseClient, meetId: string): Promise<TransferState | null> {
  const { data, error } = await sb.rpc('zt_meet_transfer_state', { p_meet_id: meetId });
  if (error) throw new Error(rpcErr(error));
  return (data as TransferState | null) ?? null;
}
export async function requestTransfer(sb: SupabaseClient, meetId: string, username: string): Promise<MeetTransfer> {
  const { data, error } = await sb.rpc('zt_request_meet_transfer', { p_meet_id: meetId, p_username: cleanTransferUsername(username) });
  if (error) throw new Error(rpcErr(error));
  return data as MeetTransfer;
}
export async function cancelTransfer(sb: SupabaseClient, id: string): Promise<MeetTransfer> {
  const { data, error } = await sb.rpc('zt_cancel_meet_transfer', { p_id: id });
  if (error) throw new Error(rpcErr(error));
  return data as MeetTransfer;
}
export async function respondTransfer(sb: SupabaseClient, id: string, accept: boolean): Promise<MeetTransfer> {
  const { data, error } = await sb.rpc('zt_respond_meet_transfer', { p_id: id, p_accept: accept });
  if (error) throw new Error(rpcErr(error));
  return data as MeetTransfer;
}
export async function fetchMyTransfers(sb: SupabaseClient): Promise<MyTransfers> {
  const { data, error } = await sb.rpc('zt_my_meet_transfers');
  if (error) throw new Error(rpcErr(error));
  const d = (data ?? {}) as Partial<MyTransfers>;
  return { incoming: d.incoming ?? [], outgoing: d.outgoing ?? [], settled: d.settled ?? [] };
}
