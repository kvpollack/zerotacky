'use client';
import React from 'react';
import type { Block, Inline } from '@/lib/legal/markdown';

// Renders the block model from lib/legal/markdown.ts. Used by /legal/<doc> (server page) and by the registration
// form's waiver step (client), so the athlete sees the same formatting the public page shows. Text nodes only.

export function renderInlines(inlines: Inline[]) {
  return inlines.map((x, i) => {
    if (x.kind === 'strong') return <strong key={i} className="font-bold text-ink">{x.text}</strong>;
    if (x.kind === 'em') return <em key={i}>{x.text}</em>;
    if (x.kind === 'code') return <code key={i} className="px-1 bg-ground text-[0.9em]">{x.text}</code>;
    if (x.kind === 'br') return <br key={i} />;
    return <span key={i}>{x.text}</span>;
  });
}

export default function MarkdownBlocks({ blocks, compact = false }: { blocks: Block[]; compact?: boolean }) {
  const body = compact ? 'text-[13px]' : 'text-[15px]';
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'heading': {
            const cls = b.level === 1
              ? (compact ? 'text-[17px] font-bold text-ink' : 'text-[28px] sm:text-[34px] font-bold leading-[1.05] text-ink')
              : b.level === 2
                ? (compact ? 'text-[15px] font-bold text-ink mt-3' : 'text-[22px] font-bold leading-tight text-ink mt-6')
                : (compact ? 'text-[13px] font-bold text-ink mt-2' : 'text-[17px] font-bold text-ink mt-4');
            const Tag = `h${b.level}` as 'h1' | 'h2' | 'h3';
            return <Tag key={i} className={cls}>{renderInlines(b.inlines)}</Tag>;
          }
          case 'paragraph':
            return <p key={i} className={`${body} text-ink leading-relaxed`}>{renderInlines(b.inlines)}</p>;
          case 'quote':
            return (
              <blockquote key={i} className="border-2 border-rule bg-ground px-4 py-3 text-[14px] leading-relaxed text-ink">
                {renderInlines(b.inlines)}
              </blockquote>
            );
          case 'list': {
            const Tag = b.ordered ? 'ol' : 'ul';
            return (
              <Tag key={i} className={`${b.ordered ? 'list-decimal' : 'list-disc'} pl-6 space-y-1.5 ${body} text-ink leading-relaxed`}>
                {b.items.map((it, j) => <li key={j}>{renderInlines(it)}</li>)}
              </Tag>
            );
          }
          case 'table':
            return (
              <div key={i} className="overflow-x-auto border-2 border-rule">
                <table className="w-full text-left text-[13px] text-ink">
                  <thead className="bg-ground text-xs uppercase tracking-[0.06em] font-normal text-ink-muted">
                    <tr>{b.header.map((c, j) => <th key={j} className="px-3 py-2 align-top">{renderInlines(c)}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-rule">
                    {b.rows.map((r, j) => (
                      <tr key={j}>{r.map((c, k) => <td key={k} className="px-3 py-2 align-top">{renderInlines(c)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case 'rule':
            return <hr key={i} className="border-rule" />;
        }
      })}
    </>
  );
}
