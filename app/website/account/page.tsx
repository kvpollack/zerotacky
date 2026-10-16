import type { Metadata } from 'next';
import WebsiteShell from '@/components/website/WebsiteShell';
import AccountPreviewClient from '@/components/website/AccountPreviewClient';
import { listDemoPersonas, listPublicGyms } from '@/lib/website/data';

export const metadata: Metadata = {
  title: 'Account & Capability Dashboard Preview — ZeroTacky',
  description:
    'Preview overlapping Athlete, Promoter, and Gym Owner capabilities on a single ZeroTacky account.',
};

export default async function WebsiteAccountPreviewPage() {
  const personas = listDemoPersonas();
  const gymsRes = await listPublicGyms();
  const gyms = gymsRes.data ?? [];

  return (
    <WebsiteShell activeNav="account">
      <AccountPreviewClient personas={personas} gyms={gyms} />
    </WebsiteShell>
  );
}