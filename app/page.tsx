import type { Metadata } from 'next';
import RootLanding from '@/components/shell/RootLanding';
import { canonical } from '@/lib/website/seo';

export const metadata: Metadata = { title: 'ZeroTacky — Strongman Meet Manager', ...canonical('/') };

export default function Page() {
  return <RootLanding />;
}
