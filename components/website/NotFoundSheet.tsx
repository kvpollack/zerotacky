import Link from 'next/link';
import { Cap, keyClass } from '@/components/website/sheet';

// One not-found block for the website (11/4): the cap says what is missing, the headline says it plainly, an optional
// note explains, and the keys lead somewhere useful. Rendered inside WebsiteShell by each route's not-found.tsx and by
// the root app/not-found.tsx, so every unknown URL answers in the sheet grammar (the root used to fall through to Next's
// bare page).
export default function NotFoundSheet({ cap, title, note, links }: {
  cap: string;
  title: string;
  note?: React.ReactNode;
  links: { href: string; label: string; variant?: 'ink' | 'line' }[];
}) {
  return (
    <section aria-labelledby="nf-title" className="zt-block max-w-2xl">
      <div className="px-5 py-6 sm:px-6 sm:py-7 flex flex-col gap-1.5">
        <Cap as="h2">{cap}</Cap>
        <h1 id="nf-title" className="text-[28px] font-bold leading-tight tracking-tight text-ink">{title}</h1>
        {note && <p className="text-[14px] leading-snug text-ink-muted">{note}</p>}
      </div>
      <div className="px-5 py-4 sm:px-6 flex flex-wrap gap-2">
        {links.map((l, i) => (
          <Link key={l.href} href={l.href} className={keyClass(l.variant ?? (i === 0 ? 'ink' : 'line'))}>{l.label}</Link>
        ))}
      </div>
    </section>
  );
}
