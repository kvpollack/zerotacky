import type { Metadata } from 'next';
import RootLanding from '@/components/shell/RootLanding';

export const metadata: Metadata = { title: 'ZeroTacky — Strongman Meet Manager' };

export default function Page() {
  return <RootLanding />;
}
