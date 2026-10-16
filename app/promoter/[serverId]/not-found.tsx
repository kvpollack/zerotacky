import Link from 'next/link';
import WebsiteShell from '@/components/website/WebsiteShell';

export default function PromoterMeetNotFound() {
  return (
    <WebsiteShell>
      <div className="bg-zt-surface border border-zt-border rounded-2xl p-8 text-center space-y-4">
        <div className="text-xs font-black uppercase tracking-wider text-zt-primary">
          404 • Meet Not Found
        </div>
        <h1 className="text-2xl font-black text-zt-text">
          That meet could not be found in your promoter dashboard.
        </h1>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Link
            href="/promoter"
            className="px-4 py-2.5 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase"
          >
            Back to My Meets
          </Link>
        </div>
      </div>
    </WebsiteShell>
  );
}
