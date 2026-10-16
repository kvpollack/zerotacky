/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // dev only: lets a second "phone" (127.0.0.1) hit the same dev server for sync smoke tests
  allowedDevOrigins: ['127.0.0.1'],
}

export default nextConfig
