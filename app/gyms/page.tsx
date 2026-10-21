import type { Metadata } from 'next';
import WebsiteShell from '@/components/website/WebsiteShell';
import GymsBrowser from '@/components/website/GymsBrowser';
import { listPublicGyms } from '@/lib/website/data';
import { collectDistinctImplementTags, collectDistinctStates } from '@/lib/website/filters';
import { sortEquipmentTags } from '@/lib/website/gymEquipment';
import { canonical } from '@/lib/website/seo';
import { cleanSearchParam, cleanStateParam } from '@/lib/website/athletes';

// Directory rows are loaded by scripts outside deploys; refresh every 5 min.
export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Gym Directory — ZeroTacky',
  description:
    'Find strongman and powerlifting gyms: logs, axles, yokes, Atlas stones, monolifts, calibrated plates, with day-pass and drop-in details.',
  ...canonical('/gyms'),
};

type SearchParams = Record<string, string | string[] | undefined>;

export default async function GymsDirectoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const res = await listPublicGyms();
  const gyms = res.data ?? [];
  const states = collectDistinctStates(gyms);
  const implementTags = sortEquipmentTags(collectDistinctImplementTags(gyms));
  const live = res.source === 'live_supabase';

  return (
    <WebsiteShell activeNav="gyms">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl sm:text-3xl font-black text-zt-text">
            Gym Directory
          </h1>
          {live ? (
            <span className="text-[11px] font-black uppercase px-2.5 py-1 rounded-lg bg-zt-inset text-zt-text-2 border border-zt-border">
              {gyms.length} gyms • {states.filter((s) => s !== 'DC').length} states{states.includes('DC') ? ' + DC' : ''}
            </span>
          ) : (
            <span className="text-[11px] font-black uppercase px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40">
              Demo Listings ({gyms.length} Gyms)
            </span>
          )}
        </div>
        <p className="text-xs sm:text-sm text-zt-text-2 max-w-3xl">
          Strongman and powerlifting gyms you can actually train at. Filter by distance from your zip, equipment, and day-pass policy.
          Missing details are marked <strong>Not provided</strong>.{' '}
          {live
            ? 'Each listing was built from the gym\u2019s own website and stays marked Unclaimed until the owner takes it over. Gym owner? Open your gym and tap Claim this gym.'
            : 'These listings are fictional demos; gym owners adding their own gym is next on the roadmap.'}
        </p>
        {res.error && (
          <p className="text-xs font-bold text-red-400" role="alert">The directory could not be loaded right now. {res.error}</p>
        )}
      </div>

      <GymsBrowser
        initialGyms={gyms}
        availableStates={states}
        availableImplements={implementTags}
        initialSearch={cleanSearchParam(sp.q)}
        initialState={cleanStateParam(sp.state)}
      />
    </WebsiteShell>
  );
}