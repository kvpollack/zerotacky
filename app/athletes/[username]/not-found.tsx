import Link from 'next/link';
import WebsiteShell from '@/components/website/WebsiteShell';

export default function AthleteNotFound() {
  return (
    <WebsiteShell activeNav="athletes">
      <div className="bg-zt-surface border border-zt-border rounded-2xl p-6 space-y-3 max-w-xl">
        <h1 className="text-xl font-black text-zt-text">No public profile here</h1>
        <p className="text-sm text-zt-text-2">
          Either nobody has this username or the person has not turned on their public profile.
        </p>
        <Link href="/athletes" className="inline-block px-3.5 py-2 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase">
          Browse athletes
        </Link>
      </div>
    </WebsiteShell>
  );
}
