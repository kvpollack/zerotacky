import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Metadata } from 'next';
import WebsiteShell from '@/components/website/WebsiteShell';
import RegisterClient from '@/components/register/RegisterClient';

// M3 decision: this page is a client-rendered lookup, like /promoter/[serverId]. The fixture API is an in-memory
// singleton per JavaScript realm, so a meet created in the browser's dashboard exists only in that tab; a server
// lookup would 404 it. RegisterClient calls getPublicMeetBySlug(slug) in the browser and shows its own not-found
// state. The server's only job here is reading the waiver text, which the browser cannot do.

interface RegisterPageProps {
  params: Promise<{ slug: string }>;
}

function loadWaiverMarkdown(): { text: string | null; error: string | null } {
  try {
    const text = readFileSync(join(process.cwd(), 'legal', 'WAIVER.md'), 'utf-8');
    if (!text.trim()) {
      return { text: null, error: 'The waiver file legal/WAIVER.md is empty. Registration is unavailable until it is restored.' };
    }
    return { text, error: null };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { text: null, error: `The waiver text could not be loaded (${reason}). Registration is unavailable until it is restored.` };
  }
}

// The slug is resolved in the browser (see above), so the title cannot name the meet.
export async function generateMetadata({ params }: RegisterPageProps): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: 'Athlete Registration — ZeroTacky',
    description: `Athlete registration and waiver for /register/${slug}.`,
  };
}

export default async function RegisterPage({ params }: RegisterPageProps) {
  const { slug } = await params;
  const waiver = loadWaiverMarkdown();

  return (
    <WebsiteShell activeNav="shows">
      <RegisterClient slug={slug} waiverText={waiver.text} waiverError={waiver.error} />
    </WebsiteShell>
  );
}
