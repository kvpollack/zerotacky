import type { Metadata } from 'next';
import Link from 'next/link';
import WebsiteShell from '@/components/website/WebsiteShell';
import { textLink } from '@/components/website/sheet';
import AthletesBrowser from '@/components/website/AthletesBrowser';
import { listPublicAthletes } from '@/lib/website/data';
import { cleanRoleParam, cleanSearchParam, cleanStateParam, collectAthleteStates } from '@/lib/website/athletes';
import { canonical } from '@/lib/website/seo';

// Profiles change when people edit them; a 60 s window keeps the list close to live without a query per visit.
export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Athletes | ZeroTacky',
  description: 'Strongman athletes, promoters, gym owners and trainers who chose to be listed on ZeroTacky.',
  ...canonical('/athletes'),   // filters are query strings; one indexable page
};

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AthletesDirectoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const res = await listPublicAthletes();
  const athletes = res.data ?? [];
  const states = collectAthleteStates(athletes);

  return (
    <WebsiteShell activeNav="athletes">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[28px] sm:text-[34px] font-bold leading-[1.05] text-ink">Athletes</h1>
          <span className="inline-flex items-center border-2 border-rule px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.04em] text-ink whitespace-nowrap">
            {athletes.length} listed{states.length ? ` · ${states.length} state${states.length === 1 ? '' : 's'}` : ''}
          </span>
        </div>
        <p className="text-[15px] leading-relaxed text-ink max-w-3xl">
          People who train, compete, run shows or coach, and chose to be listed. Everyone here opted in from their account
          page and can leave the list any time.{' '}
          <Link href="/website/account" className={textLink}>Add yourself</Link>: pick a
          username and turn on your public profile. Looking for a coach? See the{' '}
          <Link href="/trainers" className={textLink}>Trainers</Link> list.
        </p>
        {res.error && (
          <p className="text-[13px] font-bold text-redpen" role="alert">The directory could not be loaded right now. {res.error}</p>
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
