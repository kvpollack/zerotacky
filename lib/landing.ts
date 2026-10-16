import { STORAGE_KEY, ROLE_STORAGE_KEY } from '@/lib/constants';
import { LINK_KEY } from '@/lib/sync/controller';

type StorageLike = Pick<Storage, 'getItem'>;

export interface ResumeInfo {
  meetName: string;
  roleLabel: string;   // Promoter | Judge | Pit crew | Spectator | Offline meet
}

const ROLE_LABELS: Record<string, string> = { admin: 'Promoter', judge: 'Judge', pitcrew: 'Pit crew', spectator: 'Spectator' };

// What the root splash shows above its two buttons when this phone already carries a meet:
// a live sync link (judge/pit crew/spectator joined, or the promoter published), or an offline
// meet the promoter has started building (athletes or results on the phone). A phone that only
// opened the scorer once and holds the default demo state gets nothing, so the splash stays clean.
export function readResume(storage: StorageLike): ResumeInfo | null {
  try {
    const state = JSON.parse(storage.getItem(STORAGE_KEY) || 'null');
    const meetName: string = typeof state?.meet?.name === 'string' && state.meet.name.trim() ? state.meet.name.trim() : '';
    const link = JSON.parse(storage.getItem(LINK_KEY) || 'null');
    const linked = !!(link && typeof link.meetId === 'string' && typeof link.joinCode === 'string');
    const hasWork = (state?.athletes?.length ?? 0) > 0 || (state?.results?.length ?? 0) > 0;
    if (!linked && !(hasWork && !state?.meet?.isDemo)) return null;
    const role = storage.getItem(ROLE_STORAGE_KEY) || (linked ? link.role : '') || '';
    const roleLabel = ROLE_LABELS[role] || (linked ? 'Linked meet' : 'Offline meet');
    return { meetName: meetName || 'Untitled meet', roleLabel };
  } catch {
    return null;
  }
}
