import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
const ROOT = process.env.ZT_ROOT || '..';
const F = await import(`${ROOT}/lib/exportFederation.ts`);
const P = await import(`${ROOT}/lib/presets/index.ts`);
const { getGroupsSeedState } = await import('./fixtures/groupsSeed.ts');

const withResults = () => {
  const s = getGroupsSeedState();
  const g1 = s.athletes.filter((a) => a.divisionId === 'sf-g1');
  s.results = [
    { id: `sf-ev-1_${g1[0].id}`, eventId: 'sf-ev-1', athleteId: g1[0].id, reps: 12, updatedAt: 1 },
    { id: `sf-ev-1_${g1[1].id}`, eventId: 'sf-ev-1', athleteId: g1[1].id, reps: 8, locked: true, updatedAt: 2 },
    { id: `sf-ev-1_${g1[2].id}`, eventId: 'sf-ev-1', athleteId: g1[2].id, reps: 0, updatedAt: 3 },
  ];
  return s;
};
const meta = { venue: { facilityName: 'Iron Works Gym', city: 'Erie', state: 'PA' }, federation: 'Strongman Corporation', promoterContact: 'promoter@example.com', resultsUrl: 'https://www.zerotacky.com/shows/strongfest-2026' };

describe('federation results pack', () => {
  test('CSV: title block, then places first, scratched noted, link carried', () => {
    const s = withResults();
    const csv = F.federationResultsCsv(s, meta);
    const lines = csv.trimEnd().split('\r\n');
    assert.equal(lines[0], `Meet,${s.meet.name}`);
    assert.equal(lines[2], 'Venue,"Iron Works Gym, Erie, PA"');
    assert.equal(lines[3], 'Federation,Strongman Corporation');
    assert.equal(lines[6], 'Results link,https://www.zerotacky.com/shows/strongfest-2026');
    assert.equal(lines[7], '');
    assert.match(lines[8], /^Division,Place,Athlete,Bodyweight \(lb\),Status,Ev1 /);   // KM-09: the column names its unit
    assert.match(lines[8], /,Total Pts,Event Wins$/);
    const g1 = lines.slice(9).filter((l) => l.startsWith(`${s.divisions.find((d) => d.id === 'sf-g1').name},`));
    assert.equal(g1[0].split(',')[1], '1');            // the 12-rep athlete leads
    assert.ok(g1.length >= 3);
  });

  test('CSV: a withdrawn athlete is marked Scratched', () => {
    const s = withResults();
    const g1 = s.athletes.filter((a) => a.divisionId === 'sf-g1');
    g1[2].status = 'withdrawn';
    const csv = F.federationResultsCsv(s, meta);
    const row = csv.split('\r\n').find((l) => l.includes(`,${g1[2].name},`));
    assert.ok(row, 'row present');
    assert.ok(row.split(',').includes('Scratched'));
  });

  test('filename is slug + date', () => {
    const s = withResults();
    assert.match(F.federationCsvFilename(s), /^[a-z0-9-]+-results-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  test('email draft: SC address, subject with date, link in body, standings inline when short', () => {
    const s = withResults();
    s.divisions = s.divisions.filter((d) => d.id === 'sf-g1');
    s.athletes = s.athletes.filter((a) => a.divisionId === 'sf-g1');
    const d = F.federationEmailDraft(s, meta);
    assert.equal(d.to, F.SC_RESULTS_EMAIL);
    assert.equal(d.subject, `${s.meet.name} results, ${s.meet.date}`);
    assert.ok(d.body.includes(meta.resultsUrl));
    assert.ok(d.body.includes('Promoter contact: promoter@example.com'));
    assert.ok(d.mailto.startsWith('mailto:admin@strongmancorporation.com?subject='));
    assert.equal(d.standingsIncluded, true);
    assert.ok(d.body.includes(s.meet.name.toUpperCase()));
    assert.ok(d.mailto.length <= 1900);
  });

  test('email draft: a big meet drops the inline standings and points at the CSV', () => {
    const s = withResults();
    // 70 extra athletes in one division: the standings alone pass the mailto limit
    for (let i = 0; i < 70; i++) s.athletes.push({ ...s.athletes[0], id: `extra-${i}`, name: `Extra Athlete Number ${i}`, lotNumber: 100 + i });
    const d = F.federationEmailDraft(s, meta);
    assert.equal(d.standingsIncluded, false);
    assert.ok(d.body.includes('attached CSV'));
    assert.ok(d.mailto.length <= 1900);
  });

  test('email draft: the CSV fallback obeys the limit too, dropping contact, federation, then venue (BLD-06)', () => {
    const s = withResults();
    s.meet.name = 'Ü'.repeat(120);                              // 120-char multibyte name: 720 chars once URL-encoded, twice (subject + body)
    const big = {
      venue: { facilityName: 'F'.repeat(120), city: 'C'.repeat(80), state: 'PA' },
      federation: 'G'.repeat(80),
      promoterContact: 'H'.repeat(160),
      resultsUrl: 'https://www.zerotacky.com/shows/' + 'x'.repeat(60),
    };
    const d = F.federationEmailDraft(s, big);
    assert.equal(d.standingsIncluded, false);
    assert.ok(d.mailto.length <= 1900, `mailto ${d.mailto.length} over the limit`);
    assert.equal(d.trimmed, true);
    assert.ok(d.body.includes(big.resultsUrl));                // the link always survives
    assert.ok(!d.body.includes('Promoter contact'));
    // a short meet is not trimmed
    assert.equal(F.federationEmailDraft(withResults(), meta).trimmed, false);
  });

  test('CSV: names that look like formulas are kept as text (BLD-05)', () => {
    const s = withResults();
    const g1 = s.athletes.filter((a) => a.divisionId === 'sf-g1');
    g1[0].name = '=1+1';
    g1[1].name = '-Dash First';
    const csv = F.federationResultsCsv(s, meta);
    assert.ok(csv.includes(",'=1+1,"), 'formula prefix neutralized');
    assert.ok(csv.includes(",'-Dash First,"));
    assert.ok(!csv.includes(",=1+1,"));
  });

  test('venueLine tolerates a missing venue', () => {
    assert.equal(F.venueLine(null), '');
    assert.equal(F.venueLine({ city: 'Erie', state: 'PA' }), 'Erie, PA');
  });
});
