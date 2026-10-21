import type { Metadata } from 'next'
import StrongmanAppLoader from '@/components/strongman-app-loader'
import { canonical } from '@/lib/website/seo';

export const metadata: Metadata = { title: 'Meet-Day Scorer | ZeroTacky', ...canonical('/scorer') }

export default function Page() {
  return <StrongmanAppLoader />
}
