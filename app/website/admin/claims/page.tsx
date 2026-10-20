import type { Metadata } from 'next';
import WebsiteShell from '@/components/website/WebsiteShell';
import AdminClaimsClient from '@/components/website/AdminClaimsClient';

export const metadata: Metadata = {
  title: 'Gym claims queue — ZeroTacky',
  robots: { index: false, follow: false },
};

export default function AdminClaimsPage() {
  return (
    <WebsiteShell activeNav="account">
      <AdminClaimsClient />
    </WebsiteShell>
  );
}
