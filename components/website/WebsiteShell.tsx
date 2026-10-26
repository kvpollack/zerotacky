import React from 'react';
import Wordmark from '@/components/brand/Wordmark';
import Link from 'next/link';
import WebsiteThemeFrame from './WebsiteThemeFrame';
import WebsiteThemeControls from './WebsiteThemeControls';
import WebsiteAccountChip from './WebsiteAccountChip';
import PromoterNavLink from './PromoterNavLink';
import NavActiveScroll from './NavActiveScroll';
import { readSyncEnv } from '@/lib/sync/client';

interface WebsiteShellProps {
  activeNav?: 'home' | 'how' | 'shows' | 'join' | 'gyms' | 'athletes' | 'account' | 'promoter';
  children: React.ReactNode;
}

export default function WebsiteShell({ activeNav, children }: WebsiteShellProps) {
  // Astra gate STYLE: the amber "preview" badge belongs to fixture-only builds. With a backend configured the site is
  // showing real listings, so the bar is a plain pointer to the meet-day app.
  const live = readSyncEnv() !== null;
  const navItems: Array<{ id: WebsiteShellProps['activeNav']; label: string; href: string }> = [
    { id: 'home', label: 'Home', href: '/website' },
    { id: 'how', label: 'How It Works', href: '/how-it-works' },
    { id: 'shows', label: 'Find a Show', href: '/shows' },
    { id: 'gyms', label: 'Gym Directory', href: '/gyms' },
    { id: 'athletes', label: 'Athletes', href: '/athletes' },
    { id: 'account', label: 'Account', href: '/website/account' },
  ];

  return (
    <WebsiteThemeFrame>
      {/* MS-13: keyboard users jump past the header */}
      <a href="#zt-main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:rounded-xl focus:bg-zt-primary focus:text-zt-on-primary focus:text-xs focus:font-extrabold focus:uppercase">
        Skip to content
      </a>
      {/* Primary Website Header. MS-13 (10/26): two rows on phones instead of a 210 px wrap: wordmark + the meet-day
          actions (account, Join, theme) on the first row, the nav as one horizontally scrolling row below. From sm up
          the old single-row layout wraps as before. */}
      <header className="bg-zt-surface/95 backdrop-blur border-b border-zt-border sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-2.5 sm:py-3.5 flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/website"
              className="text-base sm:text-lg font-black tracking-wider uppercase text-zt-text flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-zt-primary rounded-lg"
            >
              <Wordmark />
            </Link>
            <span className="hidden lg:inline-block text-xs font-bold text-zt-muted">
              Your one stop for strongman: shows, registration, live scoring, and a gym directory.
            </span>
            {!live && (
              <span className="hidden sm:inline text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40">
                Website Skeleton Preview
              </span>
            )}
          </div>

          {/* phones: meet-day actions stay on the wordmark row, far right */}
          <div className="flex items-center gap-2 sm:hidden">
            <WebsiteAccountChip compact />
            <Link
              href="/join"
              aria-current={activeNav === 'join' ? 'page' : undefined}
              className={`px-3 min-h-[44px] inline-flex items-center rounded-xl text-xs font-extrabold uppercase tracking-wide transition border ${
                activeNav === 'join'
                  ? 'bg-zt-primary text-zt-on-primary border-zt-primary'
                  : 'bg-zt-inset text-zt-text-2 border-zt-border hover:border-zt-border-strong'
              }`}
            >
              Join
            </Link>
            <WebsiteThemeControls />
          </div>

          <div className="flex items-center gap-3 flex-wrap w-full sm:w-auto">
          {/* LT-07: the phone row scrolls; the active item is scrolled into view on load and a right-edge fade says there is more */}
          <div className="relative w-full sm:w-auto">
          <nav id="zt-primary-nav" aria-label="Primary website navigation" className="flex items-center gap-1.5 flex-nowrap overflow-x-auto w-full pr-8 sm:pr-0 sm:w-auto sm:flex-wrap sm:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {navItems.map((item) => {
              const isActive = activeNav === item.id;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`px-3 min-h-[44px] inline-flex items-center whitespace-nowrap flex-shrink-0 rounded-xl text-xs font-extrabold uppercase tracking-wide transition border ${
                    isActive
                      ? 'bg-zt-primary text-zt-on-primary border-zt-primary'
                      : 'bg-zt-inset text-zt-text-2 border-zt-border hover:border-zt-border-strong'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <PromoterNavLink active={activeNav === 'promoter'} />
          </nav>
          <div aria-hidden="true" className="sm:hidden pointer-events-none absolute right-0 inset-y-0 w-10 bg-gradient-to-l from-zt-surface to-transparent" />
          <NavActiveScroll navId="zt-primary-nav" active={activeNav} />
          </div>
          {/* sm and up: Kurt 10/21, Join a Meet sits at the far right, next to the theme toggle, as the meet-day action. */}
          <div className="hidden sm:flex items-center gap-3 flex-wrap">
            <WebsiteAccountChip />
            <Link
              href="/join"
              aria-current={activeNav === 'join' ? 'page' : undefined}
              className={`px-3 min-h-[44px] inline-flex items-center rounded-xl text-xs font-extrabold uppercase tracking-wide transition border ${
                activeNav === 'join'
                  ? 'bg-zt-primary text-zt-on-primary border-zt-primary'
                  : 'bg-zt-inset text-zt-text-2 border-zt-border hover:border-zt-border-strong'
              }`}
            >
              Join a Meet
            </Link>
            <WebsiteThemeControls />
          </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="zt-main" tabIndex={-1} className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 sm:py-8 space-y-8 focus:outline-none">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-zt-border bg-zt-surface mt-12 py-6 px-4 text-xs text-zt-muted">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="font-black uppercase tracking-wider text-zt-text"><Wordmark /></div>
            <p className="text-zt-muted">
              Your one stop for strongman: shows, registration, live scoring, and a gym directory.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 font-bold text-zt-text-2">
            <Link href="/website" className="inline-flex items-center min-h-[44px] hover:text-zt-primary">
              Home
            </Link>
            <Link href="/how-it-works" className="inline-flex items-center min-h-[44px] hover:text-zt-primary">
              How It Works
            </Link>
            <Link href="/shows" className="inline-flex items-center min-h-[44px] hover:text-zt-primary">
              Shows
            </Link>
            <Link href="/gyms" className="inline-flex items-center min-h-[44px] hover:text-zt-primary">
              Gyms
            </Link>
            <Link href="/athletes" className="inline-flex items-center min-h-[44px] hover:text-zt-primary">
              Athletes
            </Link>
            <Link href="/website/account" className="inline-flex items-center min-h-[44px] hover:text-zt-primary">
              Account
            </Link>
            <Link href="/scorer" className="inline-flex items-center min-h-[44px] hover:text-zt-primary">
              Live Scoring Demo
            </Link>
            <Link href="/legal/terms" className="inline-flex items-center min-h-[44px] hover:text-zt-primary">
              Terms
            </Link>
            <Link href="/legal/privacy" className="inline-flex items-center min-h-[44px] hover:text-zt-primary">
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </WebsiteThemeFrame>
  );
}
