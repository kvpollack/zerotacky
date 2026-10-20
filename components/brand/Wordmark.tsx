// ZEROTACKY wordmark with the Set Stone in the O slot (Kurt 10/21). Inline SVG, same geometry as public/stone.svg,
// so the stone keeps the brand reds while the set line and the letters follow the surrounding text color and
// theme. Renders inline at the current font size; the stone's baseline sits on the text baseline.
import React, { useId } from 'react';

export default function Wordmark({ className = '' }: { className?: string }) {
  // Header and footer both render the mark; each needs its own clipPath id.
  const clipId = `zt-stone-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <span className={`inline-flex items-baseline whitespace-nowrap ${className}`}>
      <span className="sr-only">ZeroTacky</span>
      <span aria-hidden="true">ZER</span>
      <svg
        viewBox="28 20 124 116"
        width="0.82em"
        height="0.76em"
        className="inline-block mx-[0.02em] shrink-0"
        style={{ verticalAlign: 'baseline' }}
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <clipPath id={clipId}>
            <path d="M 51.23 127.8 A 59.4 59.4 0 1 1 128.77 127.8 Z" />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <rect x="29.6" y="22.4" width="120.8" height="120.8" fill="#e11d48" />
          <path
            fillRule="evenodd"
            fill="#9f1239"
            d="M 30.6 82.8 a 59.4 59.4 0 1 0 118.8 0 a 59.4 59.4 0 1 0 -118.8 0 Z M 22.284 70.92 a 54.648 54.648 0 1 0 109.296 0 a 54.648 54.648 0 1 0 -109.296 0 Z"
          />
          <ellipse cx="67.428" cy="57.852" rx="11.286" ry="6.534" transform="rotate(-38 67.428 57.852)" fill="#fda4af" />
          <circle cx="82.872" cy="45.972" r="3.564" fill="#fda4af" />
        </g>
        <path d="M 51.23 127.8 A 59.4 59.4 0 1 1 128.77 127.8" fill="none" stroke="currentColor" strokeWidth="8.316" strokeLinecap="round" />
        <line x1="33.407" y1="127.8" x2="146.593" y2="127.8" stroke="currentColor" strokeWidth="8.316" strokeLinecap="round" />
      </svg>
      <span aria-hidden="true">TACKY</span>
    </span>
  );
}
