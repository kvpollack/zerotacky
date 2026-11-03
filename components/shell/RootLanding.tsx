'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Globe, KeyRound, Play } from 'lucide-react';
import Wordmark from '@/components/brand/Wordmark';
import WebsiteThemeFrame from '@/components/website/WebsiteThemeFrame';
import { ModeToggle } from '@/components/website/SheetMode';
import { keyClass } from '@/components/website/sheet';
import { hasResumeLink, readResume, refreshResumeStatus, type ResumeInfo } from '@/lib/landing';
import { createSyncClient, readSyncEnv } from '@/lib/sync/client';

// Root splash. Two doors: the public site (gyms, shows, registration) and the volunteer join flow
// (type the promoter's 6-character code). A phone that already carries a meet gets a
// Resume button on top so judges who open the home-screen icon on meet day land in the scorer in one tap.
// UI transition (Kurt 11/3): drawn in the sheet grammar like the website shell, one small ruled sheet on the ground
// with a wordmark / Mode header strip; the doors are ink and line keys. The old ZEROTACKY cap over the headline went:
// the wordmark in the strip says it.
export default function RootLanding() {
  const [resume, setResume] = useState<ResumeInfo | null>(null);
  useEffect(() => {
    setResume(readResume(localStorage));
    // A meet finalized (or reopened, Astra PS-06) from the website after the scorer last pulled: ask once whenever
    // this phone holds a link, then re-read so the card can disappear or come back.
    if (!hasResumeLink(localStorage)) return;
    const env = readSyncEnv();
    if (!env) return;
    let live = true;
    refreshResumeStatus(localStorage, createSyncClient(env)).then(() => { if (live) setResume(readResume(localStorage)); });
    return () => { live = false; };
  }, []);

  const note = 'text-[13px] text-ink-muted';

  return (
    <WebsiteThemeFrame sheet className="p-2 sm:p-4 lg:p-6 items-center justify-center">
      <main className="w-full max-w-md bg-sheet border-2 border-rule">
        {/* header strip: wordmark cell + Mode cell, 1 px rule drawn as the grid gap */}
        <header className="grid grid-cols-[minmax(0,1fr)_auto] gap-px bg-rule border-b-2 border-rule">
          <div className="bg-sheet flex items-center h-14 px-4 text-[22px] text-ink">
            <Wordmark />
          </div>
          <div className="bg-sheet flex items-center h-14">
            <ModeToggle />
          </div>
        </header>

        {/* body: a ruled block, one row per door */}
        <div className="zt-block border-0">
          <div className="px-5 py-6 sm:px-6 sm:py-7 flex flex-col gap-1.5">
            <h1 className="text-[32px] font-bold leading-none tracking-tight text-ink">Strongman, scored.</h1>
            <p className={note}>Shows, gyms and offline-first meet-day scoring.</p>
          </div>

          {resume && (
            <div className="px-5 py-5 sm:px-6 flex flex-col gap-2">
              <Link href="/scorer" className={keyClass('pen', 'w-full min-h-14 flex-col gap-0 leading-tight py-2')}>
                <span className="inline-flex items-center gap-2.5">
                  <Play className="w-4 h-4" aria-hidden="true" />
                  Resume: {resume.meetName}
                </span>
                <span className="text-[11px] normal-case font-normal tracking-normal opacity-80">This phone is a {resume.roleLabel.toLowerCase()}</span>
              </Link>
            </div>
          )}

          <div className="px-5 py-5 sm:px-6 flex flex-col gap-2">
            <Link href="/website" className={keyClass('ink', 'w-full')}>
              <Globe className="w-4 h-4" aria-hidden="true" />
              Enter ZeroTacky
            </Link>
            <p className={note}>Find gyms, browse shows, register for meets.</p>
          </div>

          <div className="px-5 py-5 sm:px-6 flex flex-col gap-2">
            <Link href="/join" className={keyClass('line', 'w-full')}>
              <KeyRound className="w-4 h-4" aria-hidden="true" />
              Join a meet
            </Link>
            <p className={note}>Type the promoter&apos;s 6-character code.</p>
          </div>
        </div>
      </main>
    </WebsiteThemeFrame>
  );
}
