// The Set Stone V9 (Kurt 11/4): a ring with a highlight arc at the upper left, on a double base (heavy rule over a
// thin one). Stroke only, one colour (currentColor). It is the 0 in ZER0TACKY, the title block's logo cell, the ring
// round a best mark, the pending-attempt marker and the loader. Never filled, never red, never the promoter's colour.
// Geometry (100-unit box) is shared with ~/.aki/tmp/zt/merch/brand_svg.py (V9) and make_icons.py; change all three.
import React from 'react';

export type StoneMarkProps = {
  /** CSS size; defaults to 1em so it follows the surrounding text. */
  size?: string | number;
  /** Ring stroke in viewBox units (0-100). 8 reads as a 2 px line at 24 px; the wordmark uses 18.
   *  The highlight arc and thin base follow at a third of it (floor 3 so they survive small sizes). */
  stroke?: number;
  className?: string;
  title?: string;
  style?: React.CSSProperties;
};

export default function StoneMark({ size = '1em', stroke = 8, className = '', title, style }: StoneMarkProps) {
  const thin = Math.max(stroke / 3, 3);
  const base = (stroke * 14) / 18;
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`inline-block shrink-0 ${className}`}
      style={style}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <circle cx="50" cy="48" r="36" fill="none" stroke="currentColor" strokeWidth={stroke} />
      {/* highlight arc: r 19 about (50,48), 290° to 350° clockwise from the top */}
      <path d="M32.146 41.502 A19 19 0 0 1 46.701 29.289" fill="none" stroke="currentColor" strokeWidth={thin} strokeLinecap="round" />
      <path d="M7 86 H93" fill="none" stroke="currentColor" strokeWidth={base} strokeLinecap="round" />
      <path d="M10 97 H90" fill="none" stroke="currentColor" strokeWidth={thin} strokeLinecap="round" />
    </svg>
  );
}
