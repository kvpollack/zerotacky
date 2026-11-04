import WebsiteShell from '@/components/website/WebsiteShell';
import NotFoundSheet from '@/components/website/NotFoundSheet';

// Rendered by notFound() in ./page.tsx so unknown gym slugs answer with HTTP 404 (crawlers and link checkers
// see a real not-found, not a 200 with "not found" text).
export default function GymNotFound() {
  return (
    <WebsiteShell activeNav="gyms">
      <NotFoundSheet cap="404 · Gym not found" title="That gym is not in the gym directory." links={[{ href: '/gyms', label: 'Back to the gym directory' }]} />
    </WebsiteShell>
  );
}
