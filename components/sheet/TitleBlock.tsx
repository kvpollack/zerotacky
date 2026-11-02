// The title block: a fixed form bottom-right (or along the bottom) whose field values are the only thing that
// changes. TITLE, CLIENT (the promoter's slot), VENUE, DATE, DIVISION, SHEET, REV, STATUS, UNITS, with the
// stone in the logo cell. REV is a letter that advances on every score lock, skipping I O Q S X Z.
import React from 'react';
import RuledBlock, { Cell } from './RuledBlock';
import StoneMark from './StoneMark';

export const REV_LETTERS = 'ABCDEFGHJKLMNPRTUVWY';
export function nextRev(rev: string): string {
  const i = REV_LETTERS.indexOf(rev);
  return i === -1 ? 'A' : REV_LETTERS[Math.min(i + 1, REV_LETTERS.length - 1)];
}
export function revFromCount(locks: number): string {
  return REV_LETTERS[Math.min(Math.max(0, locks), REV_LETTERS.length - 1)];
}

export type TitleField = { cap: string; value: React.ReactNode; span?: number; slot?: boolean; className?: string };

export type TitleBlockProps = {
  fields: TitleField[];
  columns: string;
  rows?: string;
  /** Rows the logo cell spans (it is always the first column). */
  logoRows?: number;
  logoSize?: string | number;
  valueClass?: string;
  className?: string;
};

export default function TitleBlock({ fields, columns, rows, logoRows = 2, logoSize = 72, valueClass = 'text-xl font-bold whitespace-nowrap', className = '' }: TitleBlockProps) {
  return (
    <RuledBlock columns={columns} rows={rows} className={`border-x-0 border-b-0 ${className}`}>
      <Cell className="items-center justify-center" style={{ gridRow: `1 / ${logoRows + 1}` }}>
        <StoneMark size={logoSize} stroke={7} title="ZeroTacky" />
      </Cell>
      {fields.map((f) => (
        <Cell key={f.cap} cap={f.cap} accent={f.slot} className={f.className} style={f.span ? { gridColumn: `span ${f.span}` } : undefined}>
          <div className={valueClass}>{f.value}</div>
        </Cell>
      ))}
    </RuledBlock>
  );
}
