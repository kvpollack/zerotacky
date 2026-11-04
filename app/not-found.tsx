import type { Metadata } from 'next';
import WebsiteShell from '@/components/website/WebsiteShell';
import NotFoundSheet from '@/components/website/NotFoundSheet';

export const metadata: Metadata = { title: 'Page not found | ZeroTacky' };

// Root 404 (11/4): until now an unknown URL fell through to Next's bare default page, the only surface outside the
// sheet grammar. Live scoreboard links look like /m/<slug>; show pages like /shows/<slug>.
export default function NotFound() {
  return (
    <WebsiteShell>
      <NotFoundSheet
        cap="404 · Page not found"
        title="There is nothing at this address."
        note="A live scoreboard link looks like /m/<slug> and a show page like /shows/<slug>. If a promoter sent you here, ask them for the link again."
        links={[{ href: '/website', label: 'ZeroTacky home' }, { href: '/shows', label: 'Find a show' }, { href: '/join', label: 'Join a meet' }]}
      />
    </WebsiteShell>
  );
}
