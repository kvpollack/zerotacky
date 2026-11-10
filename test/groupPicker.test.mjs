import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
const ROOT = process.env.ZT_ROOT || '..';
const G = await import(`${ROOT}/lib/website/groupPicker.ts`);
const FX = await import(`${ROOT}/lib/website/fixtures.ts`);

const riverside = FX.DEMO_SHOW_RECORDS.find((r) => r.id === 'demo-show-strongfest-2026');
const ev = (name, extra = {}) => ({ id: 'e', meetId: 'm', eventNumber: 1, name, scoringType: 'reps', timeCapSeconds: 60, lanes: 1, loadingPoints: 1, weightEntryMode: 'total', implementEmptyWeight: 0, divisionWeights: {}, ...extra });

describe('group picker (gaps #13)', () => {
  test('eventLane: name first, then implement, bars by scoring type', () => {
    assert.equal(G.eventLane(ev('Axle Deadlift for Reps')), 'deadlift');
    assert.equal(G.eventLane(ev('Axle Clean & Press')), 'overhead');
    assert.equal(G.eventLane(ev('Log Press Medley')), 'overhead');
    assert.equal(G.eventLane(ev('Keg Over Bar (For Reps)')), 'carry');
    assert.equal(G.eventLane(ev('50ft Harness Truck Pull')), 'pull');
    assert.equal(G.eventLane(ev('Best Friend Sled Drag')), 'pull');
    assert.equal(G.eventLane(ev('Event 3', { spec: { implement: 'yoke' } })), 'carry');
    assert.equal(G.eventLane(ev('Event 3', { spec: { implement: 'car_deadlift' } })), 'deadlift');
    assert.equal(G.eventLane(ev('Event 4', { spec: { implement: 'axle' }, scoringType: 'max_weight' })), 'overhead');
    assert.equal(G.eventLane(ev('Event 4', { spec: { implement: 'axle' } })), 'deadlift');
    assert.equal(G.eventLane(ev('Mystery Event')), 'unknown');
  });

  test('Riverside demo: deadlift 315 / press 135 / carry 200 lands in Group 4, Group 5 reads heavy, truck pull is not compared', () => {
    const r = G.pickGroups(riverside.state.divisions, riverside.state.events, { deadlift: 315, overhead: 135, carry: 200 });
    assert.equal(r.recommendedId, 'sf-g4');
    assert.match(r.note, /Group 4 \(Inclusive\) is the heaviest group/);
    const byId = Object.fromEntries(r.divisions.map((d) => [d.divisionId, d]));
    assert.equal(byId['sf-g4'].fit, 'fits');
    assert.equal(byId['sf-g3'].fit, 'fits');
    assert.equal(byId['sf-g5'].fit, 'heavy');
    assert.equal(byId['sf-g5'].overCount, 2);   // keg 250/200 and basket 300/315
    const keg4 = byId['sf-g4'].events.find((e) => /Keg/.test(e.name));
    assert.equal(keg4.lane, 'carry');
    assert.equal(keg4.verdict, 'reach');       // 200 / 200
    const pull = byId['sf-g4'].events.find((e) => /Truck/.test(e.name));
    assert.equal(pull.verdict, 'unrated');
    assert.equal(pull.lane, 'pull');
    assert.equal(r.divisions[0].divisionId, 'sf-g4');   // ranked first
    assert.ok(r.divisions.findIndex((d) => d.divisionId === 'sf-g5') > r.divisions.findIndex((d) => d.divisionId === 'sf-g1'));
    assert.match(byId['sf-g5'].line, /above your comparison band/);   // GP-10 wording
  });

  test('a stretch: one event just over the band is still offered, lightest stretch first', () => {
    const divs = [{ id: 'a', meetId: 'm', name: 'Light', flight: 'A', sortOrder: 1 }, { id: 'b', meetId: 'm', name: 'Heavy', flight: 'A', sortOrder: 2 }];
    const events = [ev('Axle Deadlift', { id: 'e1', divisionWeights: { a: 300, b: 400 } }), ev('Log Press', { id: 'e2', eventNumber: 2, divisionWeights: { a: 150, b: 200 } })];
    const r = G.pickGroups(divs, events, { deadlift: 300, overhead: 180, carry: null });
    // a: deadlift 1.0 (heavy, but <= 1.1), press 0.83 reach -> stretch. b: both heavy.
    assert.equal(r.divisions[0].divisionId, 'a');
    assert.equal(r.divisions[0].fit, 'stretch');
    assert.equal(r.divisions[1].fit, 'heavy');
    assert.equal(r.recommendedId, 'a');
    assert.match(r.note, /No group clears every compared weight; Light is the closest/);
  });

  test('no numbers, or no published weights: no recommendation, a plain note', () => {
    const none = G.pickGroups(riverside.state.divisions, riverside.state.events, { deadlift: null, overhead: null, carry: null });
    assert.equal(none.recommendedId, null);
    assert.match(none.note, /Enter a number/);
    const divs = [{ id: 'a', meetId: 'm', name: 'Novice', flight: 'A', sortOrder: 1 }];
    const bare = G.pickGroups(divs, [ev('Axle Deadlift'), ev('Mystery Event', { id: 'x', eventNumber: 2 })], { deadlift: 400, overhead: 200, carry: 300 });
    assert.equal(bare.recommendedId, null);
    assert.match(bare.note, /not published target weights/);
    assert.equal(bare.divisions[0].fit, 'unrated');
    assert.match(bare.divisions[0].line, /Ask the promoter/);
  });

  test('per-hand carry weights are doubled; added-plates weights include the empty implement', () => {
    const d = { id: 'a', meetId: 'm', name: 'Open', flight: 'A', sortOrder: 1 };
    assert.equal(G.divisionWeightLb(ev("Farmer's Carry", { weightEntryMode: 'per_hand', divisionWeights: { a: 150 } }), 'a', 'carry'), 300);
    assert.equal(G.divisionWeightLb(ev('Axle Deadlift', { weightIsAddedPlatesOnly: true, implementEmptyWeight: 55, divisionWeights: { a: 200 } }), 'a', 'deadlift'), 255);
    assert.equal(G.divisionWeightLb(ev('Axle Deadlift', { divisionWeights: { a: 0 } }), 'a', 'deadlift'), null);
  });

  test('parseLiftInput and numbersFromPRs', () => {
    assert.equal(G.parseLiftInput('315', 'lb'), 315);
    assert.equal(G.parseLiftInput('140 kg', 'lb'), 309);
    assert.equal(G.parseLiftInput('140', 'kg'), 309);
    assert.equal(G.parseLiftInput('315 lb', 'kg'), 315);
    assert.equal(G.parseLiftInput('140kg x 3', 'lb'), 309);
    assert.equal(G.parseLiftInput('', 'lb'), null);
    assert.equal(G.parseLiftInput('heavy', 'lb'), null);
    const n = G.numbersFromPRs([{ lift: 'Log press', value: '225 lb' }, { lift: 'Deadlift', value: '405' }, { lift: 'Yoke walk', value: '500 lb' }, { lift: 'Bench press', value: '275' }]);
    assert.deepEqual(n, { deadlift: 405, overhead: 225, carry: 500 });
  });
});

