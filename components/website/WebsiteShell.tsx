import React from 'react';
import Link from 'next/link';
import Wordmark from '@/components/brand/Wordmark';
import StoneMark from '@/components/sheet/StoneMark';
import WebsiteThemeFrame from './WebsiteThemeFrame';
import WebsiteAccountChip from './WebsiteAccountChip';
import PromoterNavLink from './PromoterNavLink';
import NavActiveScroll from './NavActiveScroll';
import { ModeToggle } from './SheetMode';
import { Cap, NAV_LINK, navClass } from './sheet';
import { readSyncEnv } from '@/lib/sync/client';
import type { ZtTheme } from '@/lib/website/theme';
import pkg from '@/package.json';

// The public website shell in the sheet grammar (UI transition Phase 3, 11/2; mockups hybrid/web_home.html and
// web_show.html). One page frame on the grey ground; the header is a ruled strip (wordmark cell, nav as ruled cells
// with the active one filled in ink, then Mode / Join a Meet / Account); the footer is a title block with the stone
// in the logo cell. Copy is unchanged from the 10/26 shell; only the drawing changed. Phones (MS-13): the wordmark
// row keeps the meet-day actions, the nav is one scrolling row underneath (LT-07 scrolls the active item into view).
interface WebsiteShellProps {
  activeNav?: 'home' | 'how' | 'shows' | 'join' | 'gyms' | 'athletes' | 'account' | 'promoter';
  brand?: ZtTheme | null;   // 030: a gym's or show's own colours; Phase 3: they reach the promoter slots only
  /** SHEET field of the footer title block, e.g. "Show · all-out-strongfest-2026". Defaults to the active nav label. */
  sheet?: string;
  children: React.ReactNode;
}

const NAV_ITEMS: Array<{ id: NonNullable<WebsiteShellProps['activeNav']>; label: string; href: string }> = [
  { id: 'home', label: 'Home', href: '/website' },
  { id: 'how', label: 'How It Works', href: '/how-it-works' },
  { id: 'shows', label: 'Find a Show', href: '/shows' },
  { id: 'gyms', label: 'Gym Directory', href: '/gyms' },
  { id: 'athletes', label: 'Athletes', href: '/athletes' },
];
const SHEET_NAMES: Record<NonNullable<WebsiteShellProps['activeNav']>, string> = {
  home: 'Home', how: 'How it works', shows: 'Shows', join: 'Join a meet', gyms: 'Gyms', athletes: 'Athletes', account: 'Account', promoter: 'My meets',
};
const FOOTER_LINKS: Array<{ label: string; href: string }> = [
  { label: 'Home', href: '/website' },
  { label: 'How It Works', href: '/how-it-works' },
  { label: 'Shows', href: '/shows' },
  { label: 'Gyms', href: '/gyms' },
  { label: 'Athletes', href: '/athletes' },
  { label: 'Trainers', href: '/trainers' },
  { label: 'Account', href: '/website/account' },
  { label: 'Live Scoring Demo', href: '/scorer' },
  { label: 'Terms', href: '/legal/terms' },
  { label: 'Privacy', href: '/legal/privacy' },
];
const TAGLINE = 'Your one stop for strongman: shows, registration, live scoring, and a gym directory.';

// header cells: 56 px tall; nav links from ./sheet (NAV_LINK / navClass)
const CELL = 'bg-sheet flex items-center h-14 min-w-0';

