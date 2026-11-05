import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.env.ZT_ROOT || '..';
const R = await import(`${ROOT}/lib/roster/import.ts`);
const MB = await import(`${ROOT}/lib/meetBuilder.ts`);

const base = () => {
  let s = MB.createBlankMeet('Iron Harbor', '2026-12-01');
  s = MB.addDivision(s, { id: 'd-nm', name: 'Novice Men' });
  s = MB.addDivision(s, { id: 'd-ow', name: 'Open Women' });
  s = MB.addAthlete(s, { divisionId: 'd-nm', name: 'Dan Vance', lotNumber: 1 });
  return s;
};
const plan = (text, s = base(), overrides = {}) => {
  const rows = R.parseDelimited(text);
  const hasHeader = overrides.hasHeader ?? R.looksLikeHeader(rows[0]);
  const mapping = overrides.mapping ?? R.guessMapping(rows[0], hasHeader);
  return R.buildRosterPlan({ rows, mapping, hasHeader, divisions: s.divisions, athletes: s.athletes, defaultDivisionId: overrides.defaultDivisionId ?? 'd-nm' });
};

describe('parseDelimited', () => {
  test('detects tabs, commas and semicolons; drops blank lines; pads short rows', () => {
    assert.deepEqual(R.parseDelimited('a\tb\n\n1\t2\n'), [['a', 'b'], ['1', '2']]);
    assert.deepEqual(R.parseDelimited('a,b\n1'), [['a', 'b'], ['1', '']]);
    assert.deepEqual(R.parseDelimited('a;b;c\n1;2;3'), [['a', 'b', 'c'], ['1', '2', '3']]);
    assert.equal(R.detectDelimiter('x;y,z;w'), ';');
  });
  test('handles quoted commas, doubled quotes, CRLF and a BOM', () => {
    const rows = R.parseDelimited('\uFEFFName,Division\r\n"Vance, Dan","Novice ""Men"""\r\n');
    assert.deepEqual(rows, [['Name', 'Division'], ['Vance, Dan', 'Novice "Men"']]);
  });
});

describe('header detection and mapping', () => {
  test('known aliases make a header row; numbers in the first row do not', () => {
    assert.equal(R.looksLikeHeader(['Athlete', 'Class', 'BW']), true);
    assert.equal(R.looksLikeHeader(['Kurt Pollack', 'Open', '231']), false);
    assert.equal(R.looksLikeHeader(['Kurt Pollack']), false);
  });
  test('guessMapping claims each field once and falls back to first column = name', () => {
    assert.deepEqual(R.guessMapping(['First', 'Last', 'Weight Class', 'Weigh-In', 'Lot', 'Notes'], true), ['firstName', 'lastName', 'division', 'bodyweight', 'lot', 'ignore']);
    assert.deepEqual(R.guessMapping(['Name', 'Athlete Name'], true), ['name', 'ignore']);
    assert.deepEqual(R.guessMapping(['Kurt', 'x'], false), ['name', 'ignore']);
  });
  test('bodyweight and lot parsing', () => {
    assert.equal(R.parseBodyweight('231'), 231);
    assert.equal(R.parseBodyweight('231.46 lb'), 231.5);
    assert.equal(R.parseBodyweight('105 kg'), 231.5);
    assert.equal(R.parseBodyweight('105', 'kg'), 231.5);
    assert.equal(R.parseBodyweight('heavy'), null);
    assert.equal(R.parseBodyweight('0'), null);
    assert.equal(R.parseLot('#7'), 7);
    assert.equal(R.parseLot('seven'), null);
    assert.equal(R.headerUnit('Weight (kg)'), 'kg');
    assert.equal(R.headerUnit('BW'), 'lb');
  });
});

