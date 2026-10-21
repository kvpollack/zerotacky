import type { Metadata } from 'next';
import ScoreboardClient from './ScoreboardClient';
import { getScoreboardMeta } from '@/lib/website/data';
import { canonical } from '@/lib/website/seo';

// The server asks for the meet that owns the slug (real first, demo fixture second: Astra R-M6) so the title and the
// share card match the board; ScoreboardClient still sets document.title once the live data arrives.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const meta = await getScoreboardMeta(slug);
  const title = meta ? `${meta.name} — Live Scoreboard | ZeroTacky` : 'Live Scoreboard | ZeroTacky';
  const description = 'Standings, event results and who is up next, updating as judges score.';
  return {
    title,
    description,
    openGraph: { title, description, type: 'website', siteName: 'ZeroTacky', url: `/m/${slug}` , images: ['/og.png'] },
    twitter: { card: 'summary_large_image', title, description },
    ...canonical(`/m/${slug}`),
  };
}

export default async function ScoreboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ScoreboardClient slug={slug} />;
}
