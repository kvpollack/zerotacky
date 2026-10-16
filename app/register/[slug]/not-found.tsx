import Link from 'next/link';
import WebsiteShell from '@/components/website/WebsiteShell';

export default function RegisterMeetNotFound() {
  return (
    <WebsiteShell activeNav="shows">
      <div className="bg-zt-surface border border-zt-border rounded-2xl p-8 text-center space-y-4">
        <div className="text-xs font-black uppercase tracking-wider text-zt-primary">
          404 • Competition Not Found
        </div>
        <h1 className="text-2xl font-black text-zt-text">
          No competition registration page exists at that URL.
        </h1>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Link
            href="/shows"
            className="px-4 py-2.5 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase"
          >
            Browse Strongman Shows
          </Link>
        </div>
      </div>
    </WebsiteShell>
  );
}
