import type { Metadata } from 'next';
import Link from 'next/link';
import { Calendar, Dumbbell, Play, Radio, ShieldCheck, Trophy } from 'lucide-react';
import WebsiteShell from '@/components/website/WebsiteShell';
import { listPublicGyms, listPublicShows } from '@/lib/website/data';
import { describeShowLifecycle } from '@/lib/website/filters';

export const metadata: Metadata = {
  title: 'ZeroTacky — Your one stop for strongman: shows, registration, live scoring, and a gym directory',
  description:
    'Find strongman competitions, run offline-first meets with multi-phone sync, and locate gyms with strongman implements.',
};

export default async function WebsiteLandingPage() {
  const [showsRes, gymsRes] = await Promise.all([listPublicShows(), listPublicGyms()]);
  const shows = showsRes.data ?? [];
  const gyms = gymsRes.data ?? [];

  return (
    <WebsiteShell activeNav="home">
      {/* Hero Section */}
      <section className="bg-zt-surface border border-zt-border rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="space-y-3 max-w-3xl">
          <div className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-zt-primary bg-zt-inset border border-zt-border px-3 py-1 rounded-full">
            <span>Built for Strongman Promoters, Judges, Pit Crew &amp; Athletes</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-zt-text">
            Find strongman competitions. Run meet day without spreadsheets or Wi-Fi failures.
          </h1>
          <p className="text-sm sm:text-base text-zt-text-2 leading-relaxed">
            ZeroTacky pairs a public competition and strongman gym directory with an offline-first
            meet-day scoring engine. Judges score reps, times, distances, rising bars, and stone
            splits on their phones; pit crew gets exact plate stacks and rack pin callouts; spectators
            watch a live public scoreboard.
          </p>
        </div>

        {/* Primary Actions: Find a show + Run a meet */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
          <Link
            href="/shows"
            className="px-6 py-4 rounded-xl bg-zt-primary text-zt-on-primary font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg hover:opacity-95 transition"
          >
            <Calendar className="w-4 h-4" aria-hidden="true" />
            Find a Show
          </Link>

          <Link
            href="/scorer"
            className="px-6 py-4 rounded-xl bg-zt-surface-2 border-2 border-zt-border-strong text-zt-text font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 hover:border-zt-primary transition"
          >
            <Play className="w-4 h-4 text-zt-primary" aria-hidden="true" />
            Run a Meet (Open Scorer)
          </Link>

          <Link
            href="/gyms"
            className="px-4 py-4 rounded-xl bg-zt-inset border border-zt-border text-zt-text-2 font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:text-zt-text transition sm:ml-auto"
          >
            <Dumbbell className="w-4 h-4 text-zt-secondary" aria-hidden="true" />
            Strongman Gym Directory
          </Link>
        </div>

        <p className="text-xs font-semibold text-zt-muted">
          Note: Opening <strong>Run a Meet</strong> launches the meet-day scorer on this device using
          whatever meet is currently stored in local device memory (or the default demo preset).
        </p>
      </section>

      {/* Grounded Capabilities Grid */}
      <section aria-labelledby="how-it-works-heading" className="space-y-3">
        <h2
          id="how-it-works-heading"
          className="text-sm font-black uppercase tracking-wider text-zt-primary"
        >
          What ZeroTacky Does Today
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-zt-surface border border-zt-border rounded-2xl p-5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-black uppercase text-zt-primary">
              <Trophy className="w-4 h-4" aria-hidden="true" />
              <span>Show Pages &amp; Results</span>
            </div>
            <h3 className="text-base font-black text-zt-text">
              One URL Before, During &amp; After the Meet
            </h3>
            <p className="text-xs text-zt-text-2 leading-relaxed">
              Upcoming shows list divisions, event rules, and target weights—supporting both
              traditional weight classes and inclusive strength-based groups like Strongfest.
              Live shows link directly to the public scoreboard, and completed shows display
              finalized podiums and event-by-event breakdowns.
            </p>
          </div>

          <div className="bg-zt-surface border border-zt-border rounded-2xl p-5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-black uppercase text-zt-primary">
              <Radio className="w-4 h-4" aria-hidden="true" />
              <span>Offline-First Meet Scoring</span>
            </div>
            <h3 className="text-base font-black text-zt-text">
              Judge Pad, Pit Crew Calculator &amp; Sync
            </h3>
            <p className="text-xs text-zt-text-2 leading-relaxed">
              Every score is saved locally first and queued for sync. Volunteers join a meet via a
              6-character code on the <Link href="/join" className="text-zt-primary font-bold underline">Join a Meet</Link> page, locking their phone to
              Judge, Pit Crew, or Spectator mode while the promoter manages divisions, events, and
              weights.
            </p>
          </div>

          <div className="bg-zt-surface border border-zt-border rounded-2xl p-5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-black uppercase text-zt-secondary">
              <Dumbbell className="w-4 h-4" aria-hidden="true" />
              <span>Strongman Equipment Finder</span>
            </div>
            <h3 className="text-base font-black text-zt-text">
              Know What Implements a Gym Actually Has
            </h3>
            <p className="text-xs text-zt-text-2 leading-relaxed">
              Browse gyms by strongman implement tags (logs, axles, yokes, stones, circus dumbbells,
              kegs), day-pass price, and drop-in policy so traveling athletes know where they can
              train for upcoming events.
            </p>
          </div>
        </div>
      </section>

      {/* Featured Demo Shows Preview */}
      <section aria-labelledby="sample-shows-heading" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2
              id="sample-shows-heading"
              className="text-sm font-black uppercase tracking-wider text-zt-primary"
            >
              Sample Shows in the Directory (Demo Fixtures)
            </h2>
            <p className="text-xs text-zt-muted">
              Includes upcoming inclusive groups, a live show, a completed finalized show with a tied
              podium, and a completed provisional show.
            </p>
          </div>
          <Link
            href="/shows"
            className="text-xs font-extrabold uppercase text-zt-primary hover:underline whitespace-nowrap"
          >
            View All ({shows.length}) →
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {shows.slice(0, 4).map((show) => {
            const life = describeShowLifecycle(
              show.competitionStatus,
              show.registrationStatus,
              show.resultsStatus
            );
            return (
              <Link
                key={show.id}
                href={`/shows/${show.slug}`}
                className="bg-zt-surface border border-zt-border hover:border-zt-primary rounded-2xl p-4 space-y-2.5 transition block"
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                        show.competitionStatus === 'live'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : show.competitionStatus === 'upcoming'
                          ? 'bg-zt-primary/20 text-zt-primary-2 border border-zt-primary/40'
                          : show.competitionStatus === 'completed'
                          ? 'bg-zt-surface-2 text-zt-text border border-zt-border-strong'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      }`}
                    >
                      {life.competitionLabel}
                    </span>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-zt-inset border border-zt-border text-zt-text-2">
                      {life.resultsLabel}
                    </span>
                  </div>
                  {show.isDemoFixture && (
                    <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40">
                      Demo
                    </span>
                  )}
                </div>

                <div>
                  <h3 className="text-base font-black text-zt-text">{show.name}</h3>
                  <div className="text-xs font-bold text-zt-muted mt-0.5">
                    {show.date} • {show.venue.facilityName ? `${show.venue.facilityName}, ` : ''}
                    {show.venue.city}, {show.venue.state}
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {show.implementTags.slice(0, 4).map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] font-bold px-2 py-0.5 rounded bg-zt-inset border border-zt-border text-zt-text-2"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Secondary Entry Point: Strongman Gyms & Account Preview */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-zt-surface border border-zt-border rounded-2xl p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-1.5">
            <div className="text-xs font-black uppercase tracking-wider text-zt-secondary flex items-center gap-1.5">
              <Dumbbell className="w-4 h-4" aria-hidden="true" />
              <span>Strongman Gym Directory</span>
            </div>
            <h2 className="text-lg font-black text-zt-text">
              Find Gyms With Logs, Stones &amp; Day Passes
            </h2>
            <p className="text-xs text-zt-text-2 leading-relaxed">
              Explore {gyms.length} sample strongman gym listings with implement inventories, drop-in
              hours, and day-pass policies.
            </p>
          </div>
          <div>
            <Link
              href="/gyms"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zt-secondary text-zt-on-secondary font-black text-xs uppercase tracking-wider"
            >
              Browse Strongman Gyms →
            </Link>
          </div>
        </div>

        <div className="bg-zt-surface border border-zt-border rounded-2xl p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-1.5">
            <div className="text-xs font-black uppercase tracking-wider text-zt-primary flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" aria-hidden="true" />
              <span>Unified Account Preview</span>
            </div>
            <h2 className="text-lg font-black text-zt-text">
              Athlete, Promoter &amp; Gym Owner Capabilities
            </h2>
            <p className="text-xs text-zt-text-2 leading-relaxed">
              One person can compete, promote shows, and manage a gym listing. Preview the dashboard
              concepts with a Demo Persona switcher without touching meet-day device state.
            </p>
          </div>
          <div>
            <Link
              href="/website/account"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zt-inset border border-zt-border-strong text-zt-text font-black text-xs uppercase tracking-wider hover:border-zt-primary"
            >
              Open Account Preview →
            </Link>
          </div>
        </div>
      </section>
    </WebsiteShell>
  );
}