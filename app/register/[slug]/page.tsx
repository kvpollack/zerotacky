import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Metadata } from 'next';
import WebsiteShell from '@/components/website/WebsiteShell';
import RegisterClient from '@/components/register/RegisterClient';
import { notFound } from 'next/navigation';
import { waiverVersionOf } from '@/lib/promoter/waiverVersion';
import { createSyncClient, readSyncEnv } from '@/lib/sync/client';
import { cleanSlug } from '@/lib/website/data';
import { canonical } from '@/lib/website/seo';

// The meet itself is still resolved in the browser (RegisterClient calls getPublicMeetBySlug(slug)), because the
// fixture API on a no-backend build is an in-memory singleton per JavaScript realm. What the server does here (10/21,
// Astra M13): when a backend is configured it checks that a non-demo meet with this slug exists, using the same rule as
// zt_public_meet_by_slug (any non-demo meet, listed or not), and answers a real 404 when none does. It also reads the
// waiver text, which the browser cannot do.

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

// True when no backend is configured (fixture mode, the browser decides) or a non-demo meet with this slug exists.
async function meetExists(slug: string): Promise<boolean> {
  const env = readSyncEnv();
  if (!env) return true;
  const key = cleanSlug(slug);
  if (!key) return false;
  try {
    const rows = await createSyncClient(env).select<{ id: string }>('meets', `slug=eq.${encodeURIComponent(key)}&is_demo=eq.false&select=id&limit=1`);
    return rows.length > 0;
  } catch {
    return true; // a backend hiccup must not turn a real meet into a 404; the client shows its own error
  }
}

// The slug is resolved in the browser (see above), so the title cannot name the meet.
export async function generateMetadata({ params }: RegisterPageProps): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: 'Athlete Registration — ZeroTacky',
    description: `Athlete registration and waiver for /register/${slug}.`,
    ...canonical(`/register/${slug}`),
  };
}

export default async function RegisterPage({ params }: RegisterPageProps) {
  const { slug } = await params;
  if (!(await meetExists(slug))) notFound(); // renders ./not-found.tsx with a real 404 status
  const waiver = loadWaiverMarkdown();

  return (
    <WebsiteShell activeNav="shows">
      <RegisterClient
        slug={slug}
        waiverText={waiver.text}
        waiverVersion={waiver.text ? waiverVersionOf(waiver.text) : null}
        waiverError={waiver.error}
      />
    </WebsiteShell>
  );
}
