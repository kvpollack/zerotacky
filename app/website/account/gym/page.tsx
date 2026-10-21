import type { Metadata } from 'next';
import WebsiteShell from '@/components/website/WebsiteShell';
import MyGymClient from '@/components/website/MyGymClient';
import { NOINDEX } from '@/lib/website/seo';

export const metadata: Metadata = {
  title: 'My Gym — ZeroTacky',
  description: 'Edit the gym listing you own in the ZeroTacky Gym Directory: equipment, day passes, drop-in hours and contact details.',
  ...NOINDEX,
};

export default function MyGymPage() {
  return (
    <WebsiteShell activeNav="account">
      <MyGymClient />
    </WebsiteShell>
  );
}
