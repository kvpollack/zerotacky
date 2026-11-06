import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.env.ZT_ROOT || '..';
const D = await import(`${ROOT}/lib/desk/rules.ts`);
const F = await import(`${ROOT}/lib/promoter/fixtureApi.ts`);
const M = await import(`${ROOT}/lib/promoter/supabaseApi.ts`);

describe('desk rules', () => {
  test('parseKg keeps the scale reading, two decimals, in range', () => {
    assert.equal(D.parseKg('92.4'), 92.4);
    assert.equal(D.parseKg('92,45'), 92.45);
    assert.equal(D.parseKg(' 100 kg'), 100);
    assert.equal(D.parseKg('92.456'), null);
    assert.equal(D.parseKg('19.9'), null);
    assert.equal(D.parseKg('301'), null);
    assert.equal(D.parseKg('abc'), null);
    assert.equal(D.parseKg(92.449), null);   // MD-16: three decimals are refused, not rounded
    assert.equal(D.parseKg(92.45), 92.45);
    assert.equal(D.parseKg(19.999), null);
  });
  test('lb and kg conversions', () => {
    assert.equal(D.lbToKg(200), 90.72);
    assert.equal(D.kgToLb(90), 198.4);
    assert.equal(D.formatKg(90), '90 kg');
    assert.equal(D.formatKg(92.4), '92.4 kg');
    assert.equal(D.formatKg(92.45), '92.45 kg');
    assert.equal(D.formatKg(null), '');
  });
  test('classCheck is inclusive at the cap and never rounds', () => {
    assert.deepEqual(D.classCheck(90, 90), { status: 'ok', marginKg: 0 });
    assert.deepEqual(D.classCheck(90.01, 90), { status: 'over', overByKg: 0.01 });
    assert.deepEqual(D.classCheck(88.5, 90), { status: 'ok', marginKg: 1.5 });
    assert.deepEqual(D.classCheck(null, 90), { status: 'none' });
    assert.deepEqual(D.classCheck(90, null), { status: 'none' });
  });
  test('federation preset picks SC, USS or generic', () => {
    assert.equal(D.deskPreset('Strongman Corporation').id, 'sc');
    assert.equal(D.deskPreset('SC').id, 'sc');
    assert.equal(D.deskPreset('USS').id, 'uss');
    assert.equal(D.deskPreset('Unsanctioned').id, 'generic');
    assert.equal(D.deskPreset(null).id, 'generic');
    assert.match(D.deskPreset('Strongman Corporation').lines.join(' '), /24 hours/);
  });
});

describe('desk mapping (supabase rows)', () => {
  test('rpc shape -> DeskState and patch -> json keys', () => {
    const s = M.deskStateFromRpc({
      caps: [{ division_id: 'd1', weight_cap_kg: '90.00' }, { division_id: 'd2', weight_cap_kg: null }],
      checkins: [{ athlete_id: 'a1', checked_in_at: '2026-11-21T12:00:00Z', weighed_kg: '92.45', weighed_at: null, paper_waiver_at: null, card_verified_at: null, note: null }],
    });
    assert.deepEqual(s.caps, { d1: 90 });
    assert.equal(s.checkins.a1.weighedKg, 92.45);
    assert.equal(s.checkins.a1.checkedInAt, '2026-11-21T12:00:00Z');
    assert.deepEqual(M.deskStateFromRpc(null), { caps: {}, checkins: {} });
    assert.deepEqual(M.deskPatchToJson({ checkedIn: true, weighedKg: null, divisionId: 'd2', note: 'x' }), { checked_in: true, weighed_kg: null, division_id: 'd2', note: 'x' });
    assert.deepEqual(M.deskPatchToJson({}), {});
  });
});

