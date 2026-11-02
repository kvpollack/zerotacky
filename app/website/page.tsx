import type { Metadata } from 'next';
import Link from 'next/link';
import WebsiteShell from '@/components/website/WebsiteShell';
import ShowRows from '@/components/website/ShowRows';
import { Cap, Key, SectionCap, WebCell, textLink } from '@/components/website/sheet';
import { listPublicGyms, listPublicShows } from '@/lib/website/data';
import { canonical, organizationJsonLd, websiteJsonLd } from '@/lib/website/seo';
import JsonLd from '@/components/website/JsonLd';

export const metadata: Metadata = {
  title: 'ZeroTacky — Your one stop for strongman: shows, registration, live scoring, and a gym directory',
  description:
    'Find strongman competitions, run offline-first meets with multi-phone sync, and find gyms with strongman equipment.',
  ...canonical('/website'),
};

// Home sheet (UI transition Phase 3, 11/2; mockup hybrid/web_home.html). Copy is the 10/26 landing page's, reworded
// hero included (Kurt 11/2); only the drawing changed: ruled blocks, ink/line/pen keys, shows as a results table.
export default async function WebsiteLandingPage() {
  const [showsRes, gymsRes] = await Promise.all([listPublicShows(), listPublicGyms()]);
  const shows = showsRes.data ?? [];
  const gyms = gymsRes.data ?? [];

  return (
    <WebsiteShell activeNav="home">
      <JsonLd data={[organizationJsonLd(), websiteJsonLd()]} />

      {/* Hero block: the pitch on the left, the gym-owner aside on the right (Kurt 10/20: the directory ships unclaimed) */}
      <section className="zt-block grid-cols-1 lg:grid-cols-[1fr_420px]">
        <WebCell pad="lg" className="gap-0">
          <Cap>For strongman promoters, judges, pit crew and athletes</Cap>
          <h1 className="text-[28px] sm:text-[40px] leading-[1.1] font-bold mt-1.5 mb-3.5 text-ink">
            Find strongman shows. Run meet day from a phone, no spreadsheet, no Wi-Fi.
          </h1>
          <p className="text-[15px] sm:text-[17px] leading-[1.55] max-w-[760px] text-ink">
            ZeroTacky is a show and gym directory with a scorer that keeps working when the venue
            Wi-Fi dies. Judges put in reps, times, distances, rising bar heights and stone splits on
            their own phones. Pit crew get the plate stack and the rack pin for every athlete.
            Spectators follow the live scoreboard from the stands.
          </p>
          <p className="text-[15px] leading-[1.55] max-w-[760px] font-bold text-ink mt-3">
            Athletes never pay. Finding shows, following your meets, your profile and the live scoreboard are
            free, and there is no paid tier coming.
          </p>

          {/* Primary Actions: Find a show + Run a meet */}
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 mt-[18px]">
            <Key href="/shows" variant="ink">Find a Show</Key>
            <Key href="/demo" variant="line">Check Out a Demo Show</Key>
            <Key href="/gyms" variant="line">Strongman Gym Directory</Key>
          </div>

          <p className="text-[13px] leading-[1.55] text-ink-muted mt-4 max-w-[760px]">
            <strong className="text-ink">Check Out a Demo Show</strong> opens the meet-day scorer on this device loaded with a made-up show,
            so you can score and edit without touching anything real. To run your own meet, sign in and tap New Meet on{' '}
            <Link href="/promoter" className={textLink}>My Meets</Link>; the{' '}
            <Link href="/how-it-works/first-show" className={textLink}>first-show guide</Link> walks every tab.
          </p>
        </WebCell>

        <WebCell pad="lg" className="gap-3.5">
          <Cap>Gym owners</Cap>
          <h2 className="text-[22px] font-bold leading-tight text-ink">See if your gym is listed, then claim it.</h2>
          <div className="font-sheet text-[56px] leading-none text-pen">{gyms.length}</div>
          <p className="text-sm leading-[1.5] text-ink">
            We listed {gyms.length} strongman and powerlifting gyms from their own websites. Claiming yours lets you fix the details,
            list your implements, and link the shows you host. It is free.
          </p>
          <div className="flex mt-1">
            <Key href="/gyms" variant="pen">Find my gym</Key>
          </div>
        </WebCell>
      </section>

      {/* Grounded Capabilities Grid */}
      <section aria-labelledby="how-it-works-heading">
        <SectionCap id="how-it-works-heading">What ZeroTacky Does Today</SectionCap>
        <div className="zt-block grid-cols-1 md:grid-cols-3">
          <WebCell>
            <Cap className="text-ink font-bold text-[15px] tracking-[0.04em]">Show Pages &amp; Results</Cap>
            <h3 className="text-base font-bold text-ink">One URL Before, During &amp; After the Meet</h3>
            <p className="text-sm leading-[1.5] text-ink-muted">
              Upcoming shows list divisions, event rules, and target weights, supporting both
              traditional weight classes and inclusive strength-based groups like Strongfest.
              Live shows link directly to the public scoreboard, and completed shows display
              finalized podiums and event-by-event breakdowns.
            </p>
          </WebCell>
          <WebCell>
            <Cap className="text-ink font-bold text-[15px] tracking-[0.04em]">Offline-First Meet Scoring</Cap>
            <h3 className="text-base font-bold text-ink">Judge Pad, Pit Crew Calculator &amp; Sync</h3>
            <p className="text-sm leading-[1.5] text-ink-muted">
              Every score is saved locally first and queued for sync. Volunteers join a meet via a
              6-character code on the <Link href="/join" className={textLink}>Join a Meet</Link> page, locking their phone to
              Judge, Pit Crew, or Spectator mode while the promoter manages divisions, events, and
              weights.
            </p>
          </WebCell>
          <WebCell>
            <Cap className="text-ink font-bold text-[15px] tracking-[0.04em]">Strongman Equipment Finder</Cap>
            <h3 className="text-base font-bold text-ink">Know What Equipment a Gym Actually Has</h3>
            <p className="text-sm leading-[1.5] text-ink-muted">
              Browse gyms by equipment (logs, axles, yokes, stones, circus dumbbells, kegs), day-pass
              price, and drop-in policy so traveling athletes know where they can train for upcoming
              events.
            </p>
          </WebCell>
        </div>
      </section>

      {/* Shows as a results table */}
      <section aria-labelledby="sample-shows-heading">
        <SectionCap
          id="sample-shows-heading"
          aside={
            <Link href="/shows" className="text-xs font-bold uppercase tracking-[0.04em] text-ink underline underline-offset-4 decoration-1 hover:text-pen whitespace-nowrap">
              View All ({shows.length}) →
            </Link>
          }
        >
          Shows in the Directory
        </SectionCap>
        <p className="text-[13px] text-ink-muted mb-2.5 -mt-1">
          Includes upcoming inclusive groups, a live show, a completed finalized show with a tied
          podium, and a completed provisional show.
        </p>
        <ShowRows shows={shows.slice(0, 4)} ariaLabelledby="sample-shows-heading" />
      </section>

      {/* Secondary Entry Point: Gym Directory & Account */}
      <section className="zt-block grid-cols-1 md:grid-cols-2">
        <WebCell pad="lg" className="justify-between gap-4">
          <div className="space-y-2">
            <Cap>Strongman Gym Directory</Cap>
            <h2 className="text-[22px] font-bold leading-tight text-ink">Find Gyms With Logs, Stones &amp; Day Passes</h2>
            <p className="text-sm leading-[1.5] text-ink-muted">
              {gymsRes.source === 'live_supabase'
                ? `${gyms.length} strongman and powerlifting gyms with equipment, day-pass and drop-in details, filterable by distance from your zip.`
                : `Explore ${gyms.length} sample strongman gym listings with implement inventories, drop-in hours, and day-pass policies.`}
            </p>
          </div>
          <div className="flex">
            <Key href="/gyms" variant="ink">Browse the Gym Directory →</Key>
          </div>
        </WebCell>
        <WebCell pad="lg" className="justify-between gap-4">
          <div className="space-y-2">
            <Cap>One Account</Cap>
            <h2 className="text-[22px] font-bold leading-tight text-ink">Athlete, Promoter &amp; Gym Owner in One Sign-In</h2>
            <p className="text-sm leading-[1.5] text-ink-muted">
              One person can compete, promote shows, and manage a gym listing. Sign in once to run your
              meets, claim your gym, pick a username and show up in the Athletes list.
            </p>
          </div>
          <div className="flex">
            <Key href="/website/account" variant="line">Open your account →</Key>
          </div>
        </WebCell>
      </section>
    </WebsiteShell>
  );
}
