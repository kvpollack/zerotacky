// Colour maths for the sheet design system (UI transition Phase 1, 11/2).
// sRGB <-> linear <-> XYZ, OKLab/OKLCH (for the promoter clamp), CIECAM02 -> CAM02-UCS (for the
// "too close to the red pen" refusal, which the design study specified as CAM02-UCS deltaE >= 20,
// checked with normal vision and a deuteranopia simulation), and WCAG relative luminance for label choice.
// Pure functions, no DOM. Values: rgb in 0..1, XYZ scaled to Y = 100.

export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const h = hex.trim().replace(/^#/, '');
  const s = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (!/^[0-9a-fA-F]{6}$/.test(s)) throw new Error(`bad hex ${hex}`);
  const n = parseInt(s, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  const c = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const gam = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
export const toLinear = (c: RGB): RGB => [lin(c[0]), lin(c[1]), lin(c[2])];
export const toGamma = (c: RGB): RGB => [gam(c[0]), gam(c[1]), gam(c[2])];

type M3 = [RGB, RGB, RGB];
const mul = (m: M3, v: RGB): RGB => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
];

// linear sRGB (D65) -> XYZ, Y in 0..1
const M_RGB_XYZ: M3 = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.072175],
  [0.0193339, 0.119192, 0.9503041],
];
export function linearToXyz100(l: RGB): RGB {
  const [x, y, z] = mul(M_RGB_XYZ, l);
  return [x * 100, y * 100, z * 100];
}

