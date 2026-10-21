import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import WebsiteShell from '@/components/website/WebsiteShell';
import { getPublicGymBySlug } from '@/lib/website/data';
import GymClaimClient from './GymClaimClient';

interface Props { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const res = await getPublicGymBySlug(slug);
  return { title: res.data ? `Claim ${res.data.name} | ZeroTacky` : 'Gym Not Found | ZeroTacky', robots: { index: false } };
}

export default async function GymClaimPage({ params }: Props) {
  const { slug } = await params;
  const res = await getPublicGymBySlug(slug);
  const gym = res.data;
  if (!gym || gym.isDemoListing) notFound();
  return (
    <WebsiteShell activeNav="gyms">
      <Suspense fallback={null}>
        <GymClaimClient gymId={gym.id} gymName={gym.name} gymSlug={gym.slug} />
      </Suspense>
    </WebsiteShell>
  );
}
