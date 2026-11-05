import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../lib/website/trainFor.ts';

const EVENTS = [
  { name: 'Log Clean & Press', spec: { implement: 'log' } },
  { name: 'Yoke Carry 50 ft', spec: { implement: 'yoke', courseFeet: 50 } },
  { name: 'Axle Deadlift', spec: { implement: 'axle' } },
  { name: 'Deadlift', spec: { implement: 'barbell' } },           // no gym mapping
  { name: 'Sandbag Carry Medley', spec: { implement: 'sandbag' } },
  { name: 'Atlas Stones' },                                         // no spec
  { name: 'Yoke Return', spec: { implement: 'yoke' } },            // repeat implement
];
const gym = (name, tags) => ({ name, implementTags: tags });

describe('train for this show', () => {
  test('needs are distinct equipment ids in event order, barbell and spec-less events skipped, repeats merged', () => {
    const needs = T.showTrainingNeeds(EVENTS);
    assert.deepEqual(needs.map((n) => n.equipment), ['log', 'yoke', 'axle', 'sandbags']);
    assert.equal(needs[1].label, 'Yoke');
    assert.deepEqual(needs[1].events, ['Yoke Carry 50 ft', 'Yoke Return']);
    assert.deepEqual(T.showTrainingNeeds([]), []);
  });

  test('coverage is case-insensitive and reports have / missing / share', () => {
    const needs = T.showTrainingNeeds(EVENTS);
    const c = T.gymCoverage(gym('A', ['LOG', 'yoke', 'stones']), needs);
    assert.deepEqual(c.have.map((n) => n.equipment), ['log', 'yoke']);
    assert.deepEqual(c.missing.map((n) => n.equipment), ['axle', 'sandbags']);
    assert.equal(c.share, 0.5);
    assert.equal(T.gymCoverage(gym('B', []), []).share, 1);
  });

  test('ranking keeps partial matches, best first, name as the default tie-break; fullOnly keeps complete kits', () => {
    const needs = T.showTrainingNeeds(EVENTS);
    const gyms = [
      gym('Zed Barbell', ['log', 'yoke', 'axle', 'sandbags']),
      gym('Alpha Strength', ['log', 'yoke', 'axle', 'sandbags', 'stones']),
      gym('Mid Gym', ['log', 'axle']),
      gym('Powerlifting Only', ['monolift']),
    ];
    const ranked = T.rankGymsForShow(gyms, needs);
    assert.deepEqual(ranked.map((r) => r.gym.name), ['Alpha Strength', 'Zed Barbell', 'Mid Gym']);
    assert.deepEqual(T.rankGymsForShow(gyms, needs, { fullOnly: true }).map((r) => r.gym.name), ['Alpha Strength', 'Zed Barbell']);
    const byLenDesc = (a, b) => b.name.length - a.name.length;
    assert.deepEqual(T.rankGymsForShow(gyms, needs, { tieBreak: byLenDesc }).map((r) => r.gym.name).slice(0, 2), ['Alpha Strength', 'Zed Barbell']);
    // no needs: everything passes through unranked
    assert.equal(T.rankGymsForShow(gyms, []).length, 4);
  });

  test('labels read as a sheet line', () => {
    const needs = T.showTrainingNeeds(EVENTS);
    assert.equal(T.coverageLabel(T.gymCoverage(gym('A', ['log', 'yoke', 'axle', 'sandbags']), needs), 4), 'Everything the show uses');
    assert.equal(T.coverageLabel(T.gymCoverage(gym('A', ['log', 'yoke']), needs), 4), '2 of 4 implements');
    assert.equal(T.coverageLabel(T.gymCoverage(gym('A', ['yoke']), needs), 4), 'Yoke only');
    const one = T.showTrainingNeeds([EVENTS[1]]);
    assert.equal(T.coverageLabel(T.gymCoverage(gym('A', ['yoke']), one), 1), 'Has the yoke');
    assert.equal(T.coverageLabel(T.gymCoverage(gym('A', []), []), 0), 'No implement list for this show yet');
  });

  test('show page link carries the slug and the venue state, or is null without mapped implements', () => {
    const needs = T.showTrainingNeeds(EVENTS);
    assert.equal(T.trainForShowHref({ slug: 'iron-harbor-classic-2026', venue: { state: 'PA' } }, needs), '/gyms?show=iron-harbor-classic-2026&state=PA');
    assert.equal(T.trainForShowHref({ slug: 'x', venue: {} }, needs), '/gyms?show=x');
    assert.equal(T.trainForShowHref({ slug: 'x', venue: { state: 'PA' } }, T.showTrainingNeeds([EVENTS[3]])), null);
  });
});

describe('trainForEligible (Astra BR-01: unlisted meets never drive /gyms)', () => {
  const needs = T.showTrainingNeeds(EVENTS);
  test('a listed show and a demo fixture (no flag) are eligible', () => {
    assert.equal(T.trainForEligible({ isPublicListed: true }), true);
    assert.equal(T.trainForEligible({}), true);
    assert.ok(T.trainForShowHref({ slug: 'a', venue: { state: 'PA' }, isPublicListed: true }, needs));
  });
  test('an unlisted show (results-retention path) is not, and gets no train-for link', () => {
    assert.equal(T.trainForEligible({ isPublicListed: false }), false);
    assert.equal(T.trainForShowHref({ slug: 'a', venue: { state: 'PA' }, isPublicListed: false }, needs), null);
  });
});
