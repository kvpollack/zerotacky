'use client';

import React, { useEffect, useState } from 'react';
import { DEFAULT_THEME_ID } from '@/lib/constants';
import { useTheme } from '@/hooks/useTheme';
import WebsiteThemeControls from './WebsiteThemeControls';

// Client frame around the (server-rendered) website shell. Owns the theme: same localStorage prefs as the
// scorer (useTheme), so a promoter who picked "Power Plant Volt" on the phone sees it on the site too.
// First paint uses the default theme to match the server HTML; the saved theme applies right after mount.
export default function WebsiteThemeFrame({ children, controlsSlotId = 'zt-theme-controls' }: { children: React.ReactNode; controlsSlotId?: string }) {
  const { themeId, isDaylight, selectTheme, toggleDaylight } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div data-zt-theme={mounted ? themeId : DEFAULT_THEME_ID} className="min-h-screen bg-zt-bg text-zt-text font-sans flex flex-col">
      <WebsiteThemeControls.Provider value={{ themeId, isDaylight, selectTheme, toggleDaylight, mounted }}>
        {children}
      </WebsiteThemeControls.Provider>
    </div>
  );
}
