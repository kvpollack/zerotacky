import type { Metadata } from 'next';
import WebsiteShell from '@/components/website/WebsiteShell';
import PromoterMeetDetailClient from '@/components/promoter/PromoterMeetDetailClient';

interface PromoterMeetPageProps {
  params: Promise<{ serverId: string }>;
}

// Client-resolved page (M3/M13): the meet is looked up in the browser by PromoterMeetDetailClient because the
// fixture API is per-realm (a meet created in this tab is unknown to the server). Unknown ids therefore return HTTP
// 200 with the client's "Meet not found" state, not a 404, and the title cannot name the meet.
export async function generateMetadata({ params }: PromoterMeetPageProps): Promise<Metadata> {
  const { serverId } = await params;
  return { title: `Manage Meet ${serverId} — ZeroTacky Promoter` };
}

export default async function PromoterMeetDetailPage({ params }: PromoterMeetPageProps) {
  const { serverId } = await params;
  return (
    <WebsiteShell activeNav="promoter">
      <PromoterMeetDetailClient serverId={serverId} />
    </WebsiteShell>
  );
}
