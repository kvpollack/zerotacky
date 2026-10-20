import type { Metadata } from 'next';
import Link from 'next/link';
import WebsiteShell from '@/components/website/WebsiteShell';
import AthletesBrowser from '@/components/website/AthletesBrowser';
import { listPublicAthletes } from '@/lib/website/data';
import { cleanRoleParam, cleanSearchParam, cleanStateParam, collectAthleteStates } from '@/lib/website/athletes';

// Profiles change when people edit them; a 60 s window keeps the list close to live without a query per visit.
export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Athletes — ZeroTacky',
  description: 'Strongman athletes, promoters, gym owners and trainers who chose to be listed on ZeroTacky.',
};

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AthletesDirectoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const res = await listPublicAthletes();
  const athletes = res.data ?? [];
  const states = collectAthleteStates(athletes);

  return (
    <WebsiteShell activeNav="athletes">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl sm:text-3xl font-black text-zt-text">Athletes</h1>
          <span className="text-[11px] font-black uppercase px-2.5 py-1 rounded-lg bg-zt-inset text-zt-text-2 border border-zt-border">
            {athletes.length} listed{states.length ? ` • ${states.length} state${states.length === 1 ? '' : 's'}` : ''}
          </span>
        </div>
        <p className="text-xs sm:text-sm text-zt-text-2 max-w-3xl">
          People who train, compete, run shows or coach, and chose to be listed. Everyone here opted in from their account
          page and can leave the list any time.{' '}
          <Link href="/website/account" className="font-bold text-zt-primary hover:underline">Add yourself</Link>: pick a
          username and turn on your public profile.
        </p>
        {res.error && (
          <p className="text-xs font-bold text-red-400" role="alert">The directory could not be loaded right now. {res.error}</p>
        )}
      </div>

      <AthletesBrowser
        initialAthletes={athletes}
        availableStates={states}
        initialState={cleanStateParam(sp.state)}
        initialRole={cleanRoleParam(sp.role)}
        initialSearch={cleanSearchParam(sp.q)}
      />
    </WebsiteShell>
  );
}
