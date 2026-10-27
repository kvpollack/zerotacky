import type { Metadata } from 'next';
import Link from 'next/link';
import WebsiteShell from '@/components/website/WebsiteShell';
import AthletesBrowser from '@/components/website/AthletesBrowser';
import { listPublicAthletes } from '@/lib/website/data';
import { cleanModeParam, cleanSearchParam, cleanStateParam, collectAthleteStates, filterPublicAthletes } from '@/lib/website/athletes';
import { canonical } from '@/lib/website/seo';

// /trainers (029, ROADMAP s6 tail): the athlete directory filtered to people who ticked "I coach" on their account
// page and turned on a public profile. Same data and the same opt-in; nobody is listed here by accident.
export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Trainers | ZeroTacky',
  description: 'Strongman coaches and trainers with a public ZeroTacky profile, filtered by state and in-person or online coaching.',
  ...canonical('/trainers'),
};

type SearchParams = Record<string, string | string[] | undefined>;

export default async function TrainersDirectoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const res = await listPublicAthletes();
  const trainers = filterPublicAthletes(res.data ?? [], { role: 'trainer' });
  const states = collectAthleteStates(trainers);

  return (
    <WebsiteShell activeNav="athletes">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl sm:text-3xl font-black text-zt-text">Trainers</h1>
          <span className="text-[11px] font-black uppercase px-2.5 py-1 rounded-lg bg-zt-inset text-zt-text-2 border border-zt-border">
            {trainers.length} listed{states.length ? ` • ${states.length} state${states.length === 1 ? '' : 's'}` : ''}
          </span>
        </div>
        <p className="text-xs sm:text-sm text-zt-text-2 max-w-3xl">
          Coaches who marked themselves as trainers on their ZeroTacky account and chose a public profile. Each card says
          whether they take in-person clients, online clients or both; contact details are whatever they put on their
          profile. ZeroTacky does not vet trainers or handle bookings.{' '}
          <Link href="/website/account" className="font-bold text-zt-primary hover:underline">Coach?</Link> Tick
          &ldquo;I coach&rdquo; on your account page and turn on your public profile to be listed.{' '}
          <Link href="/athletes" className="font-bold text-zt-primary hover:underline">Everyone listed</Link>.
        </p>
        {res.error && (
          <p className="text-xs font-bold text-red-400" role="alert">The directory could not be loaded right now. {res.error}</p>
        )}
      </div>

      <AthletesBrowser
        initialAthletes={trainers}
        availableStates={states}
        initialState={cleanStateParam(sp.state)}
        initialSearch={cleanSearchParam(sp.q)}
        fixedRole="trainer"
        initialMode={cleanModeParam(sp.mode)}
      />
    </WebsiteShell>
  );
}
