'use client';

import React, { useEffect, useState } from 'react';
import { DEFAULT_THEME_ID, DAYLIGHT_THEME_ID, isLightTheme } from '@/lib/constants';
import { useTheme } from '@/hooks/useTheme';
import { themeBaseId, themeCssVars, type ZtTheme } from '@/lib/website/theme';
import WebsiteThemeControls from './WebsiteThemeControls';

// Client frame around the (server-rendered) website shell, and since MS-12 (10/26) around the root splash, Join
// and the public board too. Owns the theme: same localStorage prefs as the scorer (useTheme), so a promoter who
// picked "Power Plant Volt" on the phone sees it everywhere. First paint uses the default theme to match the server
// HTML; the saved theme applies right after mount. `override` (the board's ?theme=) wins until the user touches the
// controls, at which point `onUserChange` lets the host drop it.
// `brand` (030, colour ways): a gym's or a show's own colours. Known on the server, so it paints from the first byte
// on /gyms/<slug> and /shows/<slug>; on the board it arrives with the meet. ?theme= still beats it (a TV link pins a
// theme on purpose); touching the controls drops it for this visit, the same as an override.
export default function WebsiteThemeFrame({ children, className = '', override = null, onUserChange, brand = null }: {
  children: React.ReactNode; className?: string; override?: string | null; onUserChange?: () => void; brand?: ZtTheme | null;
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
  return (
    <div data-zt-theme={shown} style={style} className={`min-h-screen bg-zt-bg text-zt-text font-sans flex flex-col ${className}`}>
      <WebsiteThemeControls.Provider value={{ themeId: shown, isDaylight, selectTheme, toggleDaylight, mounted }}>
        {children}
      </WebsiteThemeControls.Provider>
    </div>
  );
}
