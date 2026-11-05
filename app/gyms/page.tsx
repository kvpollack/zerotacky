import type { Metadata } from 'next';
import WebsiteShell from '@/components/website/WebsiteShell';
import GymsBrowser from '@/components/website/GymsBrowser';
import { getPublicShowBySlug, listPublicGyms } from '@/lib/website/data';
import { showTrainingNeeds, trainForEligible } from '@/lib/website/trainFor';
import { collectDistinctImplementTags, collectDistinctStates } from '@/lib/website/filters';
import { sortEquipmentTags } from '@/lib/website/gymEquipment';
import { canonical } from '@/lib/website/seo';
import { cleanSearchParam, cleanStateParam } from '@/lib/website/athletes';

// Directory rows are loaded by scripts outside deploys; refresh every 5 min.
export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Gym Directory | ZeroTacky',
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
  // Train for this show (build 4, 11/5): /gyms?show=<slug> ranks gyms by the show's event implements.
  const showSlug = cleanSearchParam(sp.show);
  const showRes = showSlug ? await getPublicShowBySlug(showSlug) : null;
  // Unlisted meets resolve here through the results-retention rule; they never drive the directory (Astra BR-01).
  const trainFor = showRes?.data && trainForEligible(showRes.data)
    ? { slug: showRes.data.slug, name: showRes.data.name, date: showRes.data.date, needs: showTrainingNeeds(showRes.data.state.events) }
    : null;

  return (
    <WebsiteShell activeNav="gyms">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[28px] sm:text-[34px] font-bold leading-[1.05] text-ink">
            Gym Directory
          </h1>
          {live ? (
            <span className="inline-flex items-center border-2 border-rule px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.04em] text-ink whitespace-nowrap">
              {gyms.length} gyms · {states.filter((s) => s !== 'DC').length} states{states.includes('DC') ? ' + DC' : ''}
            </span>
          ) : (
            <span className="inline-flex items-center border-2 border-rule px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.04em] text-ink whitespace-nowrap border-dashed">
              Demo listings ({gyms.length} gyms)
            </span>
          )}
        </div>
        <p className="text-[15px] leading-relaxed text-ink max-w-3xl">
          Strongman and powerlifting gyms you can actually train at. Filter by distance from your zip, equipment, and day-pass policy.
          Missing details are marked <strong>Not provided</strong>.{' '}
          {live
            ? 'Each listing was built from the gym\u2019s own website and stays marked Unclaimed until the owner takes it over. Gym owner? Open your gym and tap Claim this gym.'
            : 'These listings are fictional demos; gym owners adding their own gym is next on the roadmap.'}
        </p>
        {res.error && (
          <p className="text-[13px] font-bold text-redpen" role="alert">The directory could not be loaded right now. {res.error}</p>
        )}
      </div>

      <GymsBrowser
        initialGyms={gyms}
        availableStates={states}
        availableImplements={implementTags}
        initialSearch={cleanSearchParam(sp.q)}
        initialState={cleanStateParam(sp.state)}
        trainFor={trainFor}
      />
    </WebsiteShell>
  );
}