describe('divisionGenderTag', () => {
  test('reads gendered names, leaves strength groups and open-gender classes alone', () => {
    const G2 = G;
    assert.equal(G2.divisionGenderTag('Open Women'), 'women');
    assert.equal(G2.divisionGenderTag('Novice Men'), 'men');
    assert.equal(G2.divisionGenderTag("Men's Heavyweight"), 'men');
    assert.equal(G2.divisionGenderTag('Open W MW (165-)'), 'women');
    assert.equal(G2.divisionGenderTag('Open M SHW (+)'), 'men');
    assert.equal(G2.divisionGenderTag('Ladies Novice'), 'women');
    assert.equal(G2.divisionGenderTag('Group 3 (Inclusive)'), null);
    assert.equal(G2.divisionGenderTag('Open Gender - Novice'), null);
    assert.equal(G2.divisionGenderTag('Teen - All Gender'), null);
  });

  // 054 (Kurt 11/10): the helper is for non-traditional classes only
  test('showsGroupPicker: the promoter\'s division format decides; unset falls back to the name-based style', () => {
    const base = { competitionStatus: 'upcoming', divisionGroupingStyle: 'inclusive_strength_groups' };
    assert.equal(G.showsGroupPicker({ ...base, divisionFormat: 'weight_classes' }, 3), false);
    assert.equal(G.showsGroupPicker({ ...base, divisionFormat: 'custom' }, 3), true);
    assert.equal(G.showsGroupPicker({ ...base, divisionFormat: 'custom', divisionGroupingStyle: 'traditional_weight_classes' }, 3), true, 'custom wins over names that look like classes');
    assert.equal(G.showsGroupPicker(base, 3), true, 'unset + inclusive names');
    assert.equal(G.showsGroupPicker({ ...base, divisionGroupingStyle: 'mixed' }, 3), true, 'unset + mixed names');
    assert.equal(G.showsGroupPicker({ ...base, divisionGroupingStyle: 'traditional_weight_classes' }, 3), false, 'unset + class-like names');
    assert.equal(G.showsGroupPicker({ ...base, divisionFormat: 'custom', competitionStatus: 'completed' }, 3), false, 'completed shows have standings instead');
    assert.equal(G.showsGroupPicker({ ...base, divisionFormat: 'custom' }, 0), false, 'nothing to compare without events');
    assert.equal(G.showsGroupPicker(riverside, riverside.state.events.length), true, 'the Riverside demo keeps it');
  });

  test('054 mapping: division_format and weight_cap_kg round-trip; absent stays absent', async () => {
    const M = await import(`${ROOT}/lib/sync/mapping.ts`);
    const S = await import(`${ROOT}/lib/website/supabaseShows.ts`);
    const meetRow = { id: 'm1', slug: 's', name: 'N', date: null, admin_pin: null, run_order_method: 'reverse_overall', tiebreaker_rule: 'event_wins', available_plates: [45], collar_weight_per_pair: 0, stations: [], is_demo: false };
    assert.equal(M.rowToMeet(meetRow).divisionFormat, undefined);
    assert.equal(M.rowToMeet({ ...meetRow, division_format: null }).divisionFormat, undefined);
    assert.equal(M.rowToMeet({ ...meetRow, division_format: 'weight_classes' }).divisionFormat, 'weight_classes');
    assert.equal(M.rowToMeet({ ...meetRow, division_format: 'bogus' }).divisionFormat, undefined, 'unknown values are dropped, not trusted');
    const meet = M.rowToMeet({ ...meetRow, division_format: 'custom' });
    assert.equal(M.meetToRow(meet, { slug: 's' }).division_format, 'custom');
    assert.equal('division_format' in M.meetToRow(M.rowToMeet(meetRow), { slug: 's' }), false, 'a meet that never chose sends no key, so the server keeps its value');

    const divRow = { id: 'd1', meet_id: 'm1', name: 'Men Open 105kg', flight: 'A', sort_order: 1 };
    assert.equal('weightCapKg' in M.rowToDivision(divRow), false);
    assert.equal('weightCapKg' in M.rowToDivision({ ...divRow, weight_cap_kg: null }), false);
    assert.equal(M.rowToDivision({ ...divRow, weight_cap_kg: '105.00' }).weightCapKg, 105, 'numeric comes back as a string from PostgREST');
    assert.equal('weight_cap_kg' in M.divisionToRow(M.rowToDivision(divRow)), false, 'no cap on the phone = key absent = the desk\'s cap survives a publish');
    assert.equal(M.divisionToRow({ ...M.rowToDivision(divRow), weightCapKg: null }).weight_cap_kg, null, 'an explicit clear is sent as null');
    assert.equal(M.divisionToRow(M.rowToDivision({ ...divRow, weight_cap_kg: 90 })).weight_cap_kg, 90);

    const labels = ['Open Men LW (u231)', 'Open Men HW (231+)'];
    assert.equal(S.resolveDivisionGroupingStyle(undefined, labels), 'traditional_weight_classes');
    assert.equal(S.resolveDivisionGroupingStyle('custom', labels), 'mixed', 'a custom meet never reads as traditional');
    assert.equal(S.resolveDivisionGroupingStyle('weight_classes', ['Group 1', 'Group 2']), 'traditional_weight_classes', 'weight classes win over group-like names');
    assert.equal(S.resolveDivisionGroupingStyle(null, ['Group 1', 'Group 2']), 'inclusive_strength_groups');
  });

  test('054 normalizeState keeps divisionFormat and weightCapKg (the dashboard save goes through it)', async () => {
    const B = await import(`${ROOT}/lib/meetBuilder.ts`);
    const raw = { meet: { id: 'm', name: 'N', divisionFormat: 'weight_classes' }, divisions: [{ id: 'd1', name: 'LW', weightCapKg: 105 }, { id: 'd2', name: 'HW', weightCapKg: null }, { id: 'd3', name: 'X', weightCapKg: 'junk' }], events: [], athletes: [], results: [] };
    const st = B.normalizeState(raw);
    assert.equal(st.meet.divisionFormat, 'weight_classes');
    assert.equal(st.divisions[0].weightCapKg, 105);
    assert.equal(st.divisions[1].weightCapKg, null);
    assert.equal('weightCapKg' in st.divisions[2], false);
    assert.equal('divisionFormat' in B.normalizeState({ ...raw, meet: { id: 'm', name: 'N', divisionFormat: 'nope' } }).meet, false);
  });
});

