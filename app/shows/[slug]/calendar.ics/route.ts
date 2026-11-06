// /shows/<slug>/calendar.ics (044, feature gaps #7a): the show as an iCalendar file built from the promoter's meet-day
// schedule. Same visibility rule as the show page (getPublicShowBySlug: listed, or results submitted). Demo fixtures
// are made-up shows and get a 404 here so nobody puts one on a real calendar.

import { NextResponse } from 'next/server';
import { getPublicShowBySlug } from '@/lib/website/data';
import { buildShowIcs } from '@/lib/website/schedule';
import { siteUrl } from '@/lib/website/siteUrl';

export const revalidate = 60;

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const res = await getPublicShowBySlug(slug);
  const show = res.data;
  if (res.error || !show || show.isDemoFixture || !/^\d{4}-\d{2}-\d{2}$/.test(show.date)) {
    return new NextResponse('Not found', { status: 404 });
  }
  const v = show.venue;
  const location = [v.facilityName, v.streetAddress, v.city && v.state ? `${v.city}, ${v.state}${v.postalCode ? ` ${v.postalCode}` : ''}` : '']
    .filter((s) => s && s !== 'Not provided').join(', ');
  const ics = buildShowIcs({
    slug: show.slug,
    name: show.name,
    date: show.date,
    venueState: v.state,
    location: location || undefined,
    schedule: show.schedule ?? null,
    url: new URL(`/shows/${encodeURIComponent(show.slug)}`, siteUrl()).toString(),
  });
  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${show.slug}.ics"`,
      'Cache-Control': 'public, max-age=60',
    },
  });
}
