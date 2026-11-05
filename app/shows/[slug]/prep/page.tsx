import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import WebsiteShell from '@/components/website/WebsiteShell';
import PrepSheetClient from '@/components/website/PrepSheetClient';
import { Key } from '@/components/website/sheet';
import { getPublicShowBySlug } from '@/lib/website/data';
import { buildPrepSheet } from '@/lib/website/prepSheet';

// Comp-prep sheet (11/5, feature gaps #15): the show's events as a training sheet, for one division or all, printable,
// with a CSV download. Same data path and freshness as the show page; same reach (an unlisted show with stamped results
// still resolves here, like its show page). Not indexed: it is a view of the show page, not a second page about the show.
export const revalidate = 60;

interface PrepPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ division?: string | string[] }>;
}

export async function generateMetadata({ params }: PrepPageProps): Promise<Metadata> {
  const { slug } = await params;
  const res = await getPublicShowBySlug(slug);
  if (!res.data) return { title: 'Show Not Found | ZeroTacky' };
  return {
    title: `Prep sheet: ${res.data.name} | ZeroTacky`,
    description: `Events, weights and rules for ${res.data.name} (${res.data.date}) as a training sheet.`,
    robots: { index: false, follow: true },
  };
}

export default async function PrepSheetPage({ params, searchParams }: PrepPageProps) {
  const { slug } = await params;
  const sp = await searchParams;
  const divisionParam = Array.isArray(sp.division) ? sp.division[0] : sp.division;
  const res = await getPublicShowBySlug(slug);
  if (res.error) {
    return (
      <WebsiteShell activeNav="shows">
        <div role="alert" className="zt-block grid-cols-1">
          <div className="flex flex-col gap-3 px-6 py-6">
            <h1 className="text-[22px] font-bold text-redpen">Error Loading Show</h1>
            <p className="text-[13px] text-ink">{res.error}</p>
            <div className="flex"><Key href="/shows" variant="line">Back to Shows Directory</Key></div>
          </div>
        </div>
      </WebsiteShell>
    );
  }
  if (!res.data) notFound();
  const show = res.data;
  const sheet = buildPrepSheet(show, divisionParam ?? null);
  return (
    <WebsiteShell activeNav="shows" brand={show.theme ?? null} sheet={`Prep \u00b7 ${show.slug}`}>
      <PrepSheetClient sheet={sheet} venue={show.venue} isDemo={show.isDemoFixture} />
    </WebsiteShell>
  );
}
