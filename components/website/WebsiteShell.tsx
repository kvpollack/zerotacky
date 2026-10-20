import React from 'react';
import Wordmark from '@/components/brand/Wordmark';
import Link from 'next/link';
import WebsiteThemeFrame from './WebsiteThemeFrame';
import WebsiteThemeControls from './WebsiteThemeControls';
import WebsiteAccountChip from './WebsiteAccountChip';
import PromoterNavLink from './PromoterNavLink';
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
    { id: 'join', label: 'Join a Meet', href: '/join' },
    { id: 'gyms', label: 'Gym Directory', href: '/gyms' },
    { id: 'athletes', label: 'Athletes', href: '/athletes' },
    { id: 'account', label: 'Account', href: '/website/account' },
  ];

  return (
    <WebsiteThemeFrame>
      {/* Primary Website Header */}
      <header className="bg-zt-surface/95 backdrop-blur border-b border-zt-border sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/website"
              className="text-base sm:text-lg font-black tracking-wider uppercase text-zt-text flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-zt-primary rounded-lg"
            >
              <Wordmark />
            </Link>
            <span className="hidden sm:inline-block text-xs font-bold text-zt-muted">
              Your one stop for strongman: shows, registration, live scoring, and a gym directory.
            </span>
            {!live && (
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40">
                Website Skeleton Preview
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
          <nav aria-label="Primary website navigation" className="flex items-center gap-1.5 flex-wrap">
            {navItems.map((item) => {
              const isActive = activeNav === item.id;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold uppercase tracking-wide transition border ${
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
          <WebsiteAccountChip />
          <WebsiteThemeControls />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 sm:py-8 space-y-8">
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
          <div className="flex flex-wrap gap-4 font-bold text-zt-text-2">
            <Link href="/website" className="hover:text-zt-primary">
              Home
            </Link>
            <Link href="/how-it-works" className="hover:text-zt-primary">
              How It Works
            </Link>
            <Link href="/shows" className="hover:text-zt-primary">
              Shows
            </Link>
            <Link href="/gyms" className="hover:text-zt-primary">
              Gyms
            </Link>
            <Link href="/athletes" className="hover:text-zt-primary">
              Athletes
            </Link>
            <Link href="/website/account" className="hover:text-zt-primary">
              Account
            </Link>
            <Link href="/scorer" className="hover:text-zt-primary">
              Live Scoring Demo
            </Link>
            <Link href="/legal/terms" className="hover:text-zt-primary">
              Terms
            </Link>
            <Link href="/legal/privacy" className="hover:text-zt-primary">
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </WebsiteThemeFrame>
  );
}
