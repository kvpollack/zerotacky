'use client';

import { useCallback, useEffect, useState } from 'react';
import { LAYOUT_STORAGE_KEY, otherLayout, resolveLayout } from '@/lib/layout';

// Phone vs TV layout for the leaderboard and pit crew screens. Starts as 'phone' during SSR, resolves on
// mount (URL > saved toggle > viewport). The toggle persists per device so a projector laptop stays in TV mode.
export default function useLayoutMode() {
  const [layout, setLayout] = useState('phone');
  useEffect(() => {
    setLayout(resolveLayout(window.location.search, localStorage, { width: window.innerWidth, height: window.innerHeight }));
  }, []);
  const toggleLayout = useCallback(() => {
    setLayout((m) => {
      const next = otherLayout(m);
      try { localStorage.setItem(LAYOUT_STORAGE_KEY, next); } catch { /* ignore */ }
      return next;
    });
  }, []);
  return [layout, toggleLayout];
}
