import type { Metadata } from 'next';
import WebsiteShell from '@/components/website/WebsiteShell';
import AdminExternalShowsClient from '@/components/website/AdminExternalShowsClient';

export const metadata: Metadata = {
  title: 'Show listings queue | ZeroTacky',
  robots: { index: false, follow: false },
};

export default function AdminExternalShowsPage() {
  return (
    <WebsiteShell activeNav="account" sheet="Show listings queue">
      <AdminExternalShowsClient />
    </WebsiteShell>
  );
}
