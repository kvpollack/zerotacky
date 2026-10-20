import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.env.ZT_ROOT || '..';
const F = await import(`${ROOT}/lib/website/filters.ts`);
const A = await import(`${ROOT}/lib/website/standingsAdapter.ts`);
const X = await import(`${ROOT}/lib/website/fixtures.ts`);

describe('website filters: shows & gyms', () => {
  const summaries = X.DEMO_SHOW_RECORDS.map(X.toPublicShowSummary);
  const gyms = X.DEMO_GYM_LISTINGS;

  test('filters shows by competitionStatus, state, implementTag, and inclusive division query', () => {
    const upcoming = F.filterPublicShows(summaries, { competitionStatus: 'upcoming' });
    assert.equal(upcoming.length, 1);
    assert.equal(upcoming[0].slug, 'strongfest-2026');

    const byImplement = F.filterPublicShows(summaries, { implementTag: 'Circus Dumbbell' });
    assert.equal(byImplement.length, 1);
    assert.equal(byImplement[0].slug, 'iron-valley-summer-slam-2026');

    const byInclusiveGroup = F.filterPublicShows(summaries, { divisionQuery: 'Group 4' });
    assert.equal(byInclusiveGroup.length, 1);
    assert.equal(byInclusiveGroup[0].slug, 'strongfest-2026');

    const postponed = F.filterPublicShows(summaries, { competitionStatus: 'postponed' });
    assert.equal(postponed.length, 1);
    assert.equal(postponed[0].slug, 'garden-state-winter-wreckage-2026');
  });

  test('returns empty array when no show matches and recovers all on filter reset', () => {
    const none = F.filterPublicShows(summaries, { search: 'nonexistent-implement-xyz' });
    assert.equal(none.length, 0);

    const reset = F.filterPublicShows(summaries, {});
    assert.equal(reset.length, summaries.length);
  });

  test('filters gyms by implement tag and day-pass availability', () => {
    const basketGyms = F.filterPublicGyms(gyms, { implementTag: 'Kegs' });
    assert.equal(basketGyms.length, 1);
    assert.equal(basketGyms[0].slug, 'the-power-plant-gym-pa');

    const dayPassGyms = F.filterPublicGyms(gyms, { dayPassOnly: true });
    assert.equal(dayPassGyms.length, 2);
    assert.ok(dayPassGyms.every((g) => g.dayPassAvailability !== 'not_provided'));
  });
});

describe('website lifecycle & podium certification rules', () => {
  test('only completed + final results can render an official finalized podium', () => {
    const upcomingClosed = F.describeShowLifecycle('upcoming', 'closed', 'not_started');
    assert.equal(upcomingClosed.canRenderOfficialPodium, false);

    const liveProvisional = F.describeShowLifecycle('live', 'closed', 'in_progress');
    assert.equal(liveProvisional.canRenderOfficialPodium, false);

    const completedProvisional = F.describeShowLifecycle('completed', 'closed', 'provisional');
    assert.equal(completedProvisional.canRenderOfficialPodium, false);

    const postponedWaitlist = F.describeShowLifecycle('postponed', 'waitlist', 'not_started');
    assert.equal(postponedWaitlist.canRenderOfficialPodium, false);

    const completedFinal = F.describeShowLifecycle('completed', 'closed', 'final');
    assert.equal(completedFinal.canRenderOfficialPodium, true);
  });

  test('standingsAdapter preserves tied 1st-place overall podiums (#1, #1, #3) and <3 finisher divisions', () => {
    const finalShow = X.DEMO_SHOW_RECORDS.find(
      (s) => s.slug === 'iron-valley-summer-slam-2026'
    );
    assert.ok(finalShow);

    const views = A.buildAllDivisionResultsViews(finalShow);
    assert.equal(views.length, 2);

    // Division 1: Middleweight 100kg has an unbroken tie for 1st place -> places [1, 1, 3, 4]
    const mw = views[0];
    assert.equal(mw.isOfficialFinal, true);
    assert.equal(mw.hasUnresolvedOverallTie, true);
    assert.deepEqual(
      mw.standings.map((s) => [s.overallPlace, s.isTiedOverall, s.totalPoints]),
      [
        [1, true, 10.5],
        [1, true, 10.5],
        [3, false, 6],
        [4, false, 3],
      ]
    );

    // Division 2: Masters Heavyweight has only 2 finishers -> places [1, 2], no invented 3rd place
    const mhw = views[1];
    assert.equal(mhw.athletes.length, 2);
    assert.equal(mhw.standings.length, 2);
    assert.deepEqual(
      mhw.standings.map((s) => s.overallPlace),
      [1, 2]
    );
  });

  test('provisional completed show marks isOfficialFinal false even when results exist', () => {
    const provShow = X.DEMO_SHOW_RECORDS.find(
      (s) => s.slug === 'chesapeake-harbor-strongman-2026'
    );
    assert.ok(provShow);
    const views = A.buildAllDivisionResultsViews(provShow);
    assert.equal(views[0].isOfficialFinal, false);
  });
});
describe('gym directory equipment (Kurt 10/20)', () => {
  test('every demo gym tag is a known piece of equipment, and the dropdown follows list order', async () => {
    const GE = await import('../lib/website/gymEquipment.ts');
    const FX = await import('../lib/website/fixtures.ts');
    for (const g of FX.DEMO_GYM_LISTINGS) for (const t of g.implementTags) assert.ok(GE.isKnownEquipment(t), `${g.slug}: ${t}`);
    assert.ok(!GE.isKnownEquipment('Keg Over Bar'));
    const F = await import('../lib/website/filters.ts');
    const tags = GE.sortEquipmentTags(F.collectDistinctImplementTags(FX.DEMO_GYM_LISTINGS));
    assert.equal(tags[0], 'Log');
    assert.ok(tags.indexOf('Atlas stones') < tags.indexOf('Kegs'));
    assert.deepEqual(GE.sortEquipmentTags(['Zebra rack', 'Yoke', 'Log']), ['Log', 'Yoke', 'Zebra rack']);
  });
});
