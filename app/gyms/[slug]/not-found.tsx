import Link from 'next/link';
import WebsiteShell from '@/components/website/WebsiteShell';

// Rendered by notFound() in ./page.tsx so unknown gym slugs answer with HTTP 404 (crawlers and link checkers
// see a real not-found, not a 200 with "not found" text).
export default function GymNotFound() {
  return (
    <WebsiteShell activeNav="gyms">
      <div className="bg-zt-surface border border-zt-border rounded-2xl p-8 text-center space-y-4">
        <div className="text-xs font-black uppercase tracking-wider text-zt-primary">404 • Gym Not Found</div>
        <h1 className="text-2xl font-black text-zt-text">That gym is not in the gym directory.</h1>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Link href="/gyms" className="px-4 py-2.5 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase">
            Back to Strongman Gyms
          </Link>
        </div>
      </div>
    </WebsiteShell>
  );
}
