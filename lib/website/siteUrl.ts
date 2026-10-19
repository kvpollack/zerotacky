// Absolute site URL for metadata (og:url, og:image). Kept free of next/og so the root layout can import it.
export function siteUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return new URL(explicit);
  if (process.env.VERCEL_ENV === 'production') return new URL('https://www.zerotacky.com');
  if (process.env.VERCEL_URL) return new URL(`https://${process.env.VERCEL_URL}`);
  return new URL('http://localhost:3079');
}
