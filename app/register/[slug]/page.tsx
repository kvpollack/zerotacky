import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import WebsiteShell from '@/components/website/WebsiteShell';
import RegisterClient from '@/components/register/RegisterClient';
import { getFixtureMeetForRegistration } from '@/lib/promoter/fixtureApi';

interface RegisterPageProps {
  params: Promise<{ slug: string }>;
}

function loadWaiverMarkdown(): string {
  try {
    return readFileSync(join(process.cwd(), 'legal', 'WAIVER.md'), 'utf-8');
  } catch {
    return '# Assumption of Risk and Liability Waiver (Draft)\n\nWaiver text file (legal/WAIVER.md) could not be read from disk.';
  }
}

export async function generateMetadata({ params }: RegisterPageProps): Promise<Metadata> {
  const { slug } = await params;
  const res = await getFixtureMeetForRegistration(slug);
  if (!res.data) {
    return { title: 'Register for Competition — ZeroTacky' };
  }
  return {
    title: `Register: ${res.data.summary.name} — ZeroTacky`,
    description: `Athlete registration and waiver for ${res.data.summary.name}.`,
  };
}

export default async function RegisterPage({ params }: RegisterPageProps) {
  const { slug } = await params;
  const res = await getFixtureMeetForRegistration(slug);

  if (!res.data) {
    notFound();
  }

  const waiverText = loadWaiverMarkdown();

  return (
    <WebsiteShell activeNav="shows">
      <RegisterClient initialDetail={res.data} waiverText={waiverText} />
    </WebsiteShell>
  );
}
