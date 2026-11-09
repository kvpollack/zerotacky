// Website primitives in the sheet grammar (UI transition Phase 3, 11/2; mockup hybrid/web.css). Server-safe.
// Cap = the small grey printed heading. Key = a button drawn as an ink key (ink fill), a line key (2 px rule) or a
// pen key (pen fill). WebCell = a cell of a ruled block with web padding. Copy is the caller's; these only set type.
import React from 'react';
import Link from 'next/link';

export function Cap({ children, className = '', as: Tag = 'div', id }: { children: React.ReactNode; className?: string; as?: 'div' | 'h2' | 'h3' | 'span'; id?: string }) {
  return <Tag id={id} className={`text-xs font-bold tracking-[0.06em] uppercase text-ink-muted ${className}`}>{children}</Tag>;
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
    <button type={type} className={keyClass(variant, `${className} disabled:opacity-50 disabled:cursor-not-allowed`)} {...rest}>
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

/** Section heading row: a cap above a ruled block, with an optional right-hand link. */
export function SectionCap({ children, aside, id }: { children: React.ReactNode; aside?: React.ReactNode; id?: string }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-2.5">
      <Cap as="h2" id={id}>{children}</Cap>
      {aside}
    </div>
  );
}

/** Header strip cells: 56 px tall, 13 px bold uppercase, 1 px rule on the right; the active one is filled in ink. */
export const NAV_LINK = 'flex items-center h-14 px-3.5 2xl:px-[18px] whitespace-nowrap shrink-0 border-r border-rule text-[13px] font-bold uppercase tracking-[0.04em] no-underline transition outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-pen focus-visible:-outline-offset-2';
export const navClass = (active: boolean) => `${NAV_LINK} ${active ? 'bg-ink text-sheet' : 'text-ink hover:bg-ground'}`;

/** Inline link in running text: ink, underlined, pen on hover. */
export const textLink = 'font-bold underline underline-offset-4 decoration-1 text-ink hover:text-pen';