describe('desk fixture api', () => {
  test('check in, weigh, reclass, cap, and the result guard', async () => {
    const api = F.createFixturePromoterApi({});
    const meets = (await api.listMyMeets()).data;
    const upcoming = meets.find((m) => m.listing.competitionStatus === 'upcoming') ?? meets[0];
    const id = upcoming.serverId;
    const detail = (await api.getMeet(id)).data;
    const athlete = detail.state.athletes.find((a) => !detail.state.results.some((r) => r.athleteId === a.id));
    assert.ok(athlete, 'fixture has an unscored athlete');
    const other = detail.state.divisions.find((d) => d.id !== athlete.divisionId);

    assert.deepEqual((await api.getDesk(id)).data, { caps: {}, checkins: {} });
    let r = await api.updateDeskAthlete(id, athlete.id, { checkedIn: true, weighedKg: 92.45, note: 'paid cash' });
    assert.equal(r.error, null);
    assert.ok(r.data.checkedInAt);
    assert.equal(r.data.weighedKg, 92.45);
    assert.equal(r.data.note, 'paid cash');
    const after = (await api.getMeet(id)).data.state.athletes.find((a) => a.id === athlete.id);
    assert.equal(after.bodyweight, 203.8);   // kg mirrored to lb, one decimal

    assert.match((await api.updateDeskAthlete(id, athlete.id, { weighedKg: 400 })).error, /outside 20 to 300/);
    assert.match((await api.updateDeskAthlete(id, athlete.id, { note: 'x'.repeat(121) })).error, /too long/);
    assert.match((await api.updateDeskAthlete(id, 'nope', { checkedIn: true })).error, /not on the roster/);

    r = await api.updateDeskAthlete(id, athlete.id, { divisionId: other.id });
    assert.equal(r.error, null);
    const moved = (await api.getMeet(id)).data.state.athletes.find((a) => a.id === athlete.id);
    assert.equal(moved.divisionId, other.id);
    assert.match((await api.updateDeskAthlete(id, athlete.id, { divisionId: 'ghost' })).error, /not on this meet/);
    // MD-18: a rejected patch changes nothing, even the parts that were valid on their own
    const before = (await api.getMeet(id)).data.state.athletes.find((a) => a.id === athlete.id).bodyweight;
    assert.match((await api.updateDeskAthlete(id, athlete.id, { weighedKg: 95.5, divisionId: 'ghost' })).error, /not on this meet/);
    assert.equal((await api.getMeet(id)).data.state.athletes.find((a) => a.id === athlete.id).bodyweight, before);
    assert.equal((await api.getDesk(id)).data.checkins[athlete.id].weighedKg, 92.45);
    // MD-16: three decimals are refused on the raw value
    assert.match((await api.updateDeskAthlete(id, athlete.id, { weighedKg: 92.455 })).error, /two decimals/);
    assert.match((await api.setDivisionCap(id, other.id, 90.001)).error, /two decimals/);

    const scored = detail.state.athletes.find((a) => detail.state.results.some((x) => x.athleteId === a.id));
    if (scored) {
      const target = detail.state.divisions.find((d) => d.id !== scored.divisionId);
      assert.match((await api.updateDeskAthlete(id, scored.id, { divisionId: target.id })).error, /already has a result/);
    }

    assert.deepEqual((await api.setDivisionCap(id, other.id, 90)).data, { divisionId: other.id, capKg: 90 });
    assert.deepEqual((await api.getDesk(id)).data.caps, { [other.id]: 90 });
    assert.match((await api.setDivisionCap(id, other.id, 10)).error, /between 20 and 300/);
    assert.deepEqual((await api.setDivisionCap(id, other.id, null)).data, { divisionId: other.id, capKg: null });
    assert.deepEqual((await api.getDesk(id)).data.caps, {});

    r = await api.updateDeskAthlete(id, athlete.id, { checkedIn: false, weighedKg: null });
    assert.equal(r.data.checkedInAt, null);
    assert.equal(r.data.weighedKg, null);
    // MD-08: clearing the weigh-in clears the roster mirror too
    assert.equal((await api.getMeet(id)).data.state.athletes.find((a) => a.id === athlete.id).bodyweight, undefined);
  });
  test('signed out is refused', async () => {
    const api = F.createFixturePromoterApi({ signedOut: true });
    assert.match((await api.getDesk('x')).error, /Sign in/);
  });
});
