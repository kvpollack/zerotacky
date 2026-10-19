import type { Metadata } from 'next';
import WebsiteShell from '@/components/website/WebsiteShell';
import PromoterDashboardClient from '@/components/promoter/PromoterDashboardClient';

export const metadata: Metadata = {
  title: 'Promoter Dashboard — ZeroTacky',
  description:
    'Create and manage strongman competitions, public show listings, athlete registrations, and meet-day volunteer codes.',
};

export default function PromoterDashboardPage() {
  return (
    <WebsiteShell activeNav="promoter">
      <PromoterDashboardClient />
    </WebsiteShell>
  );
}
