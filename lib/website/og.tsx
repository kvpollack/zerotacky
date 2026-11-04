// Shared bits for link previews (Kurt 10/19): the absolute site URL for metadata and the card renderer used by
// the opengraph-image routes. Facebook groups are where meets get promoted, so a pasted link should show the
// meet name, date and venue instead of a blank card.
// Sheet card (Phase 6 leftover, 11/4): white sheet on the ground with an ink rule, the Set Stone V9 as the 0 in
// ZER0TACKY, Red Hat Mono text, pen only for the LIVE key. Fonts are the site's own woff2 files converted to TTF in
// lib/website/fonts (Satori reads TTF/OTF/WOFF, not WOFF2), loaded once per lambda.
import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';

export { siteUrl } from './siteUrl';

export const OG_SIZE = { width: 1200, height: 630 };

export interface OgCard {
  kicker: string;   // small caps line, e.g. "Strongman show · Lancaster, PA"
  title: string;    // meet name
  lines: string[];  // up to 3 supporting lines (date, venue, status)
  badge?: string;   // e.g. "DEMO" or "LIVE"
}

const INK = '#111111', SHEET = '#ffffff', GROUND = '#d6d6d6', MUTED = '#4f4f4f', PEN = '#1d3aa8';

let fontsPromise: Promise<Array<{ name: string; data: ArrayBuffer; weight: 400 | 700; style: 'normal' }>> | null = null;
function loadFonts() {
  if (!fontsPromise) {
    const read = async (file: string) => {
      const buf = await readFile(new URL(`./fonts/${file}`, import.meta.url));
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    };
    fontsPromise = Promise.all([
      read('red-hat-mono-400.ttf').then((data) => ({ name: 'Red Hat Mono', data, weight: 400 as const, style: 'normal' as const })),
      read('red-hat-mono-700.ttf').then((data) => ({ name: 'Red Hat Mono', data, weight: 700 as const, style: 'normal' as const })),
      read('saira-stencil-one-400.ttf').then((data) => ({ name: 'Saira Stencil One', data, weight: 400 as const, style: 'normal' as const })),
    ]);
  }
  return fontsPromise;
}

/** Set Stone V9 at a given pixel size; same geometry as components/sheet/StoneMark.tsx (stroke 18, the wordmark weight). */
function Stone({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size}>
      <circle cx="50" cy="48" r="36" fill="none" stroke={INK} strokeWidth={18} />
      <path d="M32.146 41.502 A19 19 0 0 1 46.701 29.289" fill="none" stroke={INK} strokeWidth={6} strokeLinecap="round" />
      <path d="M7 86 H93" fill="none" stroke={INK} strokeWidth={14} strokeLinecap="round" />
      <path d="M10 97 H90" fill="none" stroke={INK} strokeWidth={6} strokeLinecap="round" />
    </svg>
  );
}

export async function renderOgCard(card: OgCard): Promise<ImageResponse> {
  const title = card.title.length > 70 ? `${card.title.slice(0, 67)}...` : card.title;
  const fonts = await loadFonts();
  const fs = 54; // wordmark size; stone box .76em, bottom .05em below the baseline (Wordmark.tsx)
  const live = card.badge === 'LIVE';
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: GROUND, padding: 36, fontFamily: 'Red Hat Mono', color: INK }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, background: SHEET, border: `4px solid ${INK}` }}>
          {/* header strip: wordmark left, status key right */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 40px', height: 104, borderBottom: `4px solid ${INK}` }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', fontFamily: 'Saira Stencil One', fontSize: fs, letterSpacing: fs * 0.02, lineHeight: 1 }}>
              <span>ZER</span>
              <div style={{ display: 'flex', margin: `0 ${fs * 0.03}px`, transform: `translateY(${-fs * 0.2}px)` }}><Stone size={fs * 0.76} /></div>
              <span>TACKY</span>
            </div>
            {card.badge && (
              <div style={{ display: 'flex', alignItems: 'center', height: 56, padding: '0 22px', fontSize: 24, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', border: `4px solid ${live ? PEN : INK}`, background: live ? PEN : SHEET, color: live ? SHEET : INK }}>
                {card.badge}
              </div>
            )}
          </div>
          {/* body */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', padding: '28px 40px', gap: 18 }}>
            <div style={{ fontSize: 22, letterSpacing: 2, color: MUTED, textTransform: 'uppercase' }}>{card.kicker}</div>
            <div style={{ fontSize: title.length > 40 ? 52 : 66, fontWeight: 700, lineHeight: 1.08 }}>{title}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {card.lines.slice(0, 3).map((l, i) => (
                <div key={i} style={{ fontSize: 28, fontWeight: i === 0 ? 700 : 400, color: INK }}>{l}</div>
              ))}
            </div>
          </div>
          {/* title block */}
          <div style={{ display: 'flex', borderTop: `4px solid ${INK}`, height: 92 }}>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, padding: '0 40px', gap: 6 }}>
              <div style={{ fontSize: 16, letterSpacing: 2, color: MUTED, textTransform: 'uppercase' }}>Sheet</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>Shows, registration, live scoring, gym directory</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 40px', gap: 6, borderLeft: `4px solid ${INK}` }}>
              <div style={{ fontSize: 16, letterSpacing: 2, color: MUTED, textTransform: 'uppercase' }}>Operator</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>zerotacky.com</div>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts }
  );
}

export function registrationLine(status: string): string {
  switch (status) {
    case 'open': return 'Registration open';
    case 'waitlist': return 'Waitlist open';
    case 'closed': return 'Registration closed';
    case 'day_of_only': return 'Day-of registration only';
    default: return '';
  }
}
