import WebsiteShell from '@/components/website/WebsiteShell';
import NotFoundSheet from '@/components/website/NotFoundSheet';

export default function AthleteNotFound() {
  return (
    <WebsiteShell activeNav="athletes">
      <NotFoundSheet
        cap="404 · No public profile"
        title="No public profile here."
        note="Either nobody has this username or the person has not turned on their public profile."
        links={[{ href: '/athletes', label: 'Browse athletes' }]}
      />
    </WebsiteShell>
  );
}
