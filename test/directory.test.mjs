import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = process.env.ZT_ROOT || '..';
const D = await import(`${ROOT}/lib/website/directory.ts`);
const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(HERE, p), 'utf8');

describe('directory paging (UI pass 2)', () => {
  test('page size is 24', () => assert.equal(D.DIRECTORY_PAGE_SIZE, 24));

  test('nextShown steps by a page and stops at the total', () => {
    assert.equal(D.nextShown(24, 169), 48);
    assert.equal(D.nextShown(144, 169), 168);
    assert.equal(D.nextShown(168, 169), 169);
    assert.equal(D.nextShown(169, 169), 169);
    assert.equal(D.nextShown(24, 10), 10);
    assert.equal(D.nextShown(-5, 169), 24);
    assert.equal(D.nextShown(0, 0), 0);
  });

  test('moreLabel counts what the next press adds, and goes away at the end', () => {
    assert.equal(D.moreLabel(24, 169), 'Show 24 more');
    assert.equal(D.moreLabel(168, 169), 'Show 1 more');
    assert.equal(D.moreLabel(162, 169), 'Show 7 more');
    assert.equal(D.moreLabel(169, 169), null);
    assert.equal(D.moreLabel(24, 12), null);
  });

  test('shownLabel always states the total', () => {
    const gyms = ['gym', 'gyms'];
    assert.equal(D.shownLabel(24, 169, gyms), 'Showing 24 of 169 gyms');
    assert.equal(D.shownLabel(24, 12, gyms), 'Showing 12 gyms');
    assert.equal(D.shownLabel(24, 1, gyms), 'Showing 1 gym');
    assert.equal(D.shownLabel(24, 0, gyms), 'No gyms');
    assert.equal(D.shownLabel(169, 169, gyms), 'Showing 169 gyms');
  });

  test('walking the key from 24 reaches every gym exactly once', () => {
    let shown = D.DIRECTORY_PAGE_SIZE, presses = 0;
    while (D.moreLabel(shown, 169)) { shown = D.nextShown(shown, 169); presses++; assert.ok(presses < 50); }
    assert.equal(shown, 169);
    assert.equal(presses, 7);
  });
});

describe('gym card one-liners (UI pass 2)', () => {
  test('equipmentLine joins the first six and counts the rest', () => {
    assert.deepEqual(D.equipmentLine(['Log', 'Yoke', 'Stones']), { text: 'Log · Yoke · Stones', more: 0 });
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
    assert.deepEqual(D.equipmentLine(many), { text: 'a · b · c · d · e · f', more: 3 });
    assert.deepEqual(D.equipmentLine([]), { text: '', more: 0 });
    assert.deepEqual(D.equipmentLine([' Log ', '', '  ']), { text: 'Log', more: 0 });
  });

  test('dayPassSummary: every availability, with and without a price', () => {
    assert.deepEqual(D.dayPassSummary('available', '$15'), { label: 'Day pass', value: '$15', strong: true });
    assert.deepEqual(D.dayPassSummary('available', ''), { label: 'Day pass', value: 'Available', strong: true });
    assert.deepEqual(D.dayPassSummary('by_appointment', null), { label: 'Drop-in', value: 'By appointment', strong: false });
    assert.deepEqual(D.dayPassSummary('by_appointment', '$20'), { label: 'Drop-in', value: 'By appointment · $20', strong: false });
    assert.deepEqual(D.dayPassSummary('not_available', '$15'), { label: 'Day pass', value: 'Members only', strong: false });
    assert.equal(D.dayPassSummary('not_provided', undefined), null);
    // a price with no stated availability is still shown, never dropped and never a bare numeral (pass 1, finding 24)
    assert.deepEqual(D.dayPassSummary('not_provided', '$15'), { label: 'Day pass', value: '$15', strong: false });
  });

  test('cleanShownParam: only a whole page count between one page and the cap survives', () => {
    assert.equal(D.cleanShownParam('72'), 72);
    assert.equal(D.cleanShownParam('169'), 169);
    assert.equal(D.cleanShownParam(undefined), 24);
    assert.equal(D.cleanShownParam(''), 24);
    assert.equal(D.cleanShownParam('5'), 24);
    assert.equal(D.cleanShownParam('-72'), 24);
    assert.equal(D.cleanShownParam('7e9'), 24);
    assert.equal(D.cleanShownParam('72abc'), 24);
    assert.equal(D.cleanShownParam(['72', '96']), 72);
    assert.equal(D.cleanShownParam('999999'), D.DIRECTORY_MAX_SHOWN);
  });

  test('missingDetailsLine names each gap once, or says nothing', () => {
    const full = { streetAddress: '1 Main St', dayPassAvailability: 'available', dayPassPriceDisplay: '$15', dropInHours: '9-5', dropInPolicy: 'Sign a waiver' };
    assert.equal(D.missingDetailsLine(full), null);
    assert.equal(D.missingDetailsLine({ dayPassAvailability: 'not_provided' }), 'Not provided: street address, day pass, hours, drop-in policy.');
    assert.equal(D.missingDetailsLine({ ...full, dropInHours: '  ' }), 'Not provided: hours.');
    assert.equal(D.missingDetailsLine({ ...full, dayPassAvailability: 'not_provided' }), null, 'a price on file counts as day-pass information');
  });
});

