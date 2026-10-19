import type { Metadata } from 'next';
import WebsiteShell from '@/components/website/WebsiteShell';
import AccountClient from '@/components/website/AccountClient';

export const metadata: Metadata = {
  title: 'Account — ZeroTacky',
  description: 'Sign in to ZeroTacky: compete, run shows and list your gym from one account.',
};

export default function WebsiteAccountPage() {
  return (
    <WebsiteShell activeNav="account">
      <AccountClient />
    </WebsiteShell>
  );
}
