import type { Metadata } from 'next';
import WebsiteShell from '@/components/website/WebsiteShell';
import SubmitExternalShowClient from '@/components/website/SubmitExternalShowClient';
import { canonical } from '@/lib/website/seo';

export const metadata: Metadata = {
  title: 'List a show held elsewhere | ZeroTacky',
  description: 'Add a strongman show that registers on another site to the ZeroTacky shows list, with a link out.',
  ...canonical('/shows/submit'),
};

export default function SubmitExternalShowPage() {
  return (
    <WebsiteShell activeNav="shows" sheet="List a show">
      <SubmitExternalShowClient />
    </WebsiteShell>
  );
}
