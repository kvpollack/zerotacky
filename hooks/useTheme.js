'use client';

import { useState, useEffect } from 'react';
import { THEME_STORAGE_KEY, DEFAULT_THEME_ID, DAYLIGHT_THEME_ID, THEMES, isLightTheme } from '@/lib/constants';

export function useTheme() {
  const [themePrefs, setThemePrefs] = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      // Fall back to default theme
    }
    return { themeId: DEFAULT_THEME_ID, lastDarkThemeId: DEFAULT_THEME_ID, lastLightThemeId: DAYLIGHT_THEME_ID };
  });

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(themePrefs));
    } catch (e) {
      // Ignore storage errors
    }
  }, [themePrefs]);

  const themeId = THEMES.some((t) => t.id === themePrefs.themeId)
    ? themePrefs.themeId
    : DEFAULT_THEME_ID;
  const isDaylight = isLightTheme(themeId);

  // Day/Night remembers the last pick on each side, so Sandstone <-> Gunmetal round-trips instead of snapping back
  // to the defaults.
  const selectTheme = (id) =>
    setThemePrefs((p) => ({
      themeId: id,
      lastDarkThemeId: isLightTheme(id) ? p.lastDarkThemeId || DEFAULT_THEME_ID : id,
      lastLightThemeId: isLightTheme(id) ? id : p.lastLightThemeId || DAYLIGHT_THEME_ID,
    }));

  const toggleDaylight = () =>
    setThemePrefs((p) =>
      isLightTheme(p.themeId)
        ? { ...p, themeId: p.lastDarkThemeId || DEFAULT_THEME_ID }
        : { ...p, themeId: p.lastLightThemeId || DAYLIGHT_THEME_ID }
    );

  return { themePrefs, setThemePrefs, themeId, isDaylight, selectTheme, toggleDaylight };
}
