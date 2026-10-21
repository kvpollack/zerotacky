import type { Metadata } from 'next';
import WebsiteShell from '@/components/website/WebsiteShell';
import PromoterDashboardClient from '@/components/promoter/PromoterDashboardClient';
import { NOINDEX } from '@/lib/website/seo';

export const metadata: Metadata = {
  title: 'Promoter Dashboard — ZeroTacky',
  description:
    'Create and manage strongman competitions, public show listings, athlete registrations, and meet-day volunteer codes.',
  ...NOINDEX,
};

export default function PromoterDashboardPage() {
  return (
    <WebsiteShell activeNav="promoter">
      <PromoterDashboardClient />
    </WebsiteShell>
  );
}
