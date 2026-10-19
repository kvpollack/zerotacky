// Minimal Markdown -> block model for the legal documents in legal/*.md (headings, paragraphs, bullet and numbered
// lists, blockquotes, pipe tables, horizontal rules; inline bold, italics and code). No HTML passthrough: the files are
// ours, but the renderer still emits text nodes only. Shared by app/legal/[doc] and unit-tested in test/legal.test.mjs.

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'em'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'br'; text: '' }; // a Markdown hard break (two trailing spaces)

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; inlines: Inline[] }
  | { kind: 'paragraph'; inlines: Inline[] }
  | { kind: 'quote'; inlines: Inline[] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] }
  | { kind: 'table'; header: Inline[][]; rows: Inline[][][] }
  | { kind: 'rule' };

export const LEGAL_DOCS = {
  terms: { file: 'TERMS.md', title: 'Terms of Use' },
  privacy: { file: 'PRIVACY.md', title: 'Privacy Policy' },
  waiver: { file: 'WAIVER.md', title: 'Competition Waiver (template)' },
} as const;
export type LegalDocId = keyof typeof LEGAL_DOCS;

export function isLegalDocId(x: string): x is LegalDocId {
  return Object.prototype.hasOwnProperty.call(LEGAL_DOCS, x);
}

const INLINE_RE = /(\*\*[^*]+\*\*|`[^`]+`|(?<![\w*])\*[^*\n]+\*(?![\w*]))/g;

export function parseInline(text: string): Inline[] {
  // hard breaks were encoded as '\n' by parseMarkdown; split on them and parse each piece
  if (text.includes('\n')) {
    return text.split('\n').flatMap((piece, i) => (i === 0 ? parseInlineOne(piece) : [{ kind: 'br', text: '' } as Inline, ...parseInlineOne(piece)]));
  }
  return parseInlineOne(text);
}

function parseInlineOne(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ kind: 'text', text: text.slice(last, idx) });
    const tok = m[0];
    if (tok.startsWith('**')) out.push({ kind: 'strong', text: tok.slice(2, -2) });
    else if (tok.startsWith('`')) out.push({ kind: 'code', text: tok.slice(1, -1) });
    else out.push({ kind: 'em', text: tok.slice(1, -1) });
    last = idx + tok.length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

function splitRow(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  const flushPara = (buf: string[]) => {
    if (buf.length) blocks.push({ kind: 'paragraph', inlines: parseInline(buf.join('').replace(/[ \n]+$/, '')) });
    buf.length = 0;
  };
  const para: string[] = [];
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (t === '') { flushPara(para); i++; continue; }
    if (/^---+$/.test(t)) { flushPara(para); blocks.push({ kind: 'rule' }); i++; continue; }
    const h = /^(#{1,3})\s+(.*)$/.exec(t);
    if (h) { flushPara(para); blocks.push({ kind: 'heading', level: h[1].length as 1 | 2 | 3, inlines: parseInline(h[2]) }); i++; continue; }
    if (t.startsWith('>')) {
      flushPara(para);
      const q: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) { q.push(lines[i].trim().replace(/^>\s?/, '')); i++; }
      blocks.push({ kind: 'quote', inlines: parseInline(q.join(' ')) });
      continue;
    }
    if (t.startsWith('|')) {
      flushPara(para);
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(splitRow(lines[i])); i++; }
      const header = rows[0] ?? [];
      const body = rows.filter((r, idx) => idx > 0 && !r.every((c) => /^:?-{2,}:?$/.test(c)));
      blocks.push({ kind: 'table', header: header.map(parseInline), rows: body.map((r) => r.map(parseInline)) });
      continue;
    }
    const li = /^(?:[-*]|\d+\.)\s+(.*)$/.exec(t);
    if (li) {
      flushPara(para);
      const ordered = /^\d+\./.test(t);
      const items: Inline[][] = [];
      while (i < lines.length) {
        const m = /^(?:[-*]|\d+\.)\s+(.*)$/.exec(lines[i].trim());
        if (!m) break;
        let item = m[1];
        // continuation lines indented under the bullet
        while (i + 1 < lines.length && /^\s{2,}\S/.test(lines[i + 1]) && !/^\s*(?:[-*]|\d+\.)\s/.test(lines[i + 1])) { i++; item += ' ' + lines[i].trim(); }
        items.push(parseInline(item));
        i++;
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }
    // paragraph line; a trailing double space is a Markdown hard break (kept as '\n' for parseInline), else a soft space
    para.push(/\s{2}$/.test(line) ? t + '\n' : t + ' ');
    i++;
  }
  flushPara(para);
  return blocks;
}

// Plain-text projection, used by tests and by the <title>/description fallbacks.
export function inlinesToText(inlines: Inline[]): string {
  return inlines.map((x) => x.text).join('');
}
