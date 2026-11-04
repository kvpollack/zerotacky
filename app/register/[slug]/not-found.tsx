import WebsiteShell from '@/components/website/WebsiteShell';
import NotFoundSheet from '@/components/website/NotFoundSheet';

// Rendered by notFound() in ./page.tsx so an unknown registration slug answers with HTTP 404 (crawlers and link
// checkers see a real not-found, not a 200 with "not found" text).
export default function RegisterNotFound() {
  return (
    <WebsiteShell activeNav="shows">
      <NotFoundSheet
        cap="404 · Registration not found"
        title="There is no meet at this registration link."
        note="The link may be out of date, or the promoter may have renamed or removed the meet. Find the show in the directory and use the Register button there."
        links={[{ href: '/shows', label: 'Browse shows' }]}
      />
    </WebsiteShell>
  );
}
