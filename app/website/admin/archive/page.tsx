import type { Metadata } from 'next';
import WebsiteShell from '@/components/website/WebsiteShell';
import AdminArchiveClient from '@/components/website/AdminArchiveClient';

export const metadata: Metadata = {
  title: 'Archive name requests | ZeroTacky',
  robots: { index: false, follow: false },
};

export default function AdminArchivePage() {
  return (
    <WebsiteShell activeNav="account">
      <AdminArchiveClient />
    </WebsiteShell>
  );
}
