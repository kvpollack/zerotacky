import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Calendar, Dumbbell, ExternalLink, MapPin } from 'lucide-react';
import WebsiteShell from '@/components/website/WebsiteShell';
import { getPublicGymBySlug, listPublicShows } from '@/lib/website/data';

interface GymDetailPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: GymDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const res = await getPublicGymBySlug(slug);
  if (!res.data) {
    return { title: 'Gym Not Found — ZeroTacky' };
  }
  return {
    title: `${res.data.name} (${res.data.city}, ${res.data.state}) — ZeroTacky`,
    description: `Equipment, day-pass policy, and drop-in details for ${res.data.name}.`,
  };
}

export default async function GymDetailPage({ params }: GymDetailPageProps) {
  const { slug } = await params;
  const [gymRes, showsRes] = await Promise.all([getPublicGymBySlug(slug), listPublicShows()]);
  const gym = gymRes.data;

  if (!gym) notFound();

  const hostedShows = (showsRes.data ?? []).filter((s) =>
    gym.hostedShowSlugs.includes(s.slug)
  );

  return (
    <WebsiteShell activeNav="gyms">
      <div className="space-y-6">
        <div>
          <Link
            href="/gyms"
            className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase text-zt-muted hover:text-zt-text"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            Back to Gym Directory
          </Link>
        </div>

        {/* Header Card */}
        <section className="bg-zt-surface border border-zt-border rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded bg-zt-inset border border-zt-border text-zt-text-2">
              Last Updated: {gym.lastUpdatedDate}
            </span>
            {gym.isDemoListing && (
              <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40">
                Demo Listing (fictional)
              </span>
            )}
          </div>

          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-black text-zt-text">{gym.name}</h1>
            <div className="text-xs sm:text-sm font-bold text-zt-text-2 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-zt-primary" aria-hidden="true" />
              <span>
                {gym.streetAddress ? gym.streetAddress : `${gym.city}, ${gym.state} (Street address: Not provided)`}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-zt-border text-xs">
            <div className="bg-zt-inset border border-zt-border rounded-xl p-3">
              <div className="text-[10px] font-extrabold uppercase text-zt-muted">
                Day-Pass Availability
              </div>
              <div className="text-sm font-black text-zt-text mt-0.5">
                {gym.dayPassAvailability === 'available'
                  ? 'Available'
                  : gym.dayPassAvailability === 'by_appointment'
                  ? 'By Appointment'
                  : gym.dayPassAvailability === 'not_available'
                  ? 'Not Available'
                  : 'Not provided'}
              </div>
              <div className="text-[11px] font-bold text-zt-primary mt-0.5">
                Price: {gym.dayPassPriceDisplay || 'Not provided'}
              </div>
            </div>

            <div className="bg-zt-inset border border-zt-border rounded-xl p-3">
              <div className="text-[10px] font-extrabold uppercase text-zt-muted">
                Drop-In Hours
              </div>
              <div className="text-xs font-bold text-zt-text mt-0.5">
                {gym.dropInHours || 'Not provided'}
              </div>
            </div>

            <div className="bg-zt-inset border border-zt-border rounded-xl p-3">
              <div className="text-[10px] font-extrabold uppercase text-zt-muted">
                Contact &amp; Booking Link
              </div>
              <div className="text-xs font-bold text-zt-text mt-0.5">
                {gym.contactInfo || 'Not provided'}
              </div>
              {gym.dayPassBookingUrl ? (
                <a
                  href={gym.dayPassBookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-black text-zt-primary hover:underline mt-1"
                >
                  Day pass / waiver link
                  <ExternalLink className="w-3 h-3" aria-hidden="true" />
                </a>
              ) : (
                <div className="text-[11px] text-zt-muted mt-1">Booking link: Not provided</div>
              )}
            </div>
          </div>

          <div className="bg-zt-inset border border-zt-border rounded-xl p-3.5 text-xs">
            <span className="font-extrabold uppercase text-zt-muted block mb-1">
              Drop-In &amp; Equipment Policy
            </span>
            <p className="font-semibold text-zt-text-2">
              {gym.dropInPolicy || 'Not provided'}
            </p>
          </div>
        </section>

        {/* Strongman Equipment Breakdown */}
        <section aria-labelledby="gym-equipment-heading" className="space-y-3">
          <h2
            id="gym-equipment-heading"
            className="text-base font-black uppercase tracking-wider text-zt-primary flex items-center gap-2"
          >
            <Dumbbell className="w-4 h-4" aria-hidden="true" />
            <span>Equipment &amp; Specifications ({gym.equipment.length})</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {gym.equipment.map((item) => (
              <div
                key={item.name}
                className="bg-zt-surface border border-zt-border rounded-2xl p-4 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-black text-zt-text">{item.name}</span>
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-zt-inset border border-zt-border text-zt-primary">
                    {item.category}
                  </span>
                </div>
                <p className="text-xs font-semibold text-zt-text-2">
                  {item.details || 'Size/weight range: Not provided'}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Hosted Competitions */}
        <section aria-labelledby="hosted-shows-heading" className="space-y-3">
          <h2
            id="hosted-shows-heading"
            className="text-base font-black uppercase tracking-wider text-zt-text flex items-center gap-2"
          >
            <Calendar className="w-4 h-4 text-zt-primary" aria-hidden="true" />
            <span>Shows Hosted at This Facility ({hostedShows.length})</span>
          </h2>

          {hostedShows.length === 0 ? (
            <p className="text-xs font-bold text-zt-muted bg-zt-surface border border-zt-border rounded-2xl p-4">
              No shows currently linked to this gym listing.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {hostedShows.map((show) => (
                <Link
                  key={show.id}
                  href={`/shows/${show.slug}`}
                  className="bg-zt-surface border border-zt-border hover:border-zt-primary rounded-2xl p-4 space-y-1 transition block"
                >
                  <div className="text-[10px] font-black uppercase text-zt-primary">
                    {show.competitionStatus} • {show.date}
                  </div>
                  <div className="text-base font-black text-zt-text">{show.name}</div>
                  <div className="text-xs text-zt-muted">
                    {show.divisionLabels.length} divisions • {show.implementTags.join(', ')}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </WebsiteShell>
  );
}