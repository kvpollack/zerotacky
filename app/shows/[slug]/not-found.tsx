import WebsiteShell from '@/components/website/WebsiteShell';
import NotFoundSheet from '@/components/website/NotFoundSheet';

// Rendered by notFound() in ./page.tsx so unknown slugs answer with HTTP 404 (crawlers and link checkers
// see a real not-found, not a 200 with "not found" text).
export default function ShowNotFound() {
  return (
    <WebsiteShell activeNav="shows">
      <NotFoundSheet
        cap="404 · Show not found"
        title="That show is not in the show directory."
        note={<>If this meet was published straight from a phone for live scoring, it has a live scoreboard at <code className="font-mono text-ink">/m/&lt;slug&gt;</code> instead of a show page.</>}
        links={[{ href: '/shows', label: 'Browse shows' }]}
      />
    </WebsiteShell>
  );
}
