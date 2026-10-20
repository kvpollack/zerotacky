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
    assert.equal(basketGyms[0].slug, 'keystone-forge-strength-pa');

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

describe('gym directory zip + radius (Kurt 10/20)', () => {
  test('haversine, zip normalising, and miles formatting', async () => {
    const G = await import('../lib/geo/geo.ts');
    const media = { lat: 39.9168, lng: -75.3877 };
    const york = { lat: 39.9626, lng: -76.7277 };
    const d = G.haversineMiles(media, york);
    assert.ok(d > 68 && d < 74, `Media to York ~71 mi, got ${d}`);
    assert.equal(G.haversineMiles(media, media), 0);
    assert.equal(G.normalizeZip(' 19063 '), '19063');
    assert.equal(G.normalizeZip('19063-1234'), '19063');
    assert.equal(G.normalizeZip('1906'), null);
    assert.equal(G.normalizeZip('abcde'), null);
    assert.equal(G.formatMiles(3.26), '3.3 mi');
    assert.equal(G.formatMiles(42.6), '43 mi');
    assert.deepEqual([...G.RADIUS_OPTIONS_MILES], [25, 50, 100]);
  });
  test('origin + radius keeps only gyms in range, sorted closest first; gyms without coordinates drop out', async () => {
    const F = await import('../lib/website/filters.ts');
    const FX = await import('../lib/website/fixtures.ts');
    const gyms = FX.DEMO_GYM_LISTINGS;
    for (const g of gyms) assert.ok(typeof g.lat === 'number' && typeof g.lng === 'number', `${g.slug} has coordinates`);
    const lancaster = { lat: 40.04, lng: -76.31 };
    const near15 = F.filterPublicGyms(gyms, { origin: lancaster, radiusMiles: 15 });
    assert.deepEqual(near15.map((g) => g.slug), ['iron-valley-barbell-club-pa']);
    const near25 = F.filterPublicGyms(gyms, { origin: lancaster, radiusMiles: 25 });
    assert.deepEqual(near25.map((g) => g.slug), ['iron-valley-barbell-club-pa', 'susquehanna-strength-barn-pa']);
    const near50 = F.filterPublicGyms(gyms, { origin: lancaster, radiusMiles: 50 });
    assert.deepEqual(near50.map((g) => g.slug), ['iron-valley-barbell-club-pa', 'susquehanna-strength-barn-pa', 'keystone-forge-strength-pa']);
    const noCoords = F.filterPublicGyms([{ ...gyms[0], lat: undefined, lng: undefined }], { origin: lancaster, radiusMiles: 100 });
    assert.equal(noCoords.length, 0);
    assert.equal(F.filterPublicGyms(gyms, { origin: null, radiusMiles: 25 }).length, 3);
    assert.equal(Math.round(F.gymDistanceMiles(gyms[2], lancaster)), 0);
  });
  test('zip table resolves real zips and rejects junk', async () => {
    const Z = await import('../lib/geo/zcta.ts');
    assert.ok(Z.ZCTA_COUNT > 33000);
    const c = Z.zipCentroid('37203');
    assert.ok(c && Math.abs(c.lat - 36.15) < 0.05 && Math.abs(c.lng + 86.79) < 0.05);
    assert.equal(Z.zipCentroid('00000'), null);
    assert.equal(Z.zipCentroid('nope'), null);
  });
});
