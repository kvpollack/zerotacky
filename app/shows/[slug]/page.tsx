import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import WebsiteShell from '@/components/website/WebsiteShell';
import ShowDetailClient from '@/components/website/ShowDetailClient';
import { Key } from '@/components/website/sheet';
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
        <div role="alert" className="zt-block grid-cols-1">
          <div className="flex flex-col gap-3 px-6 py-6">
            <h1 className="text-[22px] font-bold text-redpen">Error Loading Show</h1>
            <p className="text-[13px] text-ink">{res.error}</p>
            <div className="flex">
              <Key href="/shows" variant="line">Back to Shows Directory</Key>
            </div>
          </div>
        </div>
      </WebsiteShell>
    );
  }

  if (!res.data) notFound();   // renders ./not-found.tsx with a real 404 status

  const show = res.data;
  const divisionResults = buildAllDivisionResultsViews(show);

  return (
    <WebsiteShell activeNav="shows" brand={show.theme ?? null} sheet={`Show · ${show.slug}`}>
      {!show.isDemoFixture && <JsonLd data={showEventJsonLd(show)} />}
      <ShowDetailClient show={show} divisionResults={divisionResults} />
    </WebsiteShell>
  );
}