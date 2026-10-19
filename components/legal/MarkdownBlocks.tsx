'use client';
import React from 'react';
import type { Block, Inline } from '@/lib/legal/markdown';

// Renders the block model from lib/legal/markdown.ts. Used by /legal/<doc> (server page) and by the registration
// form's waiver step (client), so the athlete sees the same formatting the public page shows. Text nodes only.

export function renderInlines(inlines: Inline[]) {
  return inlines.map((x, i) => {
    if (x.kind === 'strong') return <strong key={i} className="font-black text-zt-text">{x.text}</strong>;
    if (x.kind === 'em') return <em key={i}>{x.text}</em>;
    if (x.kind === 'code') return <code key={i} className="px-1 rounded bg-zt-inset text-[0.9em]">{x.text}</code>;
    if (x.kind === 'br') return <br key={i} />;
    return <span key={i}>{x.text}</span>;
  });
}

export default function MarkdownBlocks({ blocks, compact = false }: { blocks: Block[]; compact?: boolean }) {
  const body = compact ? 'text-xs' : 'text-sm';
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'heading': {
            const cls = b.level === 1
              ? (compact ? 'text-base font-black text-zt-text' : 'text-2xl sm:text-3xl font-black text-zt-text')
              : b.level === 2
                ? (compact ? 'text-sm font-black text-zt-text mt-3' : 'text-lg font-black text-zt-text mt-6')
                : (compact ? 'text-xs font-black text-zt-text mt-2' : 'text-base font-black text-zt-text mt-4');
            const Tag = `h${b.level}` as 'h1' | 'h2' | 'h3';
            return <Tag key={i} className={cls}>{renderInlines(b.inlines)}</Tag>;
          }
          case 'paragraph':
            return <p key={i} className={`${body} text-zt-text-2 leading-relaxed`}>{renderInlines(b.inlines)}</p>;
          case 'quote':
            return (
              <blockquote key={i} className="border-l-4 border-amber-500/60 bg-amber-500/10 rounded-r-xl px-4 py-3 text-xs font-semibold text-amber-200">
                {renderInlines(b.inlines)}
              </blockquote>
            );
          case 'list': {
            const Tag = b.ordered ? 'ol' : 'ul';
            return (
              <Tag key={i} className={`${b.ordered ? 'list-decimal' : 'list-disc'} pl-6 space-y-1.5 ${body} text-zt-text-2 leading-relaxed`}>
                {b.items.map((it, j) => <li key={j}>{renderInlines(it)}</li>)}
              </Tag>
            );
          }
          case 'table':
            return (
              <div key={i} className="overflow-x-auto rounded-xl border border-zt-border">
                <table className="w-full text-left text-xs text-zt-text-2">
                  <thead className="bg-zt-inset text-[11px] uppercase font-extrabold text-zt-muted">
                    <tr>{b.header.map((c, j) => <th key={j} className="px-3 py-2 align-top">{renderInlines(c)}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-zt-border">
                    {b.rows.map((r, j) => (
                      <tr key={j}>{r.map((c, k) => <td key={k} className="px-3 py-2 align-top">{renderInlines(c)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case 'rule':
            return <hr key={i} className="border-zt-border" />;
        }
      })}
    </>
  );
}
