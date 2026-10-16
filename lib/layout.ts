export type LayoutMode = 'phone' | 'tv';
export const LAYOUT_STORAGE_KEY = 'ZEROTACKY_LAYOUT_V1';
export const LAYOUT_QUERY_KEY = 'layout';

export interface Viewport { width: number; height: number }
type StorageLike = Pick<Storage, 'getItem'>;

export function isLayoutMode(v: unknown): v is LayoutMode {
  return v === 'phone' || v === 'tv';
}

// A landscape screen at least 1024 px wide is treated as a TV / projector / laptop; everything else is a phone.
export function autoLayout(vp: Viewport): LayoutMode {
  return vp.width >= 1024 && vp.width > vp.height ? 'tv' : 'phone';
}

// Precedence: ?layout=tv|phone in the URL (so a TV bookmark is explicit), then the user's last toggle on this
// device, then the viewport. Bad values fall through to the next source.
export function resolveLayout(search: string, storage: StorageLike | null, vp: Viewport): LayoutMode {
  const q = new URLSearchParams(search).get(LAYOUT_QUERY_KEY);
  if (isLayoutMode(q)) return q;
  try {
    const saved = storage?.getItem(LAYOUT_STORAGE_KEY);
    if (isLayoutMode(saved)) return saved;
  } catch { /* storage blocked */ }
  return autoLayout(vp);
}

export function otherLayout(m: LayoutMode): LayoutMode {
  return m === 'tv' ? 'phone' : 'tv';
}
