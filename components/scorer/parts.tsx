'use client';
// Phase 5 (11/2): the scorer's form grammar, shared by every screen. A field is a ruled cell with a muted label over
// a pen-blue value; a choice is a strip of keys with the chosen one filled ink; a list is a ruled block of rows.
// Red pen is for scratches and refusals only. Nothing here takes the promoter's colour.
import React from 'react';

export const CAP = 'text-ink-muted tracking-[0.04em]';
const KEY_BASE = 'font-sheet uppercase font-bold rounded-none flex items-center justify-center gap-2 text-center select-none px-3 leading-tight disabled:cursor-not-allowed';
export const KEY = {
  line: `${KEY_BASE} bg-sheet text-ink border-2 border-rule`,
  pen: `${KEY_BASE} bg-pen text-pen-label`,
  ink: `${KEY_BASE} bg-ink text-sheet`,
  red: `${KEY_BASE} bg-sheet text-redpen border-2 border-redpen`,
  off: `${KEY_BASE} zt-key-off`,
} as const;
export type KeyVariant = keyof typeof KEY;

export function Key({ variant = 'line', size = 'md', className = '', disabled, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: KeyVariant; size?: 'sm' | 'md' | 'lg' }) {
  const h = size === 'sm' ? 'min-h-[34px] text-[11px]' : size === 'lg' ? 'min-h-[56px] text-[16px]' : 'min-h-[40px] text-[13px]';
  return <button type="button" disabled={disabled} className={`${disabled ? KEY.off : KEY[variant]} ${h} ${className}`} {...rest} />;
}

export function Row({ children, className = '', cols = 2 }: { children: React.ReactNode; className?: string; cols?: 2 | 3 }) {
  return <div className={`grid gap-2 ${cols === 3 ? 'grid-cols-3' : 'grid-cols-2'} ${className}`}>{children}</div>;
}

/** Section heading row: bold left, muted right. */
export function Sec({ children, right, className = '', id }: { children: React.ReactNode; right?: React.ReactNode; className?: string; id?: string }) {
  return (
    <div id={id} className={`flex items-baseline justify-between gap-2 px-0.5 text-[12px] font-bold ${className}`}>
      <span className="min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">{children}</span>
      {right !== undefined && <span className={`shrink-0 text-[10px] font-normal ${CAP}`}>{right}</span>}
    </div>
  );
}

export function Note({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-[10px] leading-snug text-ink-muted normal-case mt-1 ${className}`}>{children}</p>;
}

/** A form cell. `wide` spans the two-column form block. */
export function Field({ label, children, wide, className = '', note }: { label?: React.ReactNode; children: React.ReactNode; wide?: boolean; className?: string; note?: React.ReactNode }) {
  return (
    <label className={`flex flex-col justify-center px-2 py-1.5 min-h-[44px] ${wide ? 'col-span-full' : ''} ${className}`}>
      {label !== undefined && <span className={`block text-[9px] mb-0.5 whitespace-nowrap overflow-hidden text-ellipsis ${CAP}`}>{label}</span>}
      {children}
      {note && <Note>{note}</Note>}
    </label>
  );
}

/** A read-only value in a field: pen when filled, muted when empty. */
export function Val({ children, empty, className = '' }: { children: React.ReactNode; empty?: boolean; className?: string }) {
  return <span className={`block text-[15px] font-bold whitespace-nowrap overflow-hidden text-ellipsis ${empty ? 'text-ink-muted font-normal' : 'text-pen'} ${className}`}>{children}</span>;
}

const INPUT = 'zt-input font-sheet !min-h-[32px] !py-1 !px-1.5 !border-0 !text-[15px] disabled:opacity-50';
export function TextInput({ className = '', ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={`${INPUT} ${className}`} />;
}
export function NumInput({ value, onChange, className = '', ...rest }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: number | string | undefined | null; onChange: (v: string) => void }) {
  return <input type="number" inputMode="decimal" {...rest} value={value === undefined || value === null ? '' : value} onChange={(e) => onChange(e.target.value)} className={`${INPUT} ${className}`} />;
}
export function Select({ className = '', children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select {...rest} className={`${INPUT} appearance-none pr-6 ${className}`}>{children}</select>
      <span aria-hidden="true" className="absolute right-1 top-1/2 -translate-y-1/2 text-[11px] pointer-events-none">&#x25BE;</span>
    </span>
  );
}

/** A strip of keys, one chosen. `inset` drops the outer border (for use inside a ruled cell). */
export function KeyGroup<T extends string>({ options, value, onChange, ariaLabel, disabled, size = 'sm', className = '' }: {
  options: ReadonlyArray<{ value: T; label: React.ReactNode; disabled?: boolean }>;
  value: T | null | undefined;
  onChange: (v: T) => void;
  ariaLabel: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const h = size === 'sm' ? 'min-h-[34px] text-[11px]' : 'min-h-[44px] text-[13px]';
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={`zt-block grid-flow-col auto-cols-fr ${className}`}>
      {options.map((o) => {
        const on = o.value === value;
        const off = disabled || o.disabled;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={off}
            onClick={() => onChange(o.value)}
            className={`font-sheet uppercase font-bold text-center leading-[1.05] px-1 flex items-center justify-center ${h} ${on ? '!bg-ink text-sheet' : off ? 'text-ink-muted' : 'text-ink'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** List header cell and row cell. */
export function LH({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <div className={`px-1.5 min-h-[18px] flex items-center text-[9px] whitespace-nowrap ${CAP} ${className}`}>{children}</div>;
}
export function LR({ children, className = '', center, sel, ...rest }: React.HTMLAttributes<HTMLDivElement> & { center?: boolean; sel?: boolean }) {
  return (
    <div {...rest} className={`px-1.5 min-h-[28px] flex items-center text-[13px] whitespace-nowrap overflow-hidden text-ellipsis ${center ? 'justify-center text-center' : ''} ${sel ? '!bg-ink text-sheet' : ''} ${className}`}>
      {children}
    </div>
  );
}

/** A one-line notice in a ruled box: cap left, pen value right. */
export function Toast({ cap, children, tone = 'pen' }: { cap: React.ReactNode; children: React.ReactNode; tone?: 'pen' | 'red' | 'ink' }) {
  return (
    <div role="status" className="border-2 border-rule px-2 min-h-[30px] flex items-center justify-between gap-2 text-[11px]">
      <span className={CAP}>{cap}</span>
      <span className={`font-bold text-right min-w-0 ${tone === 'red' ? 'text-redpen' : tone === 'ink' ? 'text-ink' : 'text-pen'}`}>{children}</span>
    </div>
  );
}

export const NoMark = ({ children }: { children: React.ReactNode }) => (
  <span className="text-redpen font-bold"><span aria-hidden="true" className="font-normal">&#x2715;</span> {children}</span>
);