describe('directory components keep the pass-2 structure', () => {
  test('GymsBrowser pages the list through the helpers and resets on a filter change', () => {
    const src = read('components/website/GymsBrowser.tsx');
    assert.ok(src.includes('DIRECTORY_PAGE_SIZE') && src.includes('nextShown(') && src.includes('moreLabel('));
    assert.ok(/rankedGyms\.slice\(0, shown\)/.test(src), 'only the shown slice is rendered');
    assert.ok(!/rankedGyms\.map\(/.test(src), 'the full list must not be mapped');
  });

  test('ShowRows renders a stacked phone list beside the desktop table', () => {
    const src = read('components/website/ShowRows.tsx');
    assert.ok(src.includes('md:hidden') && src.includes('data-zt-show-row'), 'the phone list');
    // .zt-block sets display:grid outside Tailwind's layers, so the table is hidden by a wrapper, never by `hidden` on the block
    assert.ok(/<div className="hidden md:block">\s*<div role="table"/.test(src), 'the desktop table sits in a hidden md:block wrapper');
    assert.ok(src.includes('opensElsewhere && <Link href={showPage}'), 'a row that opens the live board still links its show page');
    const blocks = src.match(/className="[^"]*\bzt-block\b[^"]*"/g) ?? [];
    assert.ok(blocks.length > 0 && blocks.every((c) => !/\bhidden\b/.test(c)), '`hidden` on a .zt-block does nothing');
  });

  test('every directory keeps its extra filters behind the shared toggle on phones', () => {
    for (const f of ['ShowsBrowser', 'GymsBrowser']) {
      const src = read(`components/website/${f}.tsx`);
      assert.ok(src.includes('<MoreFiltersToggle'), `${f} lacks the toggle`);
      assert.ok(src.includes('aria-controls') || src.includes('controls='), `${f} toggle is not tied to its panel`);
    }
  });
});

describe('horizontal scroll wrappers contain their absolutely positioned children', () => {
  // An sr-only element (position:absolute) inside an overflow-x-auto wrapper that is not itself positioned escapes the
  // clip and widens the whole document; phones then load the page zoomed out (found on the live results page 11/27).
  test('every overflow-x-auto wrapper on website, legal and promoter pages is `relative`', () => {
    for (const f of ['components/website/ShowDetailClient.tsx', 'components/website/PrepSheetClient.tsx', 'components/legal/MarkdownBlocks.tsx', 'components/promoter/CheckInDeskSection.tsx', 'components/promoter/RegistrationsSection.tsx']) {
      const wrappers = read(f).match(/className="[^"]*\boverflow-x-auto\b[^"]*"/g) ?? [];
      assert.ok(wrappers.length > 0, `${f} has no scroll wrapper; update this list`);
      for (const w of wrappers) assert.ok(/[" ]relative[" ]/.test(w), `${f}: ${w}`);
    }
  });
});
