/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Satori fonts for the share cards (lib/website/og.tsx) are read from disk at request time; trace them into both lambdas.
  outputFileTracingIncludes: {
    '/shows/[slug]/opengraph-image': ['./lib/website/fonts/*.ttf'],
    '/m/[slug]/opengraph-image': ['./lib/website/fonts/*.ttf'],
    '/shows/[slug]/card/[athleteId]/route': ['./lib/website/fonts/*.ttf'],
  },
  // dev only: lets a second "phone" (127.0.0.1) hit the same dev server for sync smoke tests
  allowedDevOrigins: ['127.0.0.1'],
  // 11/2: the 10/16 field-test links used /m/strongfest-2026; the real meet was published as all-out-strongfest-2026
  // and the demo fixture that held the old slug is now riverside-iron-fest-2026. Send old links to the real meet.
  async redirects() {
    return ['m', 'shows', 'register'].map((p) => ({
      source: `/${p}/strongfest-2026`,
      destination: `/${p}/all-out-strongfest-2026`,
      permanent: true,
    }))
  },
}

export default nextConfig
