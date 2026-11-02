// Promoter paint: three clamped slots on public screens (CLIENT cell, card header band, live row) and the
// ground around the sheet. Never the judge pad, never a state colour. Rules from the design study
// (D03/D07 briefs, 10/31) as Kurt locked them on 11/2:
//   accent  home: OKLCH L 0.30-0.50, C <= 0.20 (white label reaches 4.5:1)   dark: L 0.65-0.80, C <= 0.20 (black label)
//   ground  home: L 0.80-0.92, C <= 0.05                                       dark: L 0.18-0.30, C <= 0.05
//   refusal: after clamping, CAM02-UCS deltaE < 20 from the red pen with normal, deutan or protan vision.
//            A refused accent leaves the slots in ink; the meet name may carry the colour as text instead.
import { deltaEAs, hexToRgb, labelFor, oklchToHexClipped, rgbToOklch, type Vision } from './color';

export type Mode = 'home' | 'dark';
export const INK: Record<Mode, string> = { home: '#111111', dark: '#f2f2f2' };
export const INK_LABEL: Record<Mode, string> = { home: '#ffffff', dark: '#000000' };
export const RED_PEN: Record<Mode, string> = { home: '#c8102e', dark: '#ff5a4f' };
export const GROUND: Record<Mode, string> = { home: '#d6d6d6', dark: '#2b2b2b' };
export const MIN_DELTA_E = 20;
const VISIONS: Vision[] = ['normal', 'deutan', 'protan'];

const clampTo = (hex: string, lo: number, hi: number, cMax: number): string => {
  const o = rgbToOklch(hexToRgb(hex));
  return oklchToHexClipped({ l: Math.min(hi, Math.max(lo, o.l)), c: Math.min(cMax, o.c), h: o.h });
};

export function clampAccent(hex: string, mode: Mode): string {
  return mode === 'home' ? clampTo(hex, 0.3, 0.5, 0.2) : clampTo(hex, 0.65, 0.8, 0.2);
}
export function clampGround(hex: string, mode: Mode): string {
  return mode === 'home' ? clampTo(hex, 0.8, 0.92, 0.05) : clampTo(hex, 0.18, 0.3, 0.05);
}

export type AccentResult = {
  /** Fill for the three slots (ink when refused). */
  accent: string;
  /** Text on that fill. */
  label: string;
  /** The clamped colour, even when refused (so the meet name can still carry it as text). */
  clamped: string;
  refused: boolean;
  /** Smallest deltaE to the red pen across the three visions. */
  deltaE: number;
  /** Which vision failed, when refused. */
  failedAs?: Vision;
  reason?: string;
};

/** Resolve a promoter's primary colour for the three accent slots. `null`/`undefined` = no paint = ink. */
export function resolveAccent(hex: string | null | undefined, mode: Mode): AccentResult {
  if (!hex) return { accent: INK[mode], label: INK_LABEL[mode], clamped: INK[mode], refused: false, deltaE: Infinity };
  const clamped = clampAccent(hex, mode);
  let worst = Infinity, failedAs: Vision | undefined;
  for (const v of VISIONS) {
    const d = deltaEAs(clamped, RED_PEN[mode], v);
    if (d < worst) { worst = d; failedAs = v; }
  }
  if (worst < MIN_DELTA_E) {
    return {
      accent: INK[mode], label: INK_LABEL[mode], clamped, refused: true, deltaE: worst, failedAs,
      reason: `That colour sits too close to the no-lift red${failedAs === 'normal' ? '' : ` for ${failedAs} colour vision`}. Pick another, or we set your name in it instead.`,
    };
  }
  return { accent: clamped, label: labelFor(clamped), clamped, refused: false, deltaE: worst };
}

/** Resolve a promoter's background colour for the ground around the sheet. */
export function resolveGround(hex: string | null | undefined, mode: Mode): string {
  return hex ? clampGround(hex, mode) : GROUND[mode];
}
