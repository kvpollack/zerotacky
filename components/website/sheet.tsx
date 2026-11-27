// Website primitives in the sheet grammar (UI transition Phase 3, 11/2; mockup hybrid/web.css). Server-safe.
// Cap = the small grey printed heading. Key = a button drawn as an ink key (ink fill), a line key (2 px rule) or a
// pen key (pen fill). WebCell = a cell of a ruled block with web padding. Copy is the caller's; these only set type.
import React from 'react';
import Link from 'next/link';

export function Cap({ children, className = '', as: Tag = 'div', id }: { children: React.ReactNode; className?: string; as?: 'div' | 'h2' | 'h3' | 'span'; id?: string }) {
  return <Tag id={id} className={`zt-cap text-[11px] font-medium tracking-[0.08em] uppercase text-ink-muted ${className}`}>{children}</Tag>;
}

export type KeyVariant = 'ink' | 'line' | 'pen';
const KEY_BASE = 'inline-flex items-center justify-center gap-2.5 min-h-12 px-5 font-bold text-sm uppercase tracking-[0.04em] no-underline text-center transition outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-pen focus-visible:outline-offset-2';
const KEY_VARIANT: Record<KeyVariant, string> = {
  ink: 'bg-ink text-sheet hover:bg-pen hover:text-pen-label',
  line: 'border-2 border-rule text-ink hover:bg-ink hover:text-sheet',
  pen: 'bg-pen text-pen-label hover:bg-ink hover:text-sheet',
};
export function keyClass(variant: KeyVariant = 'ink', extra = ''): string {
  return `${KEY_BASE} ${KEY_VARIANT[variant]} ${extra}`;
}

type KeyLinkProps = { href: string; variant?: KeyVariant; className?: string; children: React.ReactNode } & Omit<React.ComponentProps<typeof Link>, 'href' | 'className' | 'children'>;
export function Key({ href, variant = 'ink', className = '', children, ...rest }: KeyLinkProps) {
  return (
    <Link href={href} className={keyClass(variant, className)} {...rest}>
      {children}
    </Link>
  );
}

type KeyButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: KeyVariant };
export function KeyButton({ variant = 'ink', className = '', type = 'button', children, ...rest }: KeyButtonProps) {
  return (
    <button type={type} className={keyClass(variant, `${className} disabled:bg-transparent disabled:text-ink-muted disabled:border-2 disabled:border-rule-subtle disabled:cursor-not-allowed`)} {...rest}>
      {children}
    </button>
  );
}

/** A cell inside a `.zt-block` ruled block, with web padding. `pad` picks the mockup paddings. */
export function WebCell({ children, className = '', pad = 'md', style, ...rest }: React.HTMLAttributes<HTMLDivElement> & { pad?: 'none' | 'sm' | 'md' | 'lg' }) {
  const p = pad === 'none' ? '' : pad === 'sm' ? 'px-3.5 py-2' : pad === 'lg' ? 'px-6 py-6 sm:px-7 sm:py-7' : 'px-5 py-4 sm:px-6 sm:py-5';
  return (
    <div {...rest} style={style} className={`flex flex-col justify-start gap-2 min-w-0 ${p} ${className}`}>
      {children}
    </div>
  );
}

/** Section heading row above a ruled block, with an optional right-hand link. Pass 1 (11/18): a real heading, 20 px
 *  bold in ink and normal case, so "Competition Bests" no longer reads like a field label (Astra 7, Fable 4 / 22). */
export function SectionCap({ children, aside, id }: { children: React.ReactNode; aside?: React.ReactNode; id?: string }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-2.5">
      <h2 id={id} className="text-[20px] leading-[1.3] font-bold text-ink">{children}</h2>
      {aside}
    </div>
  );
}

/** The coloured band at the top of a show, gym or registration page. Pass 1 (11/18, Fable 6 / Astra 10): the record's
 *  own name on its own line (22 px phone, 26 px desktop), the date · venue line under it, status words on the right. */
export function TitleBand({ name, meta, status, className = '' }: { name: React.ReactNode; meta?: React.ReactNode[]; status?: React.ReactNode[]; className?: string }) {
  const metaItems = (meta ?? []).filter((m) => m !== null && m !== undefined && m !== false);
  const statusItems = (status ?? []).filter((s) => s !== null && s !== undefined && s !== false);
  return (
    <div className={`bg-slot text-slot-label border-2 border-b-0 border-rule flex flex-wrap items-end justify-between gap-x-6 gap-y-2 px-5 sm:px-7 min-h-16 py-4 leading-snug ${className}`}>
      <h1 className="font-normal min-w-0">
        <span className="block font-bold text-[22px] sm:text-[26px] leading-[1.15] break-words">{name}</span>
        {metaItems.length > 0 && (
          <span className="block mt-1 text-[14px] sm:text-[15px]">
            {metaItems.map((m, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="opacity-60 mx-2.5" aria-hidden="true">·</span>}
                <span>{m}</span>
              </React.Fragment>
            ))}
          </span>
        )}
      </h1>
      {statusItems.length > 0 && (
        <div className="text-[12px] sm:text-[13px] uppercase tracking-[0.06em]">
          {statusItems.map((s, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="opacity-60 mx-2.5" aria-hidden="true">·</span>}
              <span>{s}</span>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

/** Header strip cells: 56 px tall, 13 px bold uppercase, 1 px rule on the right; the active one is filled in ink. */
export const NAV_LINK = 'flex items-center h-full px-3.5 2xl:px-[18px] whitespace-nowrap shrink-0 border-r border-rule text-[13px] font-bold uppercase tracking-[0.04em] no-underline transition outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-pen focus-visible:-outline-offset-2';
export const navClass = (active: boolean) => `${NAV_LINK} ${active ? 'bg-ink text-sheet' : 'text-ink hover:bg-ground'}`;

/** Inline link in running text: ink, underlined, pen on hover. */
export const textLink = 'font-bold underline underline-offset-4 decoration-1 text-ink hover:text-pen';
// A standalone action link (not inside a sentence): the same link, 44 px tall so a thumb can hit it (pass 2, finding 20).
export const actionLink = `inline-flex items-center min-h-11 ${textLink}`;

// Pass 2 (finding 13): a directory keeps its two main filters in view and the rest behind this toggle on phones. From
// md up the toggle is hidden and the panel it controls is always open, so the caller hides the panel with
// `open ? '' : 'hidden md:grid'`. `count` is how many of the hidden filters are set.
export function MoreFiltersToggle({ open, onToggle, count, controls, className = '' }: { open: boolean; onToggle: () => void; count: number; controls: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      className={`md:hidden inline-flex items-center justify-between gap-3 min-h-11 px-3.5 border-2 border-rule bg-sheet text-[13px] font-bold uppercase tracking-[0.04em] text-ink outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-pen focus-visible:outline-offset-2 ${className}`}
    >
      <span>{open ? 'Fewer filters' : 'More filters'}{count > 0 && <span className="text-pen"> · {count} on</span>}</span>
      <span aria-hidden="true">{open ? '−' : '+'}</span>
    </button>
  );
}
