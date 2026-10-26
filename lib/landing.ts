import { STORAGE_KEY, ROLE_STORAGE_KEY } from '@/lib/constants';
import { LINK_KEY, readLink, writeLink } from '@/lib/sync/controller';
import type { SyncClient } from '@/lib/sync/client';

type StorageLike = Pick<Storage, 'getItem'>;

// A meet in one of these states is over for this phone: nothing to resume.
export function meetIsOver(status: string | null | undefined): boolean {
  return status === 'completed' || status === 'cancelled';
}

export interface ResumeInfo {
  meetName: string;
  roleLabel: string;   // Promoter | Judge | Pit crew | Spectator | Offline meet
}

const ROLE_LABELS: Record<string, string> = { admin: 'Promoter', judge: 'Judge', pitcrew: 'Pit crew', spectator: 'Spectator' };

// What the root splash shows above its two buttons when this phone already carries a meet:
// a live sync link (judge/pit crew/spectator joined, or the promoter published), or an offline
// meet the promoter has started building (athletes or results on the phone). A phone that only
// opened the scorer once and holds the default demo state gets nothing, so the splash stays clean.
// A linked meet the server has marked completed or cancelled (status cached on the link by the last pull, or
// by refreshResumeStatus below) also gets nothing: Resume is for meet day, not the week after.
export function readResume(storage: StorageLike): ResumeInfo | null {
  try {
    const state = JSON.parse(storage.getItem(STORAGE_KEY) || 'null');
    const meetName: string = typeof state?.meet?.name === 'string' && state.meet.name.trim() ? state.meet.name.trim() : '';
    const link = JSON.parse(storage.getItem(LINK_KEY) || 'null');
    const linked = !!(link && typeof link.meetId === 'string' && typeof link.joinCode === 'string');
    if (linked && meetIsOver(link.competitionStatus)) return null;
    const hasWork = (state?.athletes?.length ?? 0) > 0 || (state?.results?.length ?? 0) > 0;
    if (!linked && !(hasWork && !state?.meet?.isDemo)) return null;
    const role = storage.getItem(ROLE_STORAGE_KEY) || (linked ? link.role : '') || '';
    const roleLabel = ROLE_LABELS[role] || (linked ? 'Linked meet' : 'Offline meet');
    return { meetName: meetName || 'Untitled meet', roleLabel };
  } catch {
    return null;
  }
}

// The promoter usually finalizes from the website, so the scorer on this phone may never pull again and the
// cached status stays stale. The splash asks the server once per visit: when the linked meet is over, the
// status is written onto the link (so readResume is null next time) and true comes back so the card can go now.
// Network or RLS failures resolve false and leave the card alone.
export async function refreshResumeStatus(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, client: SyncClient): Promise<boolean> {
  const link = readLink(storage);
  if (!link) return false;
  try {
    const rows = await client.select<{ competition_status: string | null }>('meets', `id=eq.${link.meetId}&select=competition_status&limit=1`);
    const status = rows[0]?.competition_status ?? null;
    if (rows.length && status !== (link.competitionStatus ?? null)) writeLink(storage, { ...link, competitionStatus: status });
    return meetIsOver(status);
  } catch {
    return false;
  }
}
