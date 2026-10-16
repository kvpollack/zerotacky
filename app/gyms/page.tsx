import type { Metadata } from 'next';
import WebsiteShell from '@/components/website/WebsiteShell';
import GymsBrowser from '@/components/website/GymsBrowser';
import { listPublicGyms } from '@/lib/website/data';
import { collectDistinctImplementTags, collectDistinctStates } from '@/lib/website/filters';

export const metadata: Metadata = {
  title: 'Strongman Gym Directory — ZeroTacky',
  description:
    'Find gyms with strongman equipment including logs, axles, yokes, Atlas stones, circus dumbbells, and day-pass policies.',
};

export default async function GymsDirectoryPage() {
  const res = await listPublicGyms();
  const gyms = res.data ?? [];
  const states = collectDistinctStates(gyms);
  const implementTags = collectDistinctImplementTags(gyms);

  return (
    <WebsiteShell activeNav="gyms">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl sm:text-3xl font-black text-zt-text">
            Strongman Gym Directory
          </h1>
          <span className="text-[11px] font-black uppercase px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40">
            Demo Listings ({gyms.length} Gyms)
          </span>
        </div>
        <p className="text-xs sm:text-sm text-zt-text-2 max-w-3xl">
          Search gyms by strongman implement availability (logs, stones, yokes, circus dumbbells,
          kegs), day-pass pricing, and drop-in policy. Unknown details are shown as{' '}
          <strong>Not provided</strong>. Listings are unverified demo fixtures.
        </p>
      </div>

      <GymsBrowser
        initialGyms={gyms}
        availableStates={states}
        availableImplements={implementTags}
      />
    </WebsiteShell>
  );
}