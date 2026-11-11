// PNG result card for one athlete at one show: /shows/<slug>/card/<athleteId>?size=square|story|link (11/10 night).
// Public data only (the standings table already prints the same names and marks). nodejs runtime for Satori's fonts;
// next.config outputFileTracingIncludes ships the TTFs with this route.
import { NextResponse } from 'next/server';
import { getPublicShowBySlug } from '@/lib/website/data';
import { buildResultCardData, isResultCardSize, resultCardFileName } from '@/lib/website/resultCard';
import { renderResultCard } from '@/lib/website/resultCardImage';

export const runtime = 'nodejs';

export async function GET(req: Request, ctx: { params: Promise<{ slug: string; athleteId: string }> }) {
  const { slug, athleteId } = await ctx.params;
  const url = new URL(req.url);
  const sizeParam = url.searchParams.get('size') ?? 'square';
  if (!isResultCardSize(sizeParam)) return NextResponse.json({ error: 'size must be square, story or link' }, { status: 400 });
  const res = await getPublicShowBySlug(slug);
  if (!res.data) return NextResponse.json({ error: 'show not found' }, { status: 404 });
  const data = buildResultCardData(res.data, athleteId);
  if (!data) return NextResponse.json({ error: 'no result for this athlete on this show' }, { status: 404 });
  const img = await renderResultCard(data, sizeParam);
  // Buffer it: a Satori layout error inside a streamed body surfaces as an empty 200 (seen 11/10), buffered it is a 500.
  const png = await img.arrayBuffer();
  const headers = new Headers();
  headers.set('Content-Type', 'image/png');
  headers.set('Cache-Control', data.statusLabel === 'Official Final' ? 'public, max-age=3600, s-maxage=86400' : 'public, max-age=60');
  if (url.searchParams.get('download') === '1') headers.set('Content-Disposition', `attachment; filename="${resultCardFileName(data, sizeParam)}"`);
  return new Response(png, { status: 200, headers });
}
