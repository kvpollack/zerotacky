import type { Metadata } from 'next';
import WebsiteShell from '@/components/website/WebsiteShell';
import InviteClient from '@/components/website/InviteClient';
import { NOINDEX } from '@/lib/website/seo';

export const metadata: Metadata = {
  title: 'Ownership invite | ZeroTacky',
  description: 'Accept an invite to own a gym listing or a meet on ZeroTacky.',
  ...NOINDEX,
};

// 052: the link an admin or meet owner sends. Everything useful happens client-side (the token is looked up
// through an anon-callable RPC and redeemed once the visitor has a session), so the page is a shell.
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <WebsiteShell activeNav="account">
      <InviteClient token={decodeURIComponent(token)} />
    </WebsiteShell>
  );
}
