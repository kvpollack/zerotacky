import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.env.ZT_ROOT || '..';
const P = await import(`${ROOT}/lib/presets/index.ts`);
const FX = await import(`${ROOT}/lib/website/fixtures.ts`);
const MB = await import(`${ROOT}/lib/meetBuilder.ts`);

// Kurt 10/19: the website demo chooser offers only fictional shows, and a fresh device never opens on the real roster.
describe('meet presets', () => {
  test('default preset is a fictional demo show, not the real Strongfest roster', () => {
    assert.notEqual(P.DEFAULT_PRESET_ID, 'strongfest-2026');
    const s = MB.normalizeState(P.getInitialSeedState());
    assert.equal(s.meet.isDemo, true);
    assert.equal(s.meet.presetId, P.DEFAULT_PRESET_ID);
    assert.ok(!/Jessica Rucci|Emily Shaff/.test(JSON.stringify(s.athletes)));
    assert.ok(s.divisions.length > 0 && s.events.length > 0 && s.athletes.length > 0);
  });
  test('four website demo shows double as presets, each backed by a fixture and a blurb; postponed show skipped', () => {
    assert.equal(P.DEMO_SHOW_PRESETS.length, 4);
    for (const p of P.DEMO_SHOW_PRESETS) {
      const r = FX.DEMO_SHOW_RECORDS.find((x) => x.id === p.id);
      assert.ok(r, `fixture for ${p.id}`);
      assert.equal(p.showSlug, r.slug);
      assert.equal(p.label, r.name);
      assert.ok(P.DEMO_SHOW_PRESET_BLURBS[p.id]?.length > 20);
      assert.ok(P.isMeetPresetId(p.id));
      const s = MB.normalizeState(P.getInitialSeedState(p.id));
      assert.equal(s.meet.isDemo, true);
      assert.equal(s.meet.presetId, p.id);
      assert.equal(s.meet.name, r.name);
    }
    assert.ok(!P.DEMO_SHOW_PRESETS.some((p) => p.showSlug === 'garden-state-winter-wreckage-2026'));
    assert.ok(!P.DEMO_SHOW_PRESETS.some((p) => p.id === 'strongfest-2026'));
  });
  test('builder presets still load and unknown ids fall back to the default demo', () => {
    assert.equal(P.getInitialSeedState('strongfest-2026').meet.presetId, 'strongfest-2026');
    assert.equal(P.getInitialSeedState('york-iron-2026').meet.presetId, 'york-iron-2026');
    assert.equal(P.getInitialSeedState('nope').meet.presetId, P.DEFAULT_PRESET_ID);
    assert.equal(P.isMeetPresetId('nope'), false);
    assert.equal(P.MEET_PRESETS.length, 6);
  });
  test('demo seed state is a fresh copy each time', () => {
    const a = P.getInitialSeedState();
    a.meet.name = 'changed';
    assert.notEqual(P.getInitialSeedState().meet.name, 'changed');
  });
});
