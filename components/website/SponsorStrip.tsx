'use client';
// Sponsor strip (046, 11/6, feature gaps #14): logos where the promoter uploaded one, the name otherwise, each linking
// out when a link was given. Shared by the show page and the phone board; the TV idle sheet has its own sized copy.
// A logo that fails to load falls back to the name, so a deleted object never leaves a silent hole in the strip.
import React, { useState } from 'react';
import { sponsorLogoUrl, type MeetSponsor } from '@/lib/website/extras';
import { Cap } from './sheet';

function LogoOrName({ s, logoH, nameCls }: { s: MeetSponsor; logoH: string; nameCls: string }) {
  const [broken, setBroken] = useState(false);
  const src = sponsorLogoUrl(s.logoPath);
  if (src && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={s.name} title={s.name} className={`${logoH} w-auto max-w-[200px] object-contain`} loading="lazy" onError={() => setBroken(true)} />;
  }
  return <span className={`${nameCls} font-bold uppercase tracking-[0.04em] text-ink`}>{s.name}</span>;
}

export default function SponsorStrip({ sponsors, size = 'md', className = '' }: { sponsors: MeetSponsor[] | null | undefined; size?: 'md' | 'lg'; className?: string }) {
  if (!sponsors?.length) return null;
  const logoH = size === 'lg' ? 'h-16' : 'h-10';
  const nameCls = size === 'lg' ? 'text-[22px]' : 'text-[14px]';
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <Cap>Sponsors</Cap>
      <ul className="flex flex-wrap items-center gap-x-6 gap-y-3 list-none p-0 m-0">
        {sponsors.map((s, i) => {
          const inner = <LogoOrName s={s} logoH={logoH} nameCls={nameCls} />;
          return (
            <li key={`${s.name}-${i}`} className="flex items-center">
              {s.url ? (
                <a href={s.url} target="_blank" rel="noopener noreferrer sponsored" className="inline-flex items-center hover:opacity-80" aria-label={`${s.name} (opens in a new tab)`}>{inner}</a>
              ) : inner}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
