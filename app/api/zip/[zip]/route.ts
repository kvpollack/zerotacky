import { NextResponse } from 'next/server';
import { zipCentroid } from '@/lib/geo/zcta';
import { normalizeZip } from '@/lib/geo/geo';

// GET /api/zip/19063 -> { zip, lat, lng } or 404. Static data, so cache hard.
export const dynamic = 'force-static';

export async function GET(_req: Request, ctx: { params: Promise<{ zip: string }> }) {
  const { zip } = await ctx.params;
  const hit = zipCentroid(zip);
  if (!hit) return NextResponse.json({ error: 'Unknown zip' }, { status: 404, headers: { 'Cache-Control': 'public, max-age=86400' } });
  return NextResponse.json({ zip: normalizeZip(zip), ...hit }, { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } });
}