describe('group picker: Astra GP fixes (11/10)', () => {
  test('GP-07 / GP-09: holds, throws, tosses, pushes and bench presses are not compared; a push press is overhead', () => {
    for (const n of ['Atlas Stone Hold', 'Max Time Farmer Hold', 'Car Deadlift Hold', 'Sandbag Throw', 'Sandbag Toss', 'Braemar Stone Throw', 'Bench Press', '2 Hand Sandbag Push', 'Floor Press', 'Incline Press']) {
      assert.equal(G.eventLane(ev(n)), 'unknown', n);
    }
    assert.equal(G.eventLane(ev('Axle Push Press')), 'overhead');
    assert.equal(G.eventLane(ev('Yoke Carry')), 'carry');
    assert.equal(G.eventLane(ev('Car Deadlift')), 'deadlift');
    const nums = G.numbersFromPRs([{ lift: 'Bench Press', value: '275 lb' }, { lift: 'Overhead', value: '135 lb' }]);
    assert.equal(nums.overhead, 135);
  });
  test('GP-11: added plates and per-hand together double the loaded handle', () => {
    const e = ev('Farmers Carry', { weightEntryMode: 'per_hand', weightIsAddedPlatesOnly: true, implementEmptyWeight: 25, divisionWeights: { d: 100 } });
    assert.equal(G.divisionWeightLb(e, 'd', 'carry'), 250);
    assert.equal(G.divisionWeightLb(ev('Farmers Carry', { weightEntryMode: 'per_hand', divisionWeights: { d: 100 } }), 'd', 'carry'), 200);
    assert.equal(G.divisionWeightLb(ev('Axle Deadlift', { weightIsAddedPlatesOnly: true, implementEmptyWeight: 25, divisionWeights: { d: 100 } }), 'd', 'deadlift'), 125);
  });
  test('GP-08: the unit switch converts what is on screen; explicit units and blanks are left alone', () => {
    assert.equal(G.convertDisplayUnit('315', 'lb', 'kg'), '143');
    assert.equal(G.convertDisplayUnit('143', 'kg', 'lb'), '315');
    assert.equal(G.convertDisplayUnit('140 kg', 'lb', 'kg'), '140 kg');
    assert.equal(G.convertDisplayUnit('', 'lb', 'kg'), '');
    assert.equal(G.convertDisplayUnit('315', 'lb', 'lb'), '315');
    // the same strength parses to the same pounds either way
    assert.equal(G.parseLiftInput(G.convertDisplayUnit('315', 'lb', 'kg'), 'kg'), 315);
    assert.equal(G.lbToDisplay(309, 'kg'), '140');
    assert.equal(G.lbToDisplay(null, 'kg'), '');
  });
  test('GP-10: a weight above the band but under the number is described as above the band, not over the number', () => {
    const d = { id: 'd', meetId: 'm', name: 'Group A', flight: 'A', sortOrder: 0 };
    const fit = G.fitDivision(d, [ev('Axle Deadlift', { scoringType: 'reps', divisionWeights: { d: 95 } })], { deadlift: 100, overhead: null, carry: null });
    assert.equal(fit.fit, 'stretch');
    assert.ok(!/over your number/.test(fit.line), fit.line);
    assert.ok(/above your comparison band/.test(fit.line), fit.line);
    assert.equal(G.VERDICT_LABELS.heavy, 'Above band');
    const res = G.pickGroups([d, { ...d, id: 'u', name: 'No Weights', sortOrder: 1 }], [ev('Axle Deadlift', { scoringType: 'reps', divisionWeights: { d: 150 } })], { deadlift: 100, overhead: null, carry: null });
    assert.equal(res.recommendedId, 'd');
    assert.ok(/closest of the 1 rated/.test(res.note), res.note);
    assert.ok(/1 group has no weights to compare/.test(res.note), res.note);
    assert.equal(res.divisions.at(-1).fit, 'unrated');
  });
  test('GP-13: a timed carry is compared by its published implement weight (the explanation says so)', () => {
    const d = { id: 'd', meetId: 'm', name: 'G', flight: 'A', sortOrder: 0 };
    const v = G.gradeEvent(ev('Yoke Carry', { scoringType: 'time_or_distance', divisionWeights: { d: 400 } }), d, { deadlift: null, overhead: null, carry: 500 });
    assert.equal(v.lane, 'carry');
    assert.equal(v.verdict, 'clear');
  });
  test('GP-02: the registration projection carries the show gate', async () => {
    const R = await import(`${ROOT}/lib/promoter/rules.ts`);
    const MB = await import(`${ROOT}/lib/meetBuilder.ts`);
    const blank = MB.createBlankMeet('Gate');
    const mk = (format, names, status, events) => R.toPublicRegistrationMeet({
      summary: { serverId: 'm', slug: 'gate', listing: { registrationStatus: 'open', competitionStatus: status, athleteCap: null } },
      state: { ...blank, meet: { ...blank.meet, ...(format ? { divisionFormat: format } : {}) }, divisions: names.map((n, i) => ({ id: `d${i}`, meetId: 'm', name: n, flight: 'A', sortOrder: i })), events },
    }, 'P').groupPickerShown;
    const e = [ev('Axle Deadlift', { divisionWeights: {} })];
    assert.equal(mk(null, ['Novice Men', 'Open Men'], 'upcoming', e), false, 'class-like names, unset format');
    assert.equal(mk(null, ['Group 1', 'Group 2'], 'upcoming', e), true);
    assert.equal(mk('custom', ['Novice Men', 'Open Men'], 'upcoming', e), true);
    assert.equal(mk('weight_classes', ['Group 1', 'Group 2'], 'upcoming', e), false);
    assert.equal(mk('custom', ['Group 1', 'Group 2'], 'completed', e), false);
    assert.equal(mk('custom', ['Group 1', 'Group 2'], 'upcoming', []), false, 'no events');
    assert.equal(mk('custom', ['Group 1'], 'upcoming', e), false, 'one division');
  });
  test('GP-04: out-of-range caps are named before the database sees them', async () => {
    const MB = await import(`${ROOT}/lib/meetBuilder.ts`);
    const probs = MB.divisionCapProblems([{ name: 'Men 19', weightCapKg: 19.5 }, { name: 'Men 105', weightCapKg: 105 }, { name: 'Open', weightCapKg: null }, { name: 'Men 301', weightCapKg: 300.5 }]);
    assert.equal(probs.length, 2);
    assert.match(probs[0], /Men 19.*20 and 300 kg/);
    const st = MB.normalizeState({ meet: { id: 'm', name: 'N' }, divisions: [{ id: 'd', meetId: 'm', name: 'Men 19', flight: 'A', sortOrder: 0, weightCapKg: 19.5 }], events: [], athletes: [], results: [] });
    assert.ok(MB.validateMeet(st).problems.some((p) => /Men 19/.test(p)));
  });
});
