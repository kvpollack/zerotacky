'use client';
// The TV canvas: the approved mockups are drawn at 1920 x 1080, so the board is laid out at that size and scaled
// to the screen (letterboxed on the ground colour). Zone numbers 1-8 along the top, letters A-F down the side,
// a 2 px frame; the sheet fills the rest. The promoter's three slots take --accent / --accent-label here;
// the ground takes resolveGround's colour.
import React, { useEffect, useState } from 'react';
import type { TvMode } from '@/lib/tv/model';

export const TV_W = 1920;
export const TV_H = 1080;
const M = 24;   // sheet margin
const Z = 28;   // zone strip

export type TvFrameProps = {
  mode: TvMode;
  ground: string;
  accent: string;
  accentLabel: string;
  /** CSS grid-template-rows / columns for the frame's children. */
  frameStyle?: React.CSSProperties;
  children: React.ReactNode;
};

export function useTvScale(): number {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / TV_W, window.innerHeight / TV_H));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return scale;
}

export default function TvFrame({ mode, ground, accent, accentLabel, frameStyle, children }: TvFrameProps) {
  const scale = useTvScale();
  return (
    <div
      data-zt-mode={mode}
      className="fixed inset-0 overflow-hidden font-sheet uppercase text-ink leading-[1.15] antialiased"
      style={{ background: ground, ['--accent' as string]: accent, ['--accent-label' as string]: accentLabel, fontSynthesis: 'none' }}
    >
      <div
        className="absolute left-1/2 top-1/2"
        style={{ width: TV_W, height: TV_H, transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: 'center' }}
      >
        <div className="absolute bg-sheet" style={{ left: M, top: M, width: TV_W - 2 * M, height: TV_H - 2 * M }}>
          <div className="absolute flex text-[17px]" style={{ left: Z, top: 0, right: 0, height: Z }} aria-hidden="true">
            {['1', '2', '3', '4', '5', '6', '7', '8'].map((c, i) => (
              <span key={c} className="flex-1 flex items-center justify-center" style={{ borderLeft: i ? '1px solid var(--rule)' : undefined }}>{c}</span>
            ))}
          </div>
          <div className="absolute flex flex-col text-[17px]" style={{ left: 0, top: Z, bottom: 0, width: Z }} aria-hidden="true">
            {['A', 'B', 'C', 'D', 'E', 'F'].map((r, i) => (
              <span key={r} className="flex-1 flex items-center justify-center" style={{ borderTop: i ? '1px solid var(--rule)' : undefined }}>{r}</span>
            ))}
          </div>
          <div className="absolute grid" style={{ left: Z, top: Z, right: 0, bottom: 0, border: '2px solid var(--rule)', ...frameStyle }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A cell that mirrors the mockups' .cell: column flex, vertically centred, 10 px side padding. */
export function TvCell({ className = '', style, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={`flex flex-col justify-center px-2.5 min-w-0 ${className}`} style={style}>
      {children}
    </div>
  );
}

/** The small grey printed heading. */
export function Cap({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <div className={`text-ink-muted tracking-[0.04em] ${className}`}>{children}</div>;
}

/** Title-block field: cap over value. `slot` paints it in the promoter's colour. */
export function TField({ cap, value, slot, span, colStart, colEnd, rowStart, rowEnd, valueSize = 20, valueStyle, className = '' }: {
  cap: string; value: React.ReactNode; slot?: boolean; span?: number; colStart?: number; colEnd?: number; rowStart?: number; rowEnd?: number;
  valueSize?: number; valueStyle?: React.CSSProperties; className?: string;
}) {
  const style: React.CSSProperties = {};
  if (span) style.gridColumn = `span ${span}`;
  if (colStart) style.gridColumn = colEnd ? `${colStart} / ${colEnd}` : `${colStart}`;
  if (rowStart) style.gridRow = rowEnd ? `${rowStart} / ${rowEnd}` : `${rowStart}`;
  return (
    <TvCell className={`${slot ? 'bg-slot text-slot-label' : ''} ${className}`} style={style}>
      <div className={`text-[13px] tracking-[0.04em] mb-1 ${slot ? '' : 'text-ink-muted'}`}>{cap}</div>
      <div className="font-bold whitespace-nowrap overflow-hidden text-ellipsis" style={{ fontSize: slot ? Math.min(valueSize, 18) : valueSize, ...valueStyle }}>{value}</div>
    </TvCell>
  );
}
