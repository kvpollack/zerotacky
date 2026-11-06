import type { Metadata } from 'next';
import WebsiteShell from '@/components/website/WebsiteShell';
import UnsubscribeClient from '@/components/website/UnsubscribeClient';

// /unsubscribe?r=<registration id>&t=<mail token>  (042, feature gaps #10). The link at the foot of every broadcast and
// reminder. One confirm key, then zt_mail_opt_out flips the registration's mail_opt_out; registration and decision
// emails are unaffected. No sign-in: the token is the proof. Not indexed.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Stop show emails | ZeroTacky',
  robots: { index: false, follow: false },
};

interface Props { searchParams: Promise<{ r?: string | string[]; t?: string | string[] }> }

export default async function UnsubscribePage({ searchParams }: Props) {
  const sp = await searchParams;
  const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v) ?? '';
  return (
    <WebsiteShell activeNav="shows" sheet="Unsubscribe">
      <UnsubscribeClient reg={one(sp.r)} token={one(sp.t)} />
    </WebsiteShell>
  );
}
