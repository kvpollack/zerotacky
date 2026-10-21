'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Moon, Palette, Sun } from 'lucide-react';
import { THEMES } from '@/lib/constants';

interface ThemeCtx {
  themeId: string;
  isDaylight: boolean;
  selectTheme: (id: string) => void;
  toggleDaylight: () => void;
  mounted: boolean;
}
const Ctx = createContext<ThemeCtx | null>(null);

// Header buttons for the public site: bright/dark toggle and a Color scheme popover with every theme.
// Kurt 10/21: renamed from Day/Night + Configure (only one light theme exists, and the popover picks colors).
// Kurt 10/16: "on the website landing page there should be a button at the top to configure as well as the day/night toggle".
export default function WebsiteThemeControls() {
  const ctx = useContext(Ctx);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  if (!ctx) return null;
  const { themeId, isDaylight, selectTheme, toggleDaylight } = ctx;
  // 44 px minimum hit area on touch (Astra MS-05); the popover is fixed to the viewport on phones and scrolls, so no
  // palette can sit off the left edge or below the fold inside the sticky header (MS-01).
  const btn = 'inline-flex items-center justify-center gap-1.5 px-3 min-h-[44px] min-w-[44px] rounded-xl border text-xs font-extrabold uppercase tracking-wide bg-zt-inset text-zt-text-2 border-zt-border hover:border-zt-border-strong hover:text-zt-text';
  return (
    <div ref={wrap} className="relative flex items-center gap-1.5">
      <button type="button" onClick={toggleDaylight} aria-pressed={isDaylight} aria-label={isDaylight ? 'Switch to dark mode' : 'Switch to bright mode'} title={isDaylight ? 'Switch to dark mode' : 'Switch to bright mode'} className={btn}>
        {isDaylight ? <Moon className="w-3.5 h-3.5" aria-hidden="true" /> : <Sun className="w-3.5 h-3.5" aria-hidden="true" />}
      </button>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="dialog" aria-label="Color scheme" title="Color scheme" className={`${btn} ${open ? 'border-zt-primary text-zt-text' : ''}`}>
        <Palette className="w-3.5 h-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">Color scheme</span>
      </button>
      {open && (
        <div role="dialog" aria-label="Color scheme" className="fixed inset-x-3 top-16 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-72 max-h-[70vh] overflow-y-auto bg-zt-surface border border-zt-border rounded-2xl p-3 shadow-2xl z-50 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-zt-muted">Color scheme</span>
            <span className="text-[10px] font-bold text-zt-subtle">{THEMES.find((t) => t.id === themeId)?.name}</span>
          </div>
          <div role="radiogroup" aria-label="Theme" className="grid grid-cols-1 gap-1.5">
            {THEMES.map((t) => {
              const active = t.id === themeId;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => { selectTheme(t.id); setOpen(false); }}
                  className={`p-2 rounded-xl border-2 text-left flex items-center gap-2.5 bg-zt-inset ${active ? 'border-zt-primary' : 'border-zt-border hover:border-zt-border-strong'}`}
                >
                  <span aria-hidden="true" className="w-9 h-9 rounded-lg flex-shrink-0 flex flex-col justify-end gap-1 p-1 border border-black/20" style={{ backgroundColor: t.surface }}>
                    <span className="h-1.5 rounded-full w-full" style={{ backgroundColor: t.primary }} />
                    <span className="h-1.5 rounded-full w-2/3" style={{ backgroundColor: t.secondary }} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-black text-zt-text truncate">{t.name}</span>
                    <span className="block text-[10px] font-bold text-zt-muted leading-tight">{t.tagline}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-zt-muted">Saved on this device; the meet-day scorer uses the same choice.</p>
        </div>
      )}
    </div>
  );
}
WebsiteThemeControls.Provider = Ctx.Provider;