describe('buildRosterPlan', () => {
  test('maps existing divisions by name, queues new ones, reads bodyweight and lot', () => {
    const p = plan('Name,Division,BW,Lot\nKurt Pollack,novice men,231,2\nAmy Stone,Open Women,150 kg,\nNew Guy,Masters Men,200,1\n');
    assert.deepEqual(p.problems, []);
    assert.equal(p.adding, 3);
    assert.deepEqual(p.newDivisions, ['Masters Men']);
    assert.equal(p.rows[0].divisionId, 'd-nm');
    assert.equal(p.rows[0].divisionName, 'Novice Men');
    assert.equal(p.rows[0].bodyweight, 231);
    assert.equal(p.rows[0].lotNumber, 2);
    assert.equal(p.rows[1].bodyweight, 330.7);
    assert.equal(p.rows[1].lotNumber, undefined);
    assert.equal(p.rows[2].divisionId, null);
    assert.match(R.describePlan(p), /Add 3 athletes to 3 divisions\. 1 new: Masters Men\./);
  });
  test('skips blank names and duplicates (on roster and within the paste); taken lots fall back', () => {
    const p = plan('Name,Lot\nDan Vance,1\n,3\nKurt Pollack,1\nKurt Pollack,2\n');
    assert.equal(p.adding, 1);
    assert.equal(p.skipped, 3);
    assert.equal(p.rows[0].skip, 'duplicate');
    assert.equal(p.rows[1].skip, 'no_name');
    assert.equal(p.rows[2].lotNumber, undefined);
    assert.match(p.rows[2].notes[0], /Lot 1 is taken/);
    assert.equal(p.rows[3].skip, 'duplicate');
  });
  test('first + last name columns combine; no header means first column is the name', () => {
    const p = plan('First,Last\nKurt,Pollack\n');
    assert.equal(p.rows[0].name, 'Kurt Pollack');
    const q = plan('Marcus Trent\nJo Bell\n');
    assert.equal(q.adding, 2);
    assert.equal(q.rows[1].divisionName, 'Novice Men');
  });
  test('refuses without a name column or a default division; row limit truncates', () => {
    const p = plan('Division\nOpen\n');
    assert.match(p.problems[0], /athlete name/);
    assert.equal(p.adding, 0);
    const q = plan('Name\nKurt Pollack\n', base(), { defaultDivisionId: 'nope' });
    assert.match(q.problems[0], /Pick a division/);
    const big = 'Name\n' + Array.from({ length: 520 }, (_, i) => `A ${i}`).join('\n');
    const r = plan(big);
    assert.equal(r.adding, 500);
    assert.equal(r.truncated, 20);
  });
});

describe('applyRosterImport', () => {
  test('creates new divisions once and adds athletes with lots and bodyweights', () => {
    const s = base();
    const p = plan('Name,Division,BW,Lot\nKurt Pollack,Novice Men,231,2\nAmy Stone,Masters Women,150,\nBo Hart,masters women,180,5\nDan Vance,Novice Men,,\n', s);
    const next = MB.applyRosterImport(s, p);
    assert.equal(next.divisions.length, 3);
    const mw = next.divisions.find((d) => d.name === 'Masters Women');
    assert.ok(mw);
    assert.equal(next.athletes.length, 4);
    const kurt = next.athletes.find((a) => a.name === 'Kurt Pollack');
    assert.equal(kurt.divisionId, 'd-nm');
    assert.equal(kurt.lotNumber, 2);
    assert.equal(kurt.bodyweight, 231);
    const amy = next.athletes.find((a) => a.name === 'Amy Stone');
    assert.equal(amy.divisionId, mw.id);
    assert.equal(amy.lotNumber, 1);
    assert.equal(next.athletes.find((a) => a.name === 'Bo Hart').lotNumber, 5);
    assert.equal(next.athletes.filter((a) => a.name === 'Dan Vance').length, 1);
    assert.equal(s.athletes.length, 1, 'input state untouched');
  });
  test('a plan with problems is a no-op', () => {
    const s = base();
    const p = plan('Division\nOpen\n', s);
    assert.equal(MB.applyRosterImport(s, p), s);
  });
});
