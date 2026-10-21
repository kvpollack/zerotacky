import type { Metadata } from 'next';
import WebsiteShell from '@/components/website/WebsiteShell';
import ShowsBrowser from '@/components/website/ShowsBrowser';
import { listPublicShows } from '@/lib/website/data';
import { collectDistinctImplementTags, collectDistinctStates } from '@/lib/website/filters';
import { canonical } from '@/lib/website/seo';

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
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl sm:text-3xl font-black text-zt-text">Strongman Shows</h1>
          {live ? (
            <span className="text-[11px] font-black uppercase px-2.5 py-1 rounded-lg bg-zt-inset text-zt-text-2 border border-zt-border">
              {shows.length} Listed {shows.length === 1 ? 'Show' : 'Shows'}
            </span>
          ) : (
            <span className="text-[11px] font-black uppercase px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40">
              Demo Directory Fixtures ({shows.length} Shows)
            </span>
          )}
        </div>
        <p className="text-xs sm:text-sm text-zt-text-2 max-w-3xl">
          Filter competitions by status, state, or specific strongman implements. Supports both
          inclusive strength-based groups (such as Strongfest Groups 1–5) and traditional weight
          classes.
        </p>
      </div>

      {result.error ? (
        <div
          role="alert"
          className="bg-zt-danger/15 border border-zt-danger text-zt-danger-text rounded-2xl p-5 text-sm font-bold"
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