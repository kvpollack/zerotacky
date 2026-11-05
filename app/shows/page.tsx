import type { Metadata } from 'next';
import WebsiteShell from '@/components/website/WebsiteShell';
import ShowsBrowser from '@/components/website/ShowsBrowser';
import { listPublicShows } from '@/lib/website/data';
import { collectDistinctImplementTags, collectDistinctStates } from '@/lib/website/filters';
import Link from 'next/link';
import { canonical } from '@/lib/website/seo';
import { textLink } from '@/components/website/sheet';

export const metadata: Metadata = {
  title: 'Find a Strongman Show | ZeroTacky',
  description:
    'Search upcoming, live, and completed strongman competitions by state, status, implements, and division format.',
  ...canonical('/shows'),
};

// Listed meets come from Supabase when configured (lib/website/data.ts). Re-rendered at most once a minute so a
// promoter's listing save shows up without a redeploy; the Listing tab's saved notice promises exactly that.
export const revalidate = 60;

export default async function ShowsDirectoryPage() {
  const result = await listPublicShows();
  const live = result.source === 'live_supabase';
  const shows = result.data ?? [];
  const states = collectDistinctStates(shows);
  const implementTags = collectDistinctImplementTags(shows);

  return (
    <WebsiteShell activeNav="shows">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[28px] sm:text-[34px] font-bold leading-[1.05] text-ink">Strongman Shows</h1>
          {live ? (
            <span className="inline-flex items-center border-2 border-rule px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.04em] text-ink whitespace-nowrap">
              {shows.length} listed {shows.length === 1 ? 'show' : 'shows'}
            </span>
          ) : (
            <span className="inline-flex items-center border-2 border-rule px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.04em] text-ink whitespace-nowrap border-dashed">
              Demo directory fixtures ({shows.length} shows)
            </span>
          )}
        </div>
        <p className="text-[15px] leading-relaxed text-ink max-w-3xl">
          Filter competitions by status, state, or specific strongman implements. Supports both
          inclusive strength-based groups (such as Strongfest Groups 1–5) and traditional weight
          classes.
        </p>
        <p className="text-[15px] leading-relaxed text-ink">
          Running a show that registers somewhere else?{' '}
          <Link href="/shows/submit" className={textLink}>
            List it here
          </Link>{' '}
          and the calendar links out to your registration page.
        </p>
      </div>

      {result.error ? (
        <div
          role="alert"
          className="border-2 border-redpen text-redpen px-5 py-4 text-[15px] font-bold"
        >
          Could not load shows: {result.error}
        </div>
      ) : (
        <ShowsBrowser
          initialShows={shows}
          availableStates={states}
          availableImplements={implementTags}
        />
      )}
    </WebsiteShell>
  );
}