import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/website/siteUrl';
import { listPublicGyms, listPublicShows } from '@/lib/website/data';

// Public pages for search engines: the static site pages, every show the directory lists (including the labelled
// demo shows, which have real pages), and every public gym. Rebuilt at most hourly (revalidate below).
export const revalidate = 3600;

const STATIC_PATHS = ['/', '/website', '/how-it-works', '/shows', '/gyms', '/demo', '/join', '/legal/terms', '/legal/privacy'];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl().origin;
  const now = new Date();
  const entries: MetadataRoute.Sitemap = STATIC_PATHS.map((p) => ({ url: `${base}${p}`, lastModified: now }));

  const [shows, gyms] = await Promise.all([listPublicShows(), listPublicGyms()]);
  for (const s of shows.data ?? []) {
    entries.push({ url: `${base}/shows/${encodeURIComponent(s.slug)}`, lastModified: now });
  }
  for (const g of gyms.data ?? []) {
    entries.push({ url: `${base}/gyms/${encodeURIComponent(g.slug)}`, lastModified: now });
  }
  return entries;
}
