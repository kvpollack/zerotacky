// The Set Stone, redrawn as an outline: a circle on a flat base, stroke only, one colour (currentColor).
// It is the 0 in ZER0TACKY, the title block's logo cell, the ring round a best mark, the pending-attempt
// marker and the loader. Never filled, never red, never the promoter's colour. (Kurt 11/2.)
import React from 'react';

export type StoneMarkProps = {
  /** CSS size; defaults to 1em so it follows the surrounding text. */
  size?: string | number;
  /** Stroke in viewBox units (0-100). 8 reads as a 2 px line at 24 px; the wordmark uses 18. */
  stroke?: number;
  className?: string;
  title?: string;
  style?: React.CSSProperties;
};

export default function StoneMark({ size = '1em', stroke = 8, className = '', title, style }: StoneMarkProps) {
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
      <circle cx="50" cy="50" r="36" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" />
      <path d="M6 90 H94" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" />
    </svg>
  );
}
