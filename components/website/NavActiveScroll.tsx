'use client';

import { useEffect } from 'react';

// LT-07 (Astra 10/26): on phones the primary nav is one scrolling row, so the active item (Account is 6th) can start
// off-screen. Bring it into view inside the row only: scrollLeft on the nav, never a page scroll. Runs on mount and
// whenever the active id changes; harmless on wide screens where the row does not scroll.
export default function NavActiveScroll({ navId, active }: { navId: string; active?: string }) {
  useEffect(() => {
    const nav = document.getElementById(navId);
    if (!nav || nav.scrollWidth <= nav.clientWidth) return;
    const el = nav.querySelector<HTMLElement>('[aria-current="page"]');
    if (!el) return;
    const left = el.offsetLeft - nav.offsetLeft;
    const target = Math.max(0, Math.min(left - (nav.clientWidth - el.offsetWidth) / 2, nav.scrollWidth - nav.clientWidth));
    nav.scrollTo({ left: target, behavior: 'auto' });
  }, [navId, active]);
  return null;
}
