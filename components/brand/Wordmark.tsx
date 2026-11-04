// ZER0TACKY wordmark: Saira Stencil One letters with the Set Stone outline standing in for the 0 (Kurt 11/2,
// replacing the filled red stone of 10/21). One colour, currentColor, so it follows the surrounding text and mode.
// Renders inline at the current font size. Sub-24 px uses the stone alone (favicon, app icon), not this.
// cut='small' (Kurt 11/3): under ~150 px wide (site header, footer) the stencil bridges close up, so the small cut
// draws pre-eroded outlines (WordmarkSmallGlyphs) at the same layout instead of live text.
import React from 'react';
import StoneMark from '@/components/sheet/StoneMark';
import WordmarkSmallGlyphs from './WordmarkSmallGlyphs';

export default function Wordmark({ className = '', cut = 'display' }: { className?: string; cut?: 'display' | 'small' }) {
  if (cut === 'small') {
    return (
      <span className={`inline-flex items-baseline whitespace-nowrap font-wordmark font-normal normal-case leading-none ${className}`}>
        <span className="sr-only">ZeroTacky</span>
        <WordmarkSmallGlyphs />
      </span>
    );
  }
  return (
    <span className={`inline-flex items-baseline whitespace-nowrap font-wordmark font-normal normal-case tracking-[0.02em] ${className}`}>
      <span className="sr-only">ZeroTacky</span>
      <span aria-hidden="true">ZER</span>
      <StoneMark size="0.76em" stroke={18} className="mx-[0.03em] relative top-[0.05em]" style={{ verticalAlign: 'baseline' }} />
      <span aria-hidden="true">TACKY</span>
    </span>
  );
}
