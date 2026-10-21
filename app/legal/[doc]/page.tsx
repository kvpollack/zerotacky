import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Link from 'next/link';
import WebsiteShell from '@/components/website/WebsiteShell';
import { LEGAL_DOCS, isLegalDocId, parseMarkdown } from '@/lib/legal/markdown';
import MarkdownBlocks from '@/components/legal/MarkdownBlocks';
import { canonical } from '@/lib/website/seo';

// /legal/terms, /legal/privacy, /legal/waiver render the Markdown in legal/*.md. The waiver page shows the template
// with its {{placeholders}} intact; the filled copy an athlete accepts is on /register/<slug>, and the version id
// stored with each registration is the hash of this same file (lib/promoter/waiverVersion.ts).

export const dynamicParams = false;
export function generateStaticParams() {
  return Object.keys(LEGAL_DOCS).map((doc) => ({ doc }));
}

type Params = { params: Promise<{ doc: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { doc } = await params;
  if (!isLegalDocId(doc)) return { title: 'Not found | ZeroTacky' };
  return { title: `${LEGAL_DOCS[doc].title} | ZeroTacky`, description: `ZeroTacky ${LEGAL_DOCS[doc].title}.`, ...canonical(`/legal/${doc}`) };
}

export default async function LegalPage({ params }: Params) {
  const { doc } = await params;
  if (!isLegalDocId(doc)) notFound();
  const text = readFileSync(join(process.cwd(), 'legal', LEGAL_DOCS[doc].file), 'utf-8');
  const blocks = parseMarkdown(text);
  return (
    <WebsiteShell>
      <article className="max-w-3xl mx-auto space-y-4 print:text-black">
        <nav className="flex flex-wrap gap-3 text-[11px] font-extrabold uppercase tracking-wider text-zt-muted">
          {(Object.keys(LEGAL_DOCS) as Array<keyof typeof LEGAL_DOCS>).map((id) => (
            <Link key={id} href={`/legal/${id}`} className={id === doc ? 'text-zt-primary' : 'hover:text-zt-primary'}>
              {LEGAL_DOCS[id].title}
            </Link>
          ))}
        </nav>
        <MarkdownBlocks blocks={blocks} />
        {doc === 'waiver' && (
          <p className="text-[11px] text-zt-muted">
            This is the template. The copy you accept when registering has the competition, date, promoter and venue filled in, and
            its version id is stored with your registration.
          </p>
        )}
      </article>
    </WebsiteShell>
  );
}
