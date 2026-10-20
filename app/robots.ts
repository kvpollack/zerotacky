import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/website/siteUrl';

// Crawl rules. Everything public is allowed; account and admin pages are private and already noindex, this keeps
// crawlers from fetching them at all. The sitemap lists the public pages (app/sitemap.ts).
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl().origin;
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/website/account', '/website/admin', '/promoter', '/api/'] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