export default function WebsiteShell({ activeNav, brand = null, sheet, children }: WebsiteShellProps) {
  // Astra gate STYLE: the amber "preview" badge belongs to fixture-only builds. With a backend configured the site is
  // showing real listings, so the bar is a plain pointer to the meet-day app.
  const live = readSyncEnv() !== null;
  const sheetName = sheet ?? (activeNav ? SHEET_NAMES[activeNav] : 'Page');
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  const rev = `v${pkg.version}${sha ? ` · ${sha}` : ''}`;
  const year = new Date().getFullYear();

  return (
    <WebsiteThemeFrame brand={brand} sheet>
      {/* MS-13: keyboard users jump past the header */}
      <a href="#zt-main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-ink focus:text-sheet focus:text-xs focus:font-bold focus:uppercase">
        Skip to content
      </a>

      {/* the page frame on the ground */}
      <div className="flex-1 flex flex-col min-w-0 p-2 sm:p-4 lg:p-6">
        <div className="flex-1 flex flex-col min-w-0 bg-sheet border-2 border-rule">
          {/* header strip: a ruled block, 1 px rules drawn as grid gaps over the rule colour */}
          <header className="sticky top-0 z-20 border-b-2 border-rule">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] lg:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] 2xl:grid-cols-[260px_minmax(0,1fr)_auto_auto_auto] gap-px bg-rule">
              <div className={`${CELL} gap-3 px-3 2xl:px-[18px] overflow-hidden`}>
                <Link
                  href="/website"
                  className="text-[20px] sm:text-[26px] text-ink no-underline focus:outline-none focus-visible:outline-2 focus-visible:outline-pen focus-visible:outline-offset-2"
                >
                  <Wordmark />
                </Link>
                {!live && (
                  <span className="hidden xl:inline text-[11px] uppercase tracking-[0.06em] text-ink-muted">
                    Website Skeleton Preview
                  </span>
                )}
              </div>

              {/* nav: full-width row on phones (order-last), the second cell from lg up. Scrolls at every width so a
                  1024-1440 laptop (or a signed-in promoter's extra link) never pushes links under the Mode cell. */}
              <div className={`${CELL} relative col-span-full lg:col-span-1 order-last lg:order-none border-t border-rule lg:border-t-0`}>
                <nav
                  id="zt-primary-nav"
                  aria-label="Primary website navigation"
                  className="flex items-stretch h-14 w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pr-10"
                >
                  {NAV_ITEMS.map((item) => {
                    const isActive = activeNav === item.id;
                    return (
                      <Link key={item.href} href={item.href} aria-current={isActive ? 'page' : undefined} className={navClass(isActive)}>
                        {item.label}
                      </Link>
                    );
                  })}
                  <PromoterNavLink active={activeNav === 'promoter'} />
                </nav>
                {/* LT-07: right-edge fade says the row scrolls (invisible over empty sheet when everything fits) */}
                <div aria-hidden="true" className="pointer-events-none absolute right-0 inset-y-0 w-10 bg-gradient-to-l from-sheet to-transparent" />
                <NavActiveScroll navId="zt-primary-nav" active={activeNav} />
              </div>

              <div className={CELL}>
                <ModeToggle />
              </div>
              <div className={CELL}>
                <Link
                  href="/join"
                  aria-current={activeNav === 'join' ? 'page' : undefined}
                  className={`${NAV_LINK} border-r-0 ${activeNav === 'join' ? 'bg-ink text-sheet' : 'text-ink hover:bg-ground'}`}
                >
                  <span className="sm:hidden">Join</span>
                  <span className="hidden sm:inline">Join a Meet</span>
                </Link>
              </div>
              <div className={`${CELL} gap-2 pr-2`}>
                <WebsiteAccountChip />
                <Link
                  href="/website/account"
                  aria-current={activeNav === 'account' ? 'page' : undefined}
                  className={`${NAV_LINK} border-r-0 ${activeNav === 'account' ? 'bg-ink text-sheet' : 'text-ink-muted hover:text-ink hover:bg-ground'}`}
                >
                  Account
                </Link>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main id="zt-main" tabIndex={-1} className="flex-1 w-full min-w-0 px-3 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7 flex flex-col gap-7 focus:outline-none">
            {children}
          </main>

          {/* Footer = title block. Fields: TITLE, SHEET, REV, STATUS; links, OPERATOR, UNITS, COPY. */}
          <footer className="mt-10 zt-block border-x-0 border-b-0 grid-cols-2 lg:grid-cols-[90px_1fr_220px_220px_160px_120px] lg:grid-rows-2 text-[15px]">
            <div className="hidden lg:flex items-center justify-center row-span-2 text-ink">
              <StoneMark size={48} stroke={7} title="ZeroTacky" />
            </div>
            <div className="flex flex-col justify-center px-3.5 py-2.5 col-span-2 lg:col-span-2 min-h-[60px]">
              <Cap className="text-[11px] mb-0.5">Title</Cap>
              <div className="font-bold leading-snug">
                <Wordmark className="text-[18px] mr-2" />
                <span className="font-normal text-[13px] text-ink-muted">{TAGLINE}</span>
              </div>
            </div>
            <div className="flex flex-col justify-center px-3.5 py-2.5 min-h-[60px]">
              <Cap className="text-[11px] mb-0.5">Sheet</Cap>
              <div className="font-bold text-[13px] leading-snug break-all">{sheetName}</div>
            </div>
            <div className="flex flex-col justify-center px-3.5 py-2.5 min-h-[60px]">
              <Cap className="text-[11px] mb-0.5">Rev</Cap>
              <div className="font-bold font-sheet truncate">{rev}</div>
            </div>
            <div className="flex flex-col justify-center px-3.5 py-2.5 min-h-[60px] col-span-2 lg:col-span-1">
              <Cap className="text-[11px] mb-0.5">Status</Cap>
              <div className="font-bold">Public</div>
            </div>
            <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-3.5 gap-y-1 px-3.5 py-2.5 col-span-2 lg:col-span-2 min-h-[60px]">
              {FOOTER_LINKS.map((l) => (
                <Link key={l.href} href={l.href} className="inline-flex items-center min-h-[32px] text-xs uppercase tracking-[0.04em] text-ink no-underline border-b border-rule hover:text-pen hover:border-pen">
                  {l.label}
                </Link>
              ))}
            </nav>
            <div className="flex flex-col justify-center px-3.5 py-2.5 min-h-[60px]">
              <Cap className="text-[11px] mb-0.5">Operator</Cap>
              <a href="mailto:privacy@zerotacky.com" className="font-bold text-[13px] text-ink no-underline hover:text-pen truncate">privacy@zerotacky.com</a>
            </div>
            <div className="flex flex-col justify-center px-3.5 py-2.5 min-h-[60px]">
              <Cap className="text-[11px] mb-0.5">Units</Cap>
              <div className="font-bold">lb / kg</div>
            </div>
            <div className="flex flex-col justify-center px-3.5 py-2.5 min-h-[60px] col-span-2 lg:col-span-1">
              <Cap className="text-[11px] mb-0.5">Copy</Cap>
              <div className="font-bold font-sheet">© {year}</div>
            </div>
          </footer>
        </div>
      </div>
    </WebsiteThemeFrame>
  );
}
