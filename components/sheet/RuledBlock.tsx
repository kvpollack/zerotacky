// A ruled block: 2 px edge, 1 px cell rules drawn as grid gaps over the rule colour. Children are the cells.
import React from 'react';

export type RuledBlockProps = {
  /** CSS grid-template-columns, e.g. "72px 72px 1fr 150px". */
  columns: string;
  /** CSS grid-template-rows. */
  rows?: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
};

export default function RuledBlock({ columns, rows, className = '', style, children }: RuledBlockProps) {
  return (
    <div className={`zt-block ${className}`} style={{ gridTemplateColumns: columns, gridTemplateRows: rows, ...style }}>
      {children}
    </div>
  );
}

export type CellProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Small grey printed heading above the value. */
  cap?: React.ReactNode;
  /** Filled-in value: set in pen. */
  pen?: boolean;
  /** Right-aligned numerals. */
  end?: boolean;
  /** Promoter slot: fills with the accent and its label colour. */
  accent?: boolean;
};

export function Cell({ cap, pen, end, accent: slot, className = '', style, children, ...rest }: CellProps) {
  return (
    <div
      {...rest}
      className={`flex flex-col justify-center px-2.5 ${end ? 'items-end text-right' : ''} ${slot ? 'bg-slot text-slot-label' : ''} ${pen && !slot ? 'text-pen' : ''} ${className}`}
      style={style}
    >
      {cap !== undefined && <div className={`text-[13px] tracking-[0.04em] mb-1 ${slot ? '' : 'text-ink-muted'}`}>{cap}</div>}
      {children}
    </div>
  );
}
