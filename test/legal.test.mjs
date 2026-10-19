// The legal pages render legal/*.md through lib/legal/markdown.ts. These tests pin the parser on the constructs the
// three documents actually use and check each document parses to a title plus the sections the product relies on.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, process.env.ZT_ROOT || '..');
const M = await import(`${process.env.ZT_ROOT || '..'}/lib/legal/markdown.ts`);

describe('legal markdown parser', () => {
  test('headings, paragraphs, lists, quotes, tables, rules and inline marks', () => {
    const src = [
      '# Title', '', '> **DRAFT.** note', '', 'Para one', 'continues here.', '', '## Section', '', '- a **bold** item', '- `code` item',
      '', '1. first', '2. second', '', '| H1 | H2 |', '|---|---|', '| c1 | *c2* |', '', '---', '', 'End',
    ].join('\n');
    const b = M.parseMarkdown(src);
    assert.deepEqual(b.map((x) => x.kind), ['heading', 'quote', 'paragraph', 'heading', 'list', 'list', 'table', 'rule', 'paragraph']);
    assert.equal(M.inlinesToText(b[2].inlines), 'Para one continues here.');
    assert.equal(b[1].inlines[0].kind, 'strong');
    assert.equal(b[4].ordered, false); assert.equal(b[5].ordered, true);
    assert.deepEqual(b[4].items[0].map((x) => x.kind), ['text', 'strong', 'text']);
    assert.equal(b[4].items[1][0].kind, 'code');
    assert.equal(b[6].rows.length, 1); assert.equal(b[6].rows[0][1][0].kind, 'em');
  });

  test('two trailing spaces are a hard break; a plain newline is a space', () => {
    const b = M.parseMarkdown('**A:** one  \n**B:** two\nstill two');
    assert.deepEqual(b[0].inlines.map((x) => x.kind), ['strong', 'text', 'br', 'strong', 'text']);
    assert.equal(b[0].inlines[4].text, ' two still two');
  });

  test('placeholders and emails survive as plain text', () => {
    const b = M.parseMarkdown('**Competition:** {{EVENT_NAME}} mail privacy@zerotacky.com');
    assert.equal(M.inlinesToText(b[0].inlines), 'Competition: {{EVENT_NAME}} mail privacy@zerotacky.com');
  });

  test('each legal document parses to one H1 and the sections the product relies on', () => {
    for (const [id, { file }] of Object.entries(M.LEGAL_DOCS)) {
      const b = M.parseMarkdown(readFileSync(path.join(ROOT, 'legal', file), 'utf8'));
      assert.equal(b.filter((x) => x.kind === 'heading' && x.level === 1).length, 1, `${id} has one H1`);
      assert.ok(b.some((x) => x.kind === 'heading' && x.level === 2), `${id} has sections`);
      assert.ok(b.length > 8, `${id} parsed into ${b.length} blocks`);
    }
    const waiver = M.parseMarkdown(readFileSync(path.join(ROOT, 'legal/WAIVER.md'), 'utf8'));
    const h2 = waiver.filter((x) => x.kind === 'heading' && x.level === 2).map((x) => M.inlinesToText(x.inlines));
    assert.ok(h2.some((t) => /under 18/i.test(t)), 'waiver has the minors section the registration form points to');
    assert.ok(h2.some((t) => /indemn/i.test(t)));
    assert.ok(h2.some((t) => /electronic/i.test(t)));
    for (const ph of ['{{EVENT_NAME}}', '{{EVENT_DATE}}', '{{PROMOTER_NAME}}', '{{VENUE_NAME_AND_ADDRESS}}']) {
      assert.ok(readFileSync(path.join(ROOT, 'legal/WAIVER.md'), 'utf8').includes(ph), `waiver still carries ${ph} for RegisterClient`);
    }
    assert.ok(M.isLegalDocId('terms') && !M.isLegalDocId('nope'));
  });
});
