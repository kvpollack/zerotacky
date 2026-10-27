import { test, expect } from 'bun:test';
import * as T from '../lib/website/theme.ts';

test('normalizeHex accepts 6 and 3 digit forms, with or without #, and refuses the rest', () => {
  expect(T.normalizeHex('#E11D48')).toBe('#e11d48');
  expect(T.normalizeHex('e11d48')).toBe('#e11d48');
  expect(T.normalizeHex('#e14')).toBe('#ee1144');
  expect(T.normalizeHex(' #ffffff ')).toBe('#ffffff');
  expect(T.normalizeHex('#ggg000')).toBeNull();
  expect(T.normalizeHex('#e11d4')).toBeNull();
  expect(T.normalizeHex('')).toBeNull();
  expect(T.normalizeHex(12)).toBeNull();
});

test('parseTheme reads a row value and drops anything off-contract', () => {
  expect(T.parseTheme({ primary: '#E11D48', background: '#111317' })).toEqual({ primary: '#e11d48', background: '#111317' });
  expect(T.parseTheme({ primary: '#e11d48', background: '#111317', secondary: '#2563eb' })).toEqual({ primary: '#e11d48', background: '#111317', secondary: '#2563eb' });
  expect(T.parseTheme({ primary: '#e11d48', background: '#111317', secondary: null })).toEqual({ primary: '#e11d48', background: '#111317' });
  expect(T.parseTheme({ primary: '#e11d48' })).toBeNull();
  expect(T.parseTheme({ primary: '#e11d48', background: '#111317', secondary: 'blue' })).toBeNull();
  expect(T.parseTheme(null)).toBeNull();
  expect(T.parseTheme('#e11d48')).toBeNull();
  expect(T.parseTheme([])).toBeNull();
});

test('cleanTheme: blank means no colours, partial is a problem, secondary optional', () => {
  expect(T.cleanTheme({ primary: '', background: '', secondary: '' })).toEqual({ theme: null, problem: null });
  expect(T.cleanTheme(null)).toEqual({ theme: null, problem: null });
  expect(T.cleanTheme({ primary: '#e11d48', background: '' }).problem).toMatch(/both/);
  expect(T.cleanTheme({ primary: 'E11D48', background: '#111317' })).toEqual({ theme: { primary: '#e11d48', background: '#111317' }, problem: null });
  expect(T.cleanTheme({ primary: '#e11d48', background: '#111317', secondary: 'nope' }).problem).toMatch(/second accent/);
  expect(T.cleanTheme({ primary: '#e11d48', background: '#111317', secondary: '#2563EB' }).theme).toEqual({ primary: '#e11d48', background: '#111317', secondary: '#2563eb' });
});

test('contrast matches the WCAG reference points', () => {
  expect(T.contrast('#000000', '#ffffff')).toBeCloseTo(21, 1);
  expect(T.contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  expect(T.contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  expect(T.luminance('#ffffff')).toBeCloseTo(1, 5);
  expect(T.luminance('#000000')).toBeCloseTo(0, 5);
});

test('onColor and themeBaseId pick black/white and dark/light by contrast', () => {
  expect(T.onColor('#e11d48')).toBe('#ffffff');
  expect(T.onColor('#facc15')).toBe('#09090b');
  expect(T.themeBaseId({ primary: '#e11d48', background: '#111317' })).toBe('steel');
  expect(T.themeBaseId({ primary: '#1d4ed8', background: '#f8fafc' })).toBe('daylight');
  // mid grey reads better with dark text, so it counts as a light background
  expect(T.isLightBackground({ primary: '#000000', background: '#808080' })).toBe(true);
  expect(T.isLightBackground({ primary: '#000000', background: '#555555' })).toBe(false);
});

test('themeCssVars derives the full palette and keeps the chosen colours verbatim', () => {
  const v = T.themeCssVars({ primary: '#e11d48', background: '#111317', secondary: '#2563eb' });
  expect(v['--zt-bg']).toBe('#111317');
  expect(v['--zt-primary']).toBe('#e11d48');
  expect(v['--zt-secondary']).toBe('#2563eb');
  expect(v['--zt-on-primary']).toBe('#ffffff');
  expect(Object.keys(v).sort()).toEqual(['--zt-bg', '--zt-border', '--zt-border-strong', '--zt-inset', '--zt-on-primary', '--zt-on-secondary', '--zt-primary', '--zt-primary-2', '--zt-secondary', '--zt-surface', '--zt-surface-2']);
  // dark: surfaces lighten; light: the card is lighter than the page and borders darker
  expect(T.luminance(v['--zt-surface'])).toBeGreaterThan(T.luminance('#111317'));
  expect(T.luminance(v['--zt-border-strong'])).toBeGreaterThan(T.luminance(v['--zt-border']));
  const l = T.themeCssVars({ primary: '#b91c1c', background: '#f4f1ea' });
  expect(T.luminance(l['--zt-surface'])).toBeGreaterThan(T.luminance('#f4f1ea'));
  expect(T.luminance(l['--zt-border'])).toBeLessThan(T.luminance('#f4f1ea'));
  expect(l['--zt-secondary']).toBe('#b91c1c');   // no secondary: the primary stands in
  for (const x of Object.values(v)) expect(x).toMatch(/^#[0-9a-f]{6}$/);
});

test('themeWarnings: every preset is clean; bad pairs warn in plain words with no numbers', () => {
  for (const p of T.PRESET_THEMES) expect(T.themeWarnings(p.theme)).toEqual([]);
  const grey = T.themeWarnings({ primary: '#777777', background: '#808080', secondary: '#7a7a7a' });
  expect(grey.length).toBe(2);
  for (const w of grey) { expect(w).toMatch(/in a live environment/); expect(w).not.toMatch(/\d/); }
  // black-or-white text on any colour lands at about 4.5 or better (worst case is a mid grey), so there is no
  // body-text or button-text warning to give
  for (const hex of ['#777777', '#808080', '#767676', '#6a6a6a']) expect(T.contrast(T.onColor(hex), hex)).toBeGreaterThan(4.4);
  // light pastel accent on white: warns on the main colour
  expect(T.themeWarnings({ primary: '#fde68a', background: '#ffffff' })).toEqual([expect.stringMatching(/main colour on this background/)]);
  // secondary close to the background warns on the second accent
  expect(T.themeWarnings({ primary: '#e11d48', background: '#111317', secondary: '#1c1f25' })).toEqual([expect.stringMatching(/second accent blends/)]);
  expect(T.themeWarnings({ primary: '#e11d48', background: '#111317', secondary: '#808080' })).toEqual([]);
});

test('presets map surface -> background and sameTheme compares by value', () => {
  const steel = T.PRESET_THEMES.find((p) => p.id === 'steel');
  expect(steel.theme).toEqual({ primary: '#e11d48', background: '#111317', secondary: '#2563eb' });
  expect(T.sameTheme(null, null)).toBe(true);
  expect(T.sameTheme(steel.theme, { ...steel.theme })).toBe(true);
  expect(T.sameTheme(steel.theme, { primary: '#e11d48', background: '#111317' })).toBe(false);
  expect(T.sameTheme(steel.theme, null)).toBe(false);
});
