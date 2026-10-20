import { getScoreboardMeta } from '@/lib/website/data';
import { OG_SIZE, renderOgCard } from '@/lib/website/og';

export const runtime = 'nodejs';
export const alt = 'Live strongman scoreboard on ZeroTacky';
export const size = OG_SIZE;
export const contentType = 'image/png';

// Real meet first, demo fixture second (Astra R-M6); an unknown slug gets a readable title and no badge.
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const meta = await getScoreboardMeta(slug);
  const name = meta?.name ?? slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return renderOgCard({
    kicker: 'Live scoreboard',
    title: name,
    lines: ['Standings, event results and who is up next', 'Updates as judges score'],
    badge: meta?.badge,
  });
}
