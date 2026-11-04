import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.env.ZT_ROOT || '..';
const S = await import(`${ROOT}/lib/events/spec.ts`);
const F = await import(`${ROOT}/lib/website/format.ts`);
const M = await import(`${ROOT}/lib/sync/mapping.ts`);
const G = await import(`${ROOT}/lib/website/gymEquipment.ts`);

describe('event spec starter (11/4)', () => {
  test('normalize keeps only filled fields and returns undefined for an empty form', () => {
    assert.equal(S.normalizeEventSpec({ implement: '', implementNote: '', courseFeet: '', allowed: [], notAllowed: [], videoUrl: '', notes: '' }), undefined);
    assert.equal(S.normalizeEventSpec(null), undefined);
    const spec = S.normalizeEventSpec({ implement: 'yoke', implementNote: '  ', courseFeet: '50', allowed: ['belt', 'belt', 'bogus'], notAllowed: ['straps', 'belt'], videoUrl: ' https://youtu.be/x ', notes: ' Turn at 25. ' });
    assert.deepEqual(spec, { implement: 'yoke', courseFeet: 50, allowed: ['belt'], notAllowed: ['straps'], videoUrl: 'https://youtu.be/x', notes: 'Turn at 25.' });
  });

  test('validate refuses the cases the form must explain', () => {
    assert.equal(S.validateEventSpec({ implement: 'yoke' }), null);
    assert.match(S.validateEventSpec({ implement: 'other', implementNote: '' }), /Describe the implement/);
    assert.equal(S.validateEventSpec({ implement: 'other', implementNote: 'Duck walk frame' }), null);
    assert.match(S.validateEventSpec({ implement: 'laser' }), /Pick an implement/);
    assert.match(S.validateEventSpec({ courseFeet: '0' }), /Course distance/);
    assert.match(S.validateEventSpec({ courseFeet: '6000' }), /Course distance/);
    assert.equal(S.validateEventSpec({ courseFeet: '' }), null);
    assert.match(S.validateEventSpec({ allowed: ['tacky'], notAllowed: ['tacky'] }), /Tacky cannot be both/);
    assert.match(S.validateEventSpec({ videoUrl: 'youtube.com/x' }), /http/);
    assert.match(S.validateEventSpec({ videoUrl: 'javascript:alert(1)' }), /http/);
    assert.equal(S.validateEventSpec({ videoUrl: 'https://www.youtube.com/watch?v=abc' }), null);
    assert.match(S.validateEventSpec({ videoUrl: 'https://x.test/' + 'a'.repeat(500) }), /500/);
    assert.match(S.validateEventSpec({ notes: 'n'.repeat(281) }), /280/);
  });

  test('kilograms are whole and shown beside pounds, light tier included, never for callouts or heights', () => {
    assert.equal(S.lbToKg(230), 104);
    assert.equal(S.kgLabel(0), '');
    assert.equal(S.kgLabel(100), '45 kg');
    const base = { id: 'e1', meetId: 'm', eventNumber: 1, name: 'Log', scoringType: 'reps', timeCapSeconds: 60, lanes: 1, loadingPoints: 2, weightEntryMode: 'total', implementEmptyWeight: 0, divisionWeights: { d1: 230 } };
    assert.deepEqual(F.eventWeightDisplay(base, 'd1'), { main: '230 lbs', kg: '104 kg' });
    assert.deepEqual(F.eventWeightDisplay({ ...base, hasTrumpWeight: true, divisionLightWeights: { d1: 180 } }, 'd1'), { main: '230 lbs (light 180)', kg: '104 kg (light 82)' });
    assert.deepEqual(F.eventWeightDisplay({ ...base, pitCrewCallout: { title: 'x', byDivision: { d1: { headline: '5 stones' } } } }, 'd1'), { main: '5 stones' });
    assert.deepEqual(F.eventWeightDisplay({ ...base, divisionWeights: {} }, 'd1'), { main: '' });
  });

  test('segments read as one line; "other" uses the note; video is left to the caller', () => {
    assert.deepEqual(S.specSegments(undefined), []);
    assert.deepEqual(S.specSegments({ implement: 'log', implementNote: '12 in', courseFeet: 0 }), ['Log (12 in)']);
    assert.deepEqual(S.specSegments({ implement: 'other', implementNote: 'Duck walk frame', courseFeet: 60, allowed: ['belt', 'chalk'], notAllowed: ['straps'] }), ['Duck walk frame', '60 ft course', 'Belt, Chalk allowed', 'No straps']);
    assert.equal(S.specHasContent({ videoUrl: 'https://x' }), true);
    assert.equal(S.specHasContent({}), false);
  });

  test('every implement maps to known gym-directory equipment ids (for the later train-for-this-show filter)', () => {
    const known = new Set(G.GYM_EQUIPMENT.map((e) => e.id));
    for (const i of S.IMPLEMENTS) for (const g of i.gymEquipment) assert.ok(known.has(g), `${i.id} -> ${g}`);
    assert.equal(new Set(S.IMPLEMENTS.map((i) => i.id)).size, S.IMPLEMENTS.length);
  });

  test('spec rides in events.config and round-trips through the sync mappers', () => {
    const ev = { id: 'e1', meetId: 'm', eventNumber: 1, name: 'Yoke', scoringType: 'time_or_distance', timeCapSeconds: 60, lanes: 2, loadingPoints: 4, weightEntryMode: 'total', implementEmptyWeight: 200, divisionWeights: { d1: 600 }, spec: { implement: 'yoke', courseFeet: 50, notAllowed: ['straps'] } };
    const row = M.eventToRow(ev, 'm');
    assert.deepEqual(row.config.spec, ev.spec);
    assert.deepEqual(M.rowToEvent(row).spec, ev.spec);
    assert.equal(M.rowToEvent(M.eventToRow({ ...ev, spec: undefined }, 'm')).spec, undefined);
  });
});
