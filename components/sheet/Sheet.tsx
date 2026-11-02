// The sheet: a white (or black) page floating on a grey ground, with a 2 px frame, zone numbers 1-8 along the
// top edge and letters A-F down the side (ISO 5457 grid references skip I and O). Everything a screen shows
// lives inside the frame; nothing is placed off the zone grid. `mode` sets the venue toggle for this subtree.
import React from 'react';
import type { Mode } from '@/lib/theme/promoter';

export type SheetProps = {
  mode?: Mode;
  /** Ground colour around the sheet (already clamped by resolveGround). Defaults to the token. */
  ground?: string;
  /** 'tv' = 24 px margin, 28 px zone strips; 'pad' = 8 px margin, 16 px strips. */
  size?: 'tv' | 'pad';
  /** Hide the zone strips (small TVs, per the D07 overflow rule). */
  zones?: boolean;
  className?: string;
  children: React.ReactNode;
};

const ZONE_COLS = ['1', '2', '3', '4', '5', '6', '7', '8'];
const ZONE_ROWS = ['A', 'B', 'C', 'D', 'E', 'F'];

export default function Sheet({ mode, ground, size = 'tv', zones = true, className = '', children }: SheetProps) {
  const m = size === 'tv' ? 24 : 8;
  const z = zones ? (size === 'tv' ? 28 : 16) : 0;
  const zFont = size === 'tv' ? 17 : 11;
  return (
    <div
      data-zt-mode={mode}
      className={`font-sheet uppercase text-ink bg-ground ${className}`}
      style={{ background: ground, padding: m, minHeight: '100%', boxSizing: 'border-box' }}
    >
      <div className="relative bg-sheet" style={{ minHeight: `calc(100vh - ${2 * m}px)` }}>
        {zones && (
          <>
            <div className="absolute flex" style={{ left: z, top: 0, right: 0, height: z, fontSize: zFont }} aria-hidden="true">
              {ZONE_COLS.map((c, i) => (
                <span key={c} className="flex-1 flex items-center justify-center" style={{ borderLeft: i ? '1px solid var(--rule)' : undefined }}>{c}</span>
              ))}
            </div>
            <div className="absolute flex flex-col" style={{ left: 0, top: z, bottom: 0, width: z, fontSize: zFont }} aria-hidden="true">
              {ZONE_ROWS.map((r, i) => (
                <span key={r} className="flex-1 flex items-center justify-center" style={{ borderTop: i ? '1px solid var(--rule)' : undefined }}>{r}</span>
              ))}
            </div>
          </>
        )}
        <div className="absolute flex flex-col" style={{ left: z, top: z, right: 0, bottom: 0, border: '2px solid var(--rule)' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
