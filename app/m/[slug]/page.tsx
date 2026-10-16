import ScoreboardClient from './ScoreboardClient';

export default async function ScoreboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ScoreboardClient slug={slug} />;
}
