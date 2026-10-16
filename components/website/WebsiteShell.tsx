import React from 'react';
import Link from 'next/link';
import { DEFAULT_THEME_ID } from '@/lib/constants';

interface WebsiteShellProps {
  activeNav?: 'home' | 'shows' | 'gyms' | 'account';
  children: React.ReactNode;
}

export default function WebsiteShell({ activeNav, children }: WebsiteShellProps) {
  const navItems: Array<{ id: WebsiteShellProps['activeNav']; label: string; href: string }> = [
    { id: 'home', label: 'Overview', href: '/website' },
    { id: 'shows', label: 'Find a Show', href: '/shows' },
    { id: 'gyms', label: 'Strongman Gyms', href: '/gyms' },
    { id: 'account', label: 'Account Preview', href: '/website/account' },
  ];

  return (
    <div
      data-zt-theme={DEFAULT_THEME_ID}
      className="min-h-screen bg-zt-bg text-zt-text font-sans flex flex-col"
    >
      {/* Top Preview Notice Bar */}
      <div className="bg-zt-surface-2 border-b border-zt-border px-4 py-2 text-xs">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40">
              Website Skeleton Preview
            </span>
            <span className="text-zt-text-2 font-semibold">
              Meet-day scoring at <code className="font-mono text-zt-text">/</code> and volunteer join at{' '}
              <code className="font-mono text-zt-text">/join</code> are untouched.
            </span>
          </div>
          <div className="flex items-center gap-3 font-bold">
            <Link href="/" className="text-zt-primary hover:underline">
              Open Meet-Day App (/)
            </Link>
            <Link href="/join" className="text-zt-text-2 hover:text-zt-text hover:underline">
              Volunteer Join (/join)
            </Link>
          </div>
        </div>
      </div>

      {/* Primary Website Header */}
      <header className="bg-zt-surface/95 backdrop-blur border-b border-zt-border sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/website"
              className="text-base sm:text-lg font-black tracking-wider uppercase text-zt-text flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-zt-primary rounded-lg"
            >
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-zt-primary" aria-hidden="true" />
              <span>ZEROTACKY</span>
            </Link>
            <span className="hidden sm:inline-block text-xs font-bold text-zt-muted">
              Strongman Shows, Live Scoring &amp; Equipment Directory
            </span>
          </div>

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
          </nav>
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
            <div className="font-black uppercase tracking-wider text-zt-text">ZEROTACKY</div>
            <p className="text-zt-muted">
              Offline-first strongman meet scoring, live multi-phone sync, and competition discovery.
            </p>
          </div>
          <div className="flex flex-wrap gap-4 font-bold text-zt-text-2">
            <Link href="/website" className="hover:text-zt-primary">
              Home
            </Link>
            <Link href="/shows" className="hover:text-zt-primary">
              Shows
            </Link>
            <Link href="/gyms" className="hover:text-zt-primary">
              Gyms
            </Link>
            <Link href="/website/account" className="hover:text-zt-primary">
              Account Preview
            </Link>
            <Link href="/" className="hover:text-zt-primary">
              Meet-Day App
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}