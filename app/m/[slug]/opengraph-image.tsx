import { getDemoScoreboardState } from '@/lib/website/data';
import { OG_SIZE, renderOgCard } from '@/lib/website/og';

export const runtime = 'nodejs';
export const alt = 'Live strongman scoreboard on ZeroTacky';
export const size = OG_SIZE;
export const contentType = 'image/png';

// Real meets are looked up in the browser, so the card names only demo fixtures; the slug is still readable.
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const demo = getDemoScoreboardState(slug);
  const name = demo?.name ?? slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return renderOgCard({
    kicker: 'Live scoreboard',
    title: name,
    lines: ['Standings, event results and who is up next', 'Updates as judges score'],
    badge: demo ? 'DEMO' : 'LIVE',
  });
}
