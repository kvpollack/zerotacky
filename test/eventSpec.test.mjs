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

describe('Astra 11/5 fixes (BR-05 safe video URL, BR-08 course step and small weights)', () => {
  test('safeVideoUrl keeps http(s) only', () => {
    assert.equal(S.safeVideoUrl('https://youtu.be/x'), 'https://youtu.be/x');
    assert.equal(S.safeVideoUrl(' http://example.com/v '), 'http://example.com/v');
    assert.equal(S.safeVideoUrl('javascript:void(0)'), null);
    assert.equal(S.safeVideoUrl('data:text/plain,x'), null);
    assert.equal(S.safeVideoUrl('youtube.com/watch?v=x'), null);
    assert.equal(S.safeVideoUrl(''), null);
    assert.equal(S.safeVideoUrl(undefined), null);
    assert.equal(S.safeVideoUrl(`https://example.com/${'a'.repeat(500)}`), null);
  });
  test('course distance: 1 ft minimum, half-foot steps, normalize keeps what validate accepts', () => {
    assert.match(S.validateEventSpec({ courseFeet: '0.01' }), /between 1 and/);
    assert.match(S.validateEventSpec({ courseFeet: '0.9' }), /between 1 and/);
    assert.match(S.validateEventSpec({ courseFeet: '1.25' }), /half-foot/);
    assert.equal(S.validateEventSpec({ courseFeet: '1' }), null);
    assert.equal(S.validateEventSpec({ courseFeet: '50.5' }), null);
    assert.equal(S.normalizeEventSpec({ courseFeet: '50.5' }).courseFeet, 50.5);
    assert.equal(S.normalizeEventSpec({ courseFeet: '1' }).courseFeet, 1);
    assert.equal(S.normalizeEventSpec({ courseFeet: '0.01' }), undefined);
  });
  test('kgLabel: 1 lb reads "<1 kg", never "0 kg"', () => {
    assert.equal(S.kgLabel(1), '<1 kg');
    assert.equal(S.kgLabel(2), '1 kg');
    assert.equal(S.kgLabel(225), '102 kg');
    assert.equal(S.kgLabel(226), '103 kg');
    assert.equal(S.kgLabel(0), '');
  });
});

describe('Astra recheck 11/5: malformed specs never crash a render', () => {
  test('null and non-string rule members are dropped by normalize and refused by validate', () => {
    assert.equal(S.normalizeEventSpec({ notAllowed: [null] }), undefined);
    assert.deepEqual(S.normalizeEventSpec({ allowed: ['belt', null, 7] }), { allowed: ['belt'] });
    assert.match(S.validateEventSpec({ notAllowed: [null] }), /list of rule names/);
    assert.match(S.validateEventSpec({ allowed: ['belt', null] }), /list of rule names/);
    assert.match(S.validateEventSpec({ allowed: 'belt' }), /list of rule names/);
  });
  test('object-valued text fields are refused by validate and ignored by normalize', () => {
    assert.match(S.validateEventSpec({ implementNote: { a: 1 } }), /must be text/);
    assert.match(S.validateEventSpec({ notes: ['x'] }), /must be text/);
    assert.equal(S.normalizeEventSpec({ notes: { a: 1 }, implementNote: 5 }), undefined);
  });
  test('specSegments, specNotes and specHasContent survive junk', () => {
    assert.deepEqual(S.specSegments({ notAllowed: [null] }), []);
    assert.deepEqual(S.specSegments({ implement: 'yoke', allowed: ['belt', null], notAllowed: [null, 'straps'] }), ['Yoke', 'Belt allowed', 'No straps']);
    assert.equal(S.specNotes({ notes: { a: 1 } }), '');
    assert.equal(S.specNotes({ notes: ' Turn at 25. ' }), 'Turn at 25.');
    assert.equal(S.specHasContent({ notAllowed: [null] }), false);
    assert.equal(S.specHasContent({ videoUrl: 'javascript:void(0)' }), false);
  });
});
