// Colour ways (030, ROADMAP 6.5): a gym or a show stores three hex colours; everything else on the page is derived
// here. Pure functions, no React, so the picker, the public pages, the board and the tests share one palette.
//
// Contrast: computed with the WCAG relative-luminance formula, but surfaced only as plain-words warnings. Kurt 10/27:
// tell the owner a pair is likely to be hard to read, never refuse the save, never show the numbers.

import { THEMES } from '@/lib/constants';
import type { ThemeDef } from '@/lib/types';

export interface ZtTheme {
  primary: string;      // '#rrggbb', lower-case
  background: string;
  secondary?: string;
}

export const THEME_KEYS = ['primary', 'background', 'secondary'] as const;
const HEX6 = /^#[0-9a-f]{6}$/;

// '#E11D48', 'e11d48', '#e14' all become '#e11d48'; anything else is null.
export function normalizeHex(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  let s = v.trim().toLowerCase();
  if (!s) return null;
  if (!s.startsWith('#')) s = `#${s}`;
  if (/^#[0-9a-f]{3}$/.test(s)) s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return HEX6.test(s) ? s : null;
}

// Row value (jsonb) -> ZtTheme, or null when absent or not in contract (the server check is the real gate; this keeps
// a bad row from throwing in a render).
export function parseTheme(v: unknown): ZtTheme | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const primary = normalizeHex(o.primary);
  const background = normalizeHex(o.background);
  if (!primary || !background) return null;
  const secondary = o.secondary === undefined || o.secondary === null || o.secondary === '' ? undefined : normalizeHex(o.secondary);
  if (secondary === null) return null;
  return secondary ? { primary, background, secondary } : { primary, background };
}

// Form input -> saveable theme. Blank primary and background together mean "no custom colours" (null theme).
export function cleanTheme(input: { primary?: unknown; background?: unknown; secondary?: unknown } | null | undefined):
  { theme: ZtTheme | null; problem: null } | { theme: null; problem: string } {
  if (!input) return { theme: null, problem: null };
  const raw = { primary: String(input.primary ?? '').trim(), background: String(input.background ?? '').trim(), secondary: String(input.secondary ?? '').trim() };
  if (!raw.primary && !raw.background && !raw.secondary) return { theme: null, problem: null };
  const primary = normalizeHex(raw.primary);
  const background = normalizeHex(raw.background);
  if (!primary || !background) return { theme: null, problem: 'Colours need both a main colour and a background, as six-digit hex (like #e11d48).' };
  if (raw.secondary) {
    const secondary = normalizeHex(raw.secondary);
    if (!secondary) return { theme: null, problem: 'The second accent colour is not a six-digit hex value (like #2563eb).' };
    return { theme: { primary, background, secondary }, problem: null };
  }
  return { theme: { primary, background }, problem: null };
}

export function sameTheme(a: ZtTheme | null | undefined, b: ZtTheme | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.primary === b.primary && a.background === b.background && (a.secondary ?? '') === (b.secondary ?? '');
}

// A preset becomes a starting point: its card colour is the background, its two accents carry over.
export function presetTheme(t: ThemeDef): ZtTheme {
  return { primary: t.primary.toLowerCase(), background: t.surface.toLowerCase(), secondary: t.secondary.toLowerCase() };
}
export const PRESET_THEMES: ReadonlyArray<{ id: string; name: string; theme: ZtTheme }> =
  THEMES.map((t) => ({ id: t.id, name: t.name, theme: presetTheme(t) }));

// ---------- colour maths ----------
function rgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex) ?? '#000000';
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
function toHex(c: [number, number, number]): string {
  return `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}
function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
export function contrast(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
// t = 0 -> a, t = 1 -> b (sRGB, good enough for surfaces and borders)
export function mix(a: string, b: string, t: number): string {
  const ca = rgb(a), cb = rgb(b);
  return toHex([ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t]);
}

const INK = '#09090b';
const PAPER = '#ffffff';

export function isLightBackground(theme: ZtTheme): boolean {
  return contrast(theme.background, INK) > contrast(theme.background, PAPER);
}
// Black or white text on an accent, whichever reads better.
export function onColor(hex: string): string {
  return contrast(hex, INK) >= contrast(hex, PAPER) ? INK : PAPER;
}

// The [data-zt-theme] block that supplies text, muted, success and danger colours plus color-scheme; the custom
// colours override the rest inline. Light backgrounds borrow the daylight block so the light-theme utility
// overrides in globals.css apply too.
export function themeBaseId(theme: ZtTheme): string {
  return isLightBackground(theme) ? 'daylight' : 'steel';
}

export function themeCssVars(theme: ZtTheme): Record<string, string> {
  const light = isLightBackground(theme);
  const bg = theme.background;
  const towards = light ? INK : PAPER;
  const secondary = theme.secondary ?? theme.primary;
  return {
    '--zt-bg': bg,
    '--zt-surface': light ? mix(bg, PAPER, 0.6) : mix(bg, PAPER, 0.035),
    '--zt-surface-2': light ? mix(bg, INK, 0.08) : mix(bg, PAPER, 0.09),
    '--zt-inset': light ? mix(bg, INK, 0.03) : bg,
    '--zt-border': mix(bg, towards, light ? 0.18 : 0.11),
    '--zt-border-strong': mix(bg, towards, light ? 0.38 : 0.19),
    '--zt-primary': theme.primary,
    '--zt-primary-2': light ? mix(theme.primary, INK, 0.15) : mix(theme.primary, PAPER, 0.3),
    '--zt-on-primary': onColor(theme.primary),
    '--zt-secondary': secondary,
    '--zt-on-secondary': onColor(secondary),
  };
}

// Plain-words warnings for the picker. The owner can still save; a live gym is bright and phones are small, so the
// threshold is the WCAG one for large bold text (3), which is how the accents are used: scores, headings, links.
// Body text and text on the accents need no check: the base theme and onColor pick black or white by contrast, and
// the worse of those two never drops meaningfully below 4.5 (a mid grey bottoms out at about 4.5).
export function themeWarnings(theme: ZtTheme): string[] {
  const out: string[] = [];
  const bg = theme.background;
  if (contrast(theme.primary, bg) < 3) out.push('The main colour on this background is likely to be hard to read in a live environment. Try a pair with more contrast.');
  // the second accent is mostly a fill (chips, secondary buttons), so it needs to stand off the background and carry
  // readable text; 2.5 keeps Iron & Brass's crimson-on-charcoal (a shipped preset) quiet while a near-match still warns
  if (theme.secondary && contrast(theme.secondary, bg) < 2.5) out.push('The second accent blends into this background and is likely to be hard to see in a live environment. Try a pair with more contrast.');
  return out;
}
