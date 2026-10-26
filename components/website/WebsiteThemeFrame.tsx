'use client';

import React, { useEffect, useState } from 'react';
import { DEFAULT_THEME_ID, DAYLIGHT_THEME_ID, isLightTheme } from '@/lib/constants';
import { useTheme } from '@/hooks/useTheme';
import WebsiteThemeControls from './WebsiteThemeControls';

// Client frame around the (server-rendered) website shell, and since MS-12 (10/26) around the root splash, Join
// and the public board too. Owns the theme: same localStorage prefs as the scorer (useTheme), so a promoter who
// picked "Power Plant Volt" on the phone sees it everywhere. First paint uses the default theme to match the server
// HTML; the saved theme applies right after mount. `override` (the board's ?theme=) wins until the user touches the
// controls, at which point `onUserChange` lets the host drop it.
export default function WebsiteThemeFrame({ children, className = '', override = null, onUserChange }: {
  children: React.ReactNode; className?: string; override?: string | null; onUserChange?: () => void;
}) {
  const { themeId, selectTheme: pick, toggleDaylight: toggle } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const shown = override ?? (mounted ? themeId : DEFAULT_THEME_ID);
  // LT-03 (Astra 10/26): the Sun/Moon button must follow `shown`, not the saved preference, or a saved light theme
  // renders a Moon on the first client paint against the server's Sun (React 418 on / and /join).
  const isDaylight = isLightTheme(shown);
  const selectTheme = (id: string) => { onUserChange?.(); pick(id); };
  const toggleDaylight = () => {
    onUserChange?.();
    // leaving a ?theme= override: flip relative to what is on screen, not to a hidden preference
    if (override) pick(isLightTheme(override) ? DEFAULT_THEME_ID : DAYLIGHT_THEME_ID); else toggle();
  };
  return (
    <div data-zt-theme={shown} className={`min-h-screen bg-zt-bg text-zt-text font-sans flex flex-col ${className}`}>
      <WebsiteThemeControls.Provider value={{ themeId: shown, isDaylight, selectTheme, toggleDaylight, mounted }}>
        {children}
      </WebsiteThemeControls.Provider>
    </div>
  );
}
