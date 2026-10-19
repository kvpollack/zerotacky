import type { Metadata } from 'next';
import ScoreboardClient from './ScoreboardClient';
import { getDemoScoreboardState } from '@/lib/website/data';

// Real meets are looked up in the browser, so the server title can only name demo fixtures; ScoreboardClient sets
// document.title to the meet name once it loads.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const demo = getDemoScoreboardState(slug);
  return { title: demo ? `${demo.name} — Live Scoreboard — ZeroTacky` : 'Live Scoreboard — ZeroTacky' };
}

export default async function ScoreboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ScoreboardClient slug={slug} />;
}
