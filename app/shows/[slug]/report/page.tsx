import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import WebsiteShell from '@/components/website/WebsiteShell';
import MeetReportClient from '@/components/website/MeetReportClient';
import { Key } from '@/components/website/sheet';
import { getMeetReportOrigins, getPublicShowBySlug } from '@/lib/website/data';
import { buildMeetReport } from '@/lib/website/meetReport';
import { buildAllDivisionResultsViews } from '@/lib/website/standingsAdapter';

// Post-meet report (11/8, feature gaps #19): one printable page for the host gym and the promoter once a show is
// completed: field, podiums, event winners, where the athletes came from, sponsors. Same data path and reach as the
// show page; not indexed (a view of the show, not a second page about it).
export const revalidate = 60;

interface ReportPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ReportPageProps): Promise<Metadata> {
  const { slug } = await params;
  const res = await getPublicShowBySlug(slug);
  if (!res.data) return { title: 'Show Not Found | ZeroTacky' };
  return {
    title: `Post-meet report: ${res.data.name} | ZeroTacky`,
    description: `Field, podiums, event winners and where the athletes came from for ${res.data.name} (${res.data.date}).`,
    robots: { index: false, follow: true },
  };
}

export default async function MeetReportPage({ params }: ReportPageProps) {
  const { slug } = await params;
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
  const origins = show.isDemoFixture ? null : await getMeetReportOrigins(show.id);
  const report = buildMeetReport(show, buildAllDivisionResultsViews(show), origins);
  return (
    <WebsiteShell activeNav="shows" brand={show.theme ?? null} sheet={`Report \u00b7 ${show.slug}`}>
      <MeetReportClient report={report} completed={show.competitionStatus === 'completed'} />
    </WebsiteShell>
  );
}