// WCAG 2 relative luminance and contrast ratio
export function luminance(hex: string): number {
  const [r, g, b] = toLinear(hexToRgb(hex));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
/** Black or white, whichever reads better on `bg`. */
export function labelFor(bg: string, dark = '#000000', light = '#ffffff'): string {
  return contrast(bg, light) >= contrast(bg, dark) ? light : dark;
}

// ---------- OKLab / OKLCH (Ottosson) ----------
const M1: M3 = [
  [0.4122214708, 0.5363325363, 0.0514459929],
  [0.2119034982, 0.6806995451, 0.1073969566],
  [0.0883024619, 0.2817188376, 0.6299787005],
];
const M2: M3 = [
  [0.2104542553, 0.793617785, -0.0040720468],
  [1.9779984951, -2.428592205, 0.4505937099],
  [0.0259040371, 0.7827717662, -0.808675766],
];
const M1i: M3 = [
  [4.0767416621, -3.3077115913, 0.2309699292],
  [-1.2684380046, 2.6097574011, -0.3413193965],
  [-0.0041960863, -0.7034186147, 1.707614701],
];
const M2i: M3 = [
  [1, 0.3963377774, 0.2158037573],
  [1, -0.1055613458, -0.0638541728],
  [1, -0.0894841775, -1.291485548],
];
export type OKLCH = { l: number; c: number; h: number };
export function rgbToOklch(rgb: RGB): OKLCH {
  const lms = mul(M1, toLinear(rgb)).map(Math.cbrt) as RGB;
  const [L, a, b] = mul(M2, lms);
  const c = Math.hypot(a, b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h };
}
export function oklchToRgb({ l, c, h }: OKLCH): RGB {
  const a = c * Math.cos((h * Math.PI) / 180), b = c * Math.sin((h * Math.PI) / 180);
  const lms = mul(M2i, [l, a, b]).map((v) => v * v * v) as RGB;
  return toGamma(mul(M1i, lms));
}
const inGamut = (c: RGB) => c.every((v) => v >= -1e-6 && v <= 1 + 1e-6);
/** Nearest in-gamut colour at this lightness and hue: chroma is reduced until sRGB holds it. */
export function oklchToHexClipped(o: OKLCH): string {
  let c = o.c;
  for (let i = 0; i < 40; i++) {
    const rgb = oklchToRgb({ ...o, c });
    if (inGamut(rgb)) return rgbToHex(rgb);
    c *= 0.9;
  }
  return rgbToHex(oklchToRgb({ ...o, c: 0 }));
}

// ---------- CIECAM02 -> CAM02-UCS ----------
// Viewing conditions: D65 white, average surround (F 1.0, c 0.69, Nc 1.0), La 64 cd/m2, Yb 20.
const XYZ_W: RGB = [95.047, 100, 108.883];
const LA = 64, YB = 20;
const M_CAT02: M3 = [
  [0.7328, 0.4296, -0.1624],
  [-0.7036, 1.6975, 0.0061],
  [0.003, 0.0136, 0.9834],
];
const M_CAT02_INV: M3 = [
  [1.096124, -0.278869, 0.182745],
  [0.454369, 0.473533, 0.072098],
  [-0.009628, -0.005698, 1.015326],
];
const M_HPE: M3 = [
  [0.38971, 0.68898, -0.07868],
  [-0.22981, 1.1834, 0.04641],
  [0, 0, 1],
];
const F = 1.0, C_SURR = 0.69, NC = 1.0;
const k = 1 / (5 * LA + 1);
const FL = 0.2 * k ** 4 * (5 * LA) + 0.1 * (1 - k ** 4) ** 2 * Math.cbrt(5 * LA);
const n = YB / XYZ_W[1];
const NBB = 0.725 * Math.pow(1 / n, 0.2);
const NCB = NBB;
const Z = 1.48 + Math.sqrt(n);
const D = Math.min(1, Math.max(0, F * (1 - (1 / 3.6) * Math.exp((-LA - 42) / 92))));
const RGB_W = mul(M_CAT02, XYZ_W);
const D_RGB: RGB = [
  (XYZ_W[1] * D) / RGB_W[0] + 1 - D,
  (XYZ_W[1] * D) / RGB_W[1] + 1 - D,
  (XYZ_W[1] * D) / RGB_W[2] + 1 - D,
];
const adapt = (v: number) => {
  const x = Math.pow((FL * Math.abs(v)) / 100, 0.42);
  return (Math.sign(v) * (400 * x)) / (x + 27.13) + 0.1;
};
function postAdapt(xyz: RGB): RGB {
  const rgb = mul(M_CAT02, xyz);
  const rgbC: RGB = [rgb[0] * D_RGB[0], rgb[1] * D_RGB[1], rgb[2] * D_RGB[2]];
  const rgbP = mul(M_HPE, mul(M_CAT02_INV, rgbC));
  return [adapt(rgbP[0]), adapt(rgbP[1]), adapt(rgbP[2])];
}
const RGB_AW = postAdapt(XYZ_W);
const AW = (2 * RGB_AW[0] + RGB_AW[1] + RGB_AW[2] / 20 - 0.305) * NBB;

export type CAM02 = { J: number; M: number; h: number };
export function xyzToCam02(xyz: RGB): CAM02 {
  const [Ra, Ga, Ba] = postAdapt(xyz);
  const a = Ra - (12 * Ga) / 11 + Ba / 11;
  const b = (Ra + Ga - 2 * Ba) / 9;
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  const et = 0.25 * (Math.cos((h * Math.PI) / 180 + 2) + 3.8);
  const A = (2 * Ra + Ga + Ba / 20 - 0.305) * NBB;
  const J = 100 * Math.pow(Math.max(A, 0) / AW, C_SURR * Z);
  const t = ((50000 / 13) * NC * NCB * et * Math.hypot(a, b)) / (Ra + Ga + (21 / 20) * Ba);
  const C = Math.pow(t, 0.9) * Math.sqrt(J / 100) * Math.pow(1.64 - Math.pow(0.29, n), 0.73);
  const M = C * Math.pow(FL, 0.25);
  return { J, M, h };
}
export type UCS = [number, number, number];
export function cam02ToUcs({ J, M, h }: CAM02): UCS {
  const Jp = (1.7 * J) / (1 + 0.007 * J);
  const Mp = Math.log(1 + 0.0228 * M) / 0.0228;
  return [Jp, Mp * Math.cos((h * Math.PI) / 180), Mp * Math.sin((h * Math.PI) / 180)];
}
export function linearToUcs(l: RGB): UCS {
  return cam02ToUcs(xyzToCam02(linearToXyz100(l)));
}
export function deltaEUcs(a: UCS, b: UCS): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
/** CAM02-UCS colour difference between two hex colours, normal vision. */
export function deltaE(hexA: string, hexB: string): number {
  return deltaEUcs(linearToUcs(toLinear(hexToRgb(hexA))), linearToUcs(toLinear(hexToRgb(hexB))));
}

// ---------- Dichromacy simulation (Machado, Oliveira and Fernandes 2009), severity 1.0, linear RGB ----------
const M_DEUTAN: M3 = [
  [0.367322, 0.860646, -0.227968],
  [0.280085, 0.672501, 0.047413],
  [-0.01182, 0.04294, 0.968881],
];
const M_PROTAN: M3 = [
  [0.152286, 1.052583, -0.204868],
  [0.114503, 0.786281, 0.099216],
  [-0.003882, -0.048116, 1.051998],
];
export type Vision = 'normal' | 'deutan' | 'protan';
export function simulate(hex: string, vision: Vision): RGB {
  const l = toLinear(hexToRgb(hex));
  if (vision === 'normal') return l;
  const out = mul(vision === 'deutan' ? M_DEUTAN : M_PROTAN, l);
  return out.map((v) => Math.min(1, Math.max(0, v))) as RGB;
}
/** CAM02-UCS difference as seen with the given vision. */
export function deltaEAs(hexA: string, hexB: string, vision: Vision): number {
  return deltaEUcs(linearToUcs(simulate(hexA, vision)), linearToUcs(simulate(hexB, vision)));
}
