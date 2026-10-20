import Link from 'next/link';
import WebsiteShell from '@/components/website/WebsiteShell';

// Rendered by notFound() in ./page.tsx when no non-demo meet carries the slug, so a dead registration link answers
// with HTTP 404 (crawlers and link checkers see a real not-found, not a 200 with "not found" text).
export default function RegisterNotFound() {
  return (
    <WebsiteShell activeNav="shows">
      <div className="bg-zt-surface border border-zt-border rounded-2xl p-8 text-center space-y-4">
        <div className="text-xs font-black uppercase tracking-wider text-zt-primary">404 • Registration Not Found</div>
        <h1 className="text-2xl font-black text-zt-text">There is no meet at this registration link.</h1>
        <p className="text-xs text-zt-muted max-w-md mx-auto">
          The link may be out of date, or the promoter may have renamed or removed the meet. Find the show in the
          directory and use the Register button there.
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Link href="/shows" className="px-4 py-2.5 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase">
            Browse Shows
          </Link>
        </div>
      </div>
    </WebsiteShell>
  );
}
