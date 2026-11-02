'use client';

import React, { useEffect, useState } from 'react';
import { DEFAULT_THEME_ID, DAYLIGHT_THEME_ID, isLightTheme } from '@/lib/constants';
import { useTheme } from '@/hooks/useTheme';
import { themeBaseId, themeCssVars, type ZtTheme } from '@/lib/website/theme';
import WebsiteThemeControls from './WebsiteThemeControls';
import { SheetModeProvider } from './SheetMode';
import { resolveAccent } from '@/lib/theme/promoter';

// Client frame around the (server-rendered) website shell, and since MS-12 (10/26) around the root splash, Join
// and the public board too. Owns the theme: same localStorage prefs as the scorer (useTheme), so a promoter who
// picked "Power Plant Volt" on the phone sees it everywhere. First paint uses the default theme to match the server
// HTML; the saved theme applies right after mount. `override` (the board's ?theme=) wins until the user touches the
// controls, at which point `onUserChange` lets the host drop it.
// `brand` (030, colour ways): a gym's or a show's own colours. Known on the server, so it paints from the first byte
// on /gyms/<slug> and /shows/<slug>; on the board it arrives with the meet. ?theme= still beats it (a TV link pins a
// theme on purpose); touching the controls drops it for this visit, the same as an override.
// `sheet` (UI transition Phase 3, 11/2): the public website paints with the sheet tokens (grey ground, ink, pen) in
// its own bright/dark mode (SheetMode), not with the scorer's theme. `data-zt-theme` stays on the frame so legacy
// zt-* classes inside still resolve, and the globals.css bridge maps them onto the sheet tokens. A brand only reaches
// the promoter slots here (`--accent`, via resolveAccent), never the whole page.
export default function WebsiteThemeFrame({ children, className = '', override = null, onUserChange, brand = null, sheet = false }: {
  children: React.ReactNode; className?: string; override?: string | null; onUserChange?: () => void; brand?: ZtTheme | null; sheet?: boolean;
}) {
  const { themeId, selectTheme: pick, toggleDaylight: toggle } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [brandDropped, setBrandDropped] = useState(false);
  useEffect(() => setMounted(true), []);
  const activeBrand = !override && !brandDropped && brand ? brand : null;
  const pinned = override ?? (activeBrand ? themeBaseId(activeBrand) : null);
  const shown = pinned ?? (mounted ? themeId : DEFAULT_THEME_ID);
  // LT-03 (Astra 10/26): the Sun/Moon button must follow `shown`, not the saved preference, or a saved light theme
  // renders a Moon on the first client paint against the server's Sun (React 418 on / and /join).
  const isDaylight = isLightTheme(shown);
  const leave = () => { onUserChange?.(); setBrandDropped(true); };
  const selectTheme = (id: string) => { leave(); pick(id); };
  const toggleDaylight = () => {
    leave();
    // leaving a ?theme= override or a brand: flip relative to what is on screen, not to a hidden preference
    if (pinned) pick(isLightTheme(pinned) ? DEFAULT_THEME_ID : DAYLIGHT_THEME_ID); else toggle();
  };
  const style = activeBrand ? (themeCssVars(activeBrand) as React.CSSProperties) : undefined;
  const controls = { themeId: shown, isDaylight, selectTheme, toggleDaylight, mounted };
  if (sheet) {
    return (
      <SheetModeProvider
        render={({ mode }) => {
          const acc = brand ? resolveAccent(brand.primary, mode) : null;
          const slot = acc ? ({ '--accent': acc.accent, '--accent-label': acc.label } as React.CSSProperties) : undefined;
          return (
            <div data-zt-theme={shown} data-zt-mode={mode} data-zt-sheet="" style={slot} className={`min-h-screen bg-ground text-ink font-sans flex flex-col ${className}`}>
              <WebsiteThemeControls.Provider value={controls}>{children}</WebsiteThemeControls.Provider>
            </div>
          );
        }}
      />
    );
  }
  return (
    <div data-zt-theme={shown} style={style} className={`min-h-screen bg-zt-bg text-zt-text font-sans flex flex-col ${className}`}>
      <WebsiteThemeControls.Provider value={controls}>
        {children}
      </WebsiteThemeControls.Provider>
    </div>
  );
}
