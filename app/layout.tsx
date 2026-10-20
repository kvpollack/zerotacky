import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'
import { siteUrl } from '@/lib/website/siteUrl'

export const metadata: Metadata = {
  manifest: '/manifest.json',
  metadataBase: siteUrl(),
  title: 'ZeroTacky — Strongman Meet Manager',
  description: 'Offline strongman scoring, run order, and plate loading for meet day.',
  // Set Stone mark (10/21): flat stone at favicon sizes, the shaded version from 180 px up and on the share card.
  icons: {
    icon: [
      { url: '/icon-light-16x16.png', media: '(prefers-color-scheme: light)', sizes: '16x16' },
      { url: '/icon-dark-16x16.png', media: '(prefers-color-scheme: dark)', sizes: '16x16' },
      { url: '/icon-light-32x32.png', media: '(prefers-color-scheme: light)', sizes: '32x32' },
      { url: '/icon-dark-32x32.png', media: '(prefers-color-scheme: dark)', sizes: '32x32' },
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-icon.png',
  },
  openGraph: {
    siteName: 'ZeroTacky',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'ZeroTacky: strongman meet manager and gym directory' }],
  },
  twitter: { card: 'summary_large_image', images: ['/og.png'] },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
