import type { Metadata } from 'next'
import StrongmanAppLoader from '@/components/strongman-app-loader'

export const metadata: Metadata = { title: 'Meet-Day Scorer — ZeroTacky' }

export default function Page() {
  return <StrongmanAppLoader />
}
