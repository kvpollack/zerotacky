import type { Metadata } from 'next';
import WebsiteShell from '@/components/website/WebsiteShell';
import PromoterMeetDetailClient from '@/components/promoter/PromoterMeetDetailClient';
import { getFixturePromoterApi } from '@/lib/promoter/fixtureApi';

interface PromoterMeetPageProps {
  params: Promise<{ serverId: string }>;
}

export async function generateMetadata({ params }: PromoterMeetPageProps): Promise<Metadata> {
  const { serverId } = await params;
  const res = await getFixturePromoterApi().getMeet(serverId);
  if (!res.data) {
    return { title: 'Manage Meet — ZeroTacky Promoter' };
  }
  return {
    title: `${res.data.summary.name} — Promoter Dashboard — ZeroTacky`,
  };
}

export default async function PromoterMeetDetailPage({ params }: PromoterMeetPageProps) {
  const { serverId } = await params;
  return (
    <WebsiteShell>
      <PromoterMeetDetailClient serverId={serverId} />
    </WebsiteShell>
  );
}
