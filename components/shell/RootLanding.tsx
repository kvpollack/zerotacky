'use client';

import { useEffect, useState } from 'react';
import { Globe, Play, QrCode } from 'lucide-react';
import { DEFAULT_THEME_ID } from '@/lib/constants';
import { readResume, type ResumeInfo } from '@/lib/landing';

// Root splash. Two doors: the public site (gyms, shows, registration) and the volunteer join flow
// (type the 6-character code or scan the promoter's QR). A phone that already carries a meet gets a
// Resume button on top so judges who open the home-screen icon on meet day land in the scorer in one tap.
export default function RootLanding() {
  const [resume, setResume] = useState<ResumeInfo | null>(null);
  useEffect(() => { setResume(readResume(localStorage)); }, []);

  const btn = 'w-full py-4 rounded-xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2';

  return (
    <div data-zt-theme={DEFAULT_THEME_ID} className="min-h-screen bg-zt-bg text-zt-text font-sans p-5 flex flex-col items-center justify-center">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center space-y-1">
          <div className="text-[10px] font-black uppercase tracking-widest text-zt-primary">ZEROTACKY</div>
          <h1 className="text-3xl font-black tracking-tight">Strongman, scored.</h1>
          <p className="text-xs text-zt-muted">Shows, gyms and offline-first meet-day scoring.</p>
        </div>

        {resume && (
          <a href="/scorer" className={`${btn} bg-zt-surface border-2 border-zt-primary text-zt-text`}>
            <Play className="w-4 h-4 text-zt-primary" aria-hidden="true" />
            <span className="flex flex-col items-center leading-tight">
              <span>Resume: {resume.meetName}</span>
              <span className="text-[10px] text-zt-muted normal-case font-bold tracking-normal">This phone is a {resume.roleLabel.toLowerCase()}</span>
            </span>
          </a>
        )}

        <a href="/website" className={`${btn} bg-zt-primary text-zt-on-primary`}>
          <Globe className="w-4 h-4" aria-hidden="true" />
          Enter ZeroTacky
        </a>
        <p className="text-[11px] text-zt-muted text-center -mt-2">Find gyms, browse shows, register for meets.</p>

        <a href="/join" className={`${btn} bg-zt-surface-2 border border-zt-border text-zt-text`}>
          <QrCode className="w-4 h-4 text-zt-primary" aria-hidden="true" />
          Join a meet
        </a>
        <p className="text-[11px] text-zt-muted text-center -mt-2">Type the promoter's 6-character code or scan their QR.</p>

        {!resume && (
          <a href="/scorer" className="block text-center text-xs font-bold text-zt-muted py-2">
            Promoter? Open the meet-day scorer
          </a>
        )}
      </div>
    </div>
  );
}
