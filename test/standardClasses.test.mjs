import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
const ROOT = process.env.ZT_ROOT || '..';
const S = await import(`${ROOT}/lib/divisions/standardClasses.ts`);
const B = await import(`${ROOT}/lib/meetBuilder.ts`);
const G = await import(`${ROOT}/lib/website/groupPicker.ts`);

describe('standard weight class tables (054 quick-add)', () => {
  test('Strongman Corporation 2026 and IPF tables match the published lists', () => {
    const sc = S.standardClassDivisions('strongman_corp_2026', { women: true, men: true });
    assert.deepEqual(sc.map((d) => d.name), ['Women 57kg', 'Women 64kg', 'Women 73kg', 'Women 82kg', 'Women Heavyweight (82kg+)', 'Men 80kg', 'Men 90kg', 'Men 105kg', 'Men 120kg', 'Men Heavyweight (120kg+)']);
    assert.deepEqual(sc.map((d) => d.weightCapKg), [57, 64, 73, 82, null, 80, 90, 105, 120, null]);
    const ipf = S.standardClassDivisions('ipf', { women: true, men: true });
    assert.deepEqual(ipf.map((d) => d.weightCapKg), [47, 52, 57, 63, 69, 76, 84, null, 59, 66, 74, 83, 93, 105, 120, null]);
    assert.equal(ipf[7].name, 'Women Heavyweight (84kg+)');
    assert.equal(ipf[15].name, 'Men Heavyweight (120kg+)');
  });
  test('sex filter, unknown set, duplicate skip', () => {
    assert.equal(S.standardClassDivisions('ipf', { women: false, men: true }).length, 8);
    assert.deepEqual(S.standardClassDivisions('nope', { women: true, men: true }), []);
    const wanted = S.standardClassDivisions('strongman_corp_2026', { women: true, men: false });
    const missing = S.missingStandardClasses(wanted, ['women 64KG ', 'Open Men']);
    assert.equal(missing.length, 4);
    assert.ok(!missing.some((d) => d.name === 'Women 64kg'));
  });
  test('every generated name carries a gender tag the picker filter understands', () => {
    for (const id of ['strongman_corp_2026', 'ipf']) for (const d of S.standardClassDivisions(id, { women: true, men: true })) assert.ok(G.divisionGenderTag(d.name), d.name);
  });
  test('addDivision carries the cap; a typed division has none; caps survive the 20..300 check', () => {
    let st = B.normalizeState({ meet: { id: 'm', name: 'N', divisionFormat: 'weight_classes' }, divisions: [], events: [], athletes: [], results: [] });
    for (const c of S.standardClassDivisions('ipf', { women: true, men: false })) st = B.addDivision(st, { name: c.name, flight: 'A', weightCapKg: c.weightCapKg });
    st = B.addDivision(st, { name: 'Novice', flight: 'A' });
    assert.equal(st.divisions.length, 9);
    assert.equal(st.divisions[0].weightCapKg, 47);
    assert.equal('weightCapKg' in st.divisions[7], false, 'heavyweight (null) is stored as no cap');
    assert.equal('weightCapKg' in st.divisions[8], false);
    for (const d of st.divisions) if (d.weightCapKg !== undefined) assert.ok(d.weightCapKg >= 20 && d.weightCapKg <= 300);
  });
});

describe('standard classes: Astra GP-06 (renamed class is still the same class)', () => {
  test('a renamed capped class and a renamed heavyweight are not re-added; a capless Novice does not block the heavyweight', () => {
    const men = S.standardClassDivisions('ipf', { women: false, men: true });
    const missing = S.missingStandardClasses(men, [{ name: '105kg Men', weightCapKg: 105 }, { name: 'Men Open', weightCapKg: null }, { name: 'Novice Men', weightCapKg: null }]);
    assert.ok(!missing.some((d) => d.weightCapKg === 105), 'renamed 105 matched by gender + cap');
    assert.ok(!missing.some((d) => d.weightCapKg === null), 'renamed heavyweight matched by gender + open name');
    assert.equal(missing.length, 6);
    // a women's 105 does not satisfy the men's 105; a capless novice alone does not stand in for the heavyweight
    const m2 = S.missingStandardClasses(men, [{ name: 'Women 105kg', weightCapKg: 105 }, { name: 'Novice Men', weightCapKg: null }]);
    assert.equal(m2.length, 8);
    // plain strings still work (name match only, no caps known)
    assert.equal(S.missingStandardClasses(men, ['men 120kg']).length, 7);
  });
});
