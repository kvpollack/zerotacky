import type { Metadata } from 'next';
import WebsiteShell from '@/components/website/WebsiteShell';
import GymsBrowser from '@/components/website/GymsBrowser';
import { listPublicGyms } from '@/lib/website/data';
import { collectDistinctImplementTags, collectDistinctStates } from '@/lib/website/filters';
import { sortEquipmentTags } from '@/lib/website/gymEquipment';

export const metadata: Metadata = {
  title: 'Gym Directory — ZeroTacky',
  description:
    'Find gyms with strongman equipment: logs, axles, yokes, Atlas stones, circus dumbbells, and more, with day-pass and drop-in details.',
};

export default async function GymsDirectoryPage() {
  const res = await listPublicGyms();
  const gyms = res.data ?? [];
  const states = collectDistinctStates(gyms);
  const implementTags = sortEquipmentTags(collectDistinctImplementTags(gyms));

  return (
    <WebsiteShell activeNav="gyms">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl sm:text-3xl font-black text-zt-text">
            Gym Directory
          </h1>
          <span className="text-[11px] font-black uppercase px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40">
            Demo Listings ({gyms.length} Gyms)
          </span>
        </div>
        <p className="text-xs sm:text-sm text-zt-text-2 max-w-3xl">
          Find a place to train with real strongman equipment. Filter by distance from your zip, equipment, and day-pass policy;
          anything a gym has not told us shows as <strong>Not provided</strong>. These listings are fictional
          demos. Gym owners adding their own gym is next on the roadmap.
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