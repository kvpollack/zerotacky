'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import type { Mode } from '@/lib/theme/promoter';

// Website bright/dark (UI transition Phase 3, 11/2). Bright is home; dark is the toggle (Kurt 11/2). Its own
// preference, separate from the scorer's theme id: the public site has two modes and no colour schemes now, while
// the scorer keeps its themes until Phase 5 moves it onto the same sheet tokens. First paint is always home so the
// server HTML and hydration match; the saved mode applies right after mount.
export const SHEET_MODE_KEY = 'zt.sheetMode';

interface SheetModeCtx {
  mode: Mode;
  mounted: boolean;
  setMode: (m: Mode) => void;
  toggle: () => void;
}
const Ctx = createContext<SheetModeCtx | null>(null);

export function useSheetMode(): SheetModeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) return { mode: 'home', mounted: false, setMode: () => {}, toggle: () => {} };
  return ctx;
}

export function SheetModeProvider({ children, render }: { children?: React.ReactNode; render?: (ctx: SheetModeCtx) => React.ReactNode }) {
  const [mode, setModeState] = useState<Mode>('home');
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // ?mode=dark|home pins the mode for this visit (shared links, renders) without touching the saved preference
    const pinned = new URLSearchParams(window.location.search).get('mode');
    if (pinned === 'dark' || pinned === 'home') { setModeState(pinned); setMounted(true); return; }
    try {
      const saved = localStorage.getItem(SHEET_MODE_KEY);
      if (saved === 'dark' || saved === 'home') setModeState(saved);
    } catch { /* no storage: stay bright */ }
    setMounted(true);
  }, []);
  const setMode = (m: Mode) => {
    setModeState(m);
    try { localStorage.setItem(SHEET_MODE_KEY, m); } catch { /* ignore */ }
  };
  const value: SheetModeCtx = { mode, mounted, setMode, toggle: () => setMode(mode === 'home' ? 'dark' : 'home') };
  return <Ctx.Provider value={value}>{render ? render(value) : children}</Ctx.Provider>;
}

// Header cell: "Mode  Bright / Dark", the current one in ink. One button, aria-pressed = dark.
export function ModeToggle({ className = '' }: { className?: string }) {
  const { mode, toggle } = useSheetMode();
  const dark = mode === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      aria-label={dark ? 'Switch to bright mode' : 'Switch to dark mode'}
      title={dark ? 'Switch to bright mode' : 'Switch to dark mode'}
      className={`inline-flex items-center gap-2.5 h-14 px-3.5 2xl:px-[18px] text-[13px] uppercase tracking-[0.04em] text-ink-muted hover:text-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-ink focus-visible:-outline-offset-2 ${className}`}
    >
      {/* phones: the icon of the mode you would switch to; sm and up: "Mode  Bright / Dark" with the current one in ink */}
      <span className="sm:hidden text-ink" aria-hidden="true">{dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}</span>
      <span className="hidden xl:inline">Mode</span>
      <span className={`hidden sm:inline ${dark ? '' : 'font-bold text-ink'}`}>Bright</span>
      <span className="hidden sm:inline" aria-hidden="true">/</span>
      <span className={`hidden sm:inline ${dark ? 'font-bold text-ink' : ''}`}>Dark</span>
    </button>
  );
}
