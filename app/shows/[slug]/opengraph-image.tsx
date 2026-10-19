import { getPublicShowBySlug } from '@/lib/website/data';
import { OG_SIZE, registrationLine, renderOgCard } from '@/lib/website/og';

export const runtime = 'nodejs';
export const alt = 'Strongman show on ZeroTacky';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const res = await getPublicShowBySlug(slug);
  const show = res.data;
  if (!show) {
    return renderOgCard({ kicker: 'Strongman show', title: 'Show not found', lines: ['This listing has been removed or the link is wrong.'] });
  }
  const where = [show.venue.facilityName, show.venue.city, show.venue.state].filter(Boolean).join(', ');
  const lines = [show.date, where, registrationLine(show.registration.status)].filter(Boolean);
  return renderOgCard({
    kicker: `Strongman show · ${show.venue.city}, ${show.venue.state}`,
    title: show.name,
    lines,
    badge: show.isDemoFixture ? 'DEMO' : show.competitionStatus === 'live' ? 'LIVE' : undefined,
  });
}
