import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import WebsiteShell from '@/components/website/WebsiteShell';
import ShowDetailClient from '@/components/website/ShowDetailClient';
import { getPublicShowBySlug } from '@/lib/website/data';

// Same freshness rule as /shows: at most a minute behind a promoter's listing save.
export const revalidate = 60;
import { buildAllDivisionResultsViews } from '@/lib/website/standingsAdapter';
import { canonical, showEventJsonLd } from '@/lib/website/seo';
import JsonLd from '@/components/website/JsonLd';

interface ShowDetailPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ShowDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const res = await getPublicShowBySlug(slug);
  if (!res.data) {
    return { title: 'Show Not Found | ZeroTacky' };
  }
  const show = res.data;
  const description =
    show.summaryNote ||
    `${show.name} in ${show.venue.city}, ${show.venue.state} on ${show.date}. Divisions, events, weights, and results.`;
  const title = `${show.name} (${show.date}) | ZeroTacky`;
  // Link previews (Kurt 10/19): the image comes from ./opengraph-image.tsx; Next adds og:image and twitter:image itself.
  return {
    title,
    description,
    openGraph: { title, description, type: 'website', siteName: 'ZeroTacky', url: `/shows/${show.slug}` , images: ['/og.png'] },
    twitter: { card: 'summary_large_image', title, description },
    ...canonical(`/shows/${show.slug}`),
    // Demo fixtures stay reachable for people we send there, but they are made-up shows: keep them out of the index.
    ...(show.isDemoFixture ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function ShowDetailPage({ params }: ShowDetailPageProps) {
  const { slug } = await params;
  const res = await getPublicShowBySlug(slug);

  if (res.error) {
    return (
      <WebsiteShell activeNav="shows">
        <div
          role="alert"
          className="bg-zt-danger/15 border border-zt-danger text-zt-danger-text rounded-2xl p-6 space-y-3"
        >
          <h1 className="text-lg font-black">Error Loading Show</h1>
          <p className="text-xs font-bold">{res.error}</p>
          <Link
            href="/shows"
            className="inline-block px-4 py-2 rounded-xl bg-zt-surface text-zt-text font-black text-xs uppercase border border-zt-border"
          >
            Back to Shows Directory
          </Link>
        </div>
      </WebsiteShell>
    );
  }

  if (!res.data) notFound();   // renders ./not-found.tsx with a real 404 status

  const show = res.data;
  const divisionResults = buildAllDivisionResultsViews(show);

  return (
    <WebsiteShell activeNav="shows">
      {!show.isDemoFixture && <JsonLd data={showEventJsonLd(show)} />}
      <ShowDetailClient show={show} divisionResults={divisionResults} />
    </WebsiteShell>
  );
}