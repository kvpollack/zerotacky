import type { Metadata } from 'next';
import WebsiteShell from '@/components/website/WebsiteShell';
import ImportArchiveClient from '@/components/promoter/ImportArchiveClient';
import { NOINDEX } from '@/lib/website/seo';

export const metadata: Metadata = {
  title: 'Import a past show | ZeroTacky',
  description: 'Bring a past show from the results archive onto your ZeroTacky account as a completed meet.',
  ...NOINDEX,
};

// 053: ?gym=<id> preselects the host gym (the My Gym page links here).
export default async function ImportArchivePage({ searchParams }: { searchParams: Promise<{ gym?: string }> }) {
  const { gym } = await searchParams;
  return (
    <WebsiteShell activeNav="promoter">
      <ImportArchiveClient initialGymId={typeof gym === 'string' ? gym : ''} />
    </WebsiteShell>
  );
}
