import type { Metadata } from 'next';
import WebsiteShell from '@/components/website/WebsiteShell';
import AddGymClient from '@/components/website/AddGymClient';
import { NOINDEX } from '@/lib/website/seo';

export const metadata: Metadata = {
  title: 'Add my gym | ZeroTacky',
  description: 'List a strongman or powerlifting gym that is not in the ZeroTacky Gym Directory yet.',
  ...NOINDEX,
};

export default function AddGymPage() {
  return (
    <WebsiteShell activeNav="account">
      <AddGymClient />
    </WebsiteShell>
  );
}
