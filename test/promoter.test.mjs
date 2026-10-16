import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.env.ZT_ROOT || '..';
const FA = await import(`${ROOT}/lib/promoter/fixtureApi.ts`);
const FX = await import(`${ROOT}/lib/promoter/fixtures.ts`);
const MB = await import(`${ROOT}/lib/meetBuilder.ts`);

describe('fixtureApi: session & seeded meets', () => {
  test('getCurrentUser returns signed-in demo promoter by default and null when signedOut is set', async () => {
    const api = FA.createFixturePromoterApi();
    const res1 = await api.getCurrentUser();
    assert.equal(res1.error, null);
    assert.equal(res1.data.email, FX.DEMO_PROMOTER_USER.email);
    assert.equal(res1.data.roles.promoter, true);

    api.setSignedOutForDev(true);
    const res2 = await api.getCurrentUser();
    assert.equal(res2.error, null);
    assert.equal(res2.data, null);

    const blockedList = await api.listMyMeets();
    assert.equal(blockedList.data, null);
    assert.match(blockedList.error, /Sign in required/);
  });

  test('updateProfile updates displayName and role flags', async () => {
    const api = FA.createFixturePromoterApi();
    const bad = await api.updateProfile({ displayName: '   ' });
    assert.equal(bad.data, null);
    assert.match(bad.error, /cannot be empty/);

    const ok = await api.updateProfile({
      displayName: 'York Barbell Promoters',
      roles: { athlete: false, promoter: true, gymOwner: true },
    });
    assert.equal(ok.error, null);
    assert.equal(ok.data.displayName, 'York Barbell Promoters');
    assert.equal(ok.data.roles.athlete, false);
  });

  test('seeded meets include 1 upcoming (open reg + 5 pending regs), 1 live, and 1 completed (final)', async () => {
    const api = FA.createFixturePromoterApi();
    const listRes = await api.listMyMeets();
    assert.equal(listRes.error, null);
    assert.equal(listRes.data.length, 3);

    const [upcoming, live, completed] = listRes.data;
    assert.equal(upcoming.listing.competitionStatus, 'upcoming');
    assert.equal(upcoming.listing.registrationStatus, 'open');

    const regsRes = await api.listRegistrations(upcoming.serverId);
    assert.equal(regsRes.error, null);
    const pending = regsRes.data.filter((r) => r.status === 'pending');
    assert.equal(pending.length, 5);

    assert.equal(live.listing.competitionStatus, 'live');
    assert.equal(completed.listing.competitionStatus, 'completed');
    assert.equal(completed.listing.resultsStatus, 'final');
  });
});

describe('fixtureApi: create, saveMeetState, updateListing, rotateJoinCode, archiveMeet', () => {
  test('createMeet validates inputs, rejects duplicate slugs, and initializes emptyListing', async () => {
    const api = FA.createFixturePromoterApi();

    const noName = await api.createMeet({ name: '  ', date: '2026-12-01' });
    assert.equal(noName.data, null);
    assert.match(noName.error, /Meet name is required/);

    const badDate = await api.createMeet({ name: 'Winter Show', date: 'not-a-date' });
    assert.equal(badDate.data, null);
    assert.match(badDate.error, /Meet date is required/);

    const created = await api.createMeet({
      name: 'Keystone Anvil 2026',
      date: '2026-12-12',
    });
    assert.equal(created.error, null);
    assert.equal(created.data.summary.slug, 'keystone-anvil-2026');
    assert.equal(created.data.summary.listing.isPublicListed, false);
    assert.equal(created.data.summary.joinCode.length, 6);

    const dup = await api.createMeet({
      name: 'Keystone Anvil 2026',
      date: '2026-12-12',
    });
    assert.equal(dup.data, null);
    assert.match(dup.error, /already exists/);
  });

  test('saveMeetState persists divisions/events/athletes while keeping existing server results read-only', async () => {
    const api = FA.createFixturePromoterApi();
    const liveRes = await api.getMeet('srv-meet-live-2');
    assert.equal(liveRes.error, null);
    const originalResultsCount = liveRes.data.state.results.length;
    assert.ok(originalResultsCount > 0);

    // Mutate divisions and attempt to wipe results in working state
    let mutated = MB.addDivision(liveRes.data.state, { name: 'Masters 40+', flight: 'A' });
    mutated = { ...mutated, results: [] };

    const saved = await api.saveMeetState('srv-meet-live-2', mutated);
    assert.equal(saved.error, null);
    assert.equal(saved.data.summary.divisionCount, liveRes.data.summary.divisionCount + 1);
    // Results must be preserved untouched
    assert.equal(saved.data.state.results.length, originalResultsCount);
  });

  test('updateListing validates registrationDeadline <= meetDate and positive athleteCap', async () => {
    const api = FA.createFixturePromoterApi();
    // srv-meet-upcoming-1 is on 2026-11-14
    const lateDeadline = await api.updateListing('srv-meet-upcoming-1', {
      registrationDeadline: '2026-11-20',
    });
    assert.equal(lateDeadline.data, null);
    assert.match(lateDeadline.error, /on or before the meet date/);

    const badCap = await api.updateListing('srv-meet-upcoming-1', {
      athleteCap: 0,
    });
    assert.equal(badCap.data, null);
    assert.match(badCap.error, /positive whole number/);

    const goodUpdate = await api.updateListing('srv-meet-upcoming-1', {
      registrationDeadline: '2026-11-10',
      athleteCap: 50,
      federation: 'Unsanctioned',
    });
    assert.equal(goodUpdate.error, null);
    assert.equal(goodUpdate.data.listing.registrationDeadline, '2026-11-10');
    assert.equal(goodUpdate.data.listing.athleteCap, 50);
    assert.equal(goodUpdate.data.listing.federation, 'Unsanctioned');
  });

  test('rotateJoinCode changes the 6-char code and archiveMeet sets competitionStatus to completed', async () => {
    const api = FA.createFixturePromoterApi();
    const before = await api.getMeet('srv-meet-upcoming-1');
    const oldCode = before.data.summary.joinCode;

    const rotated = await api.rotateJoinCode('srv-meet-upcoming-1');
    assert.equal(rotated.error, null);
    assert.equal(rotated.data.joinCode.length, 6);
    assert.notEqual(rotated.data.joinCode, oldCode);

    const archived = await api.archiveMeet('srv-meet-upcoming-1');
    assert.equal(archived.error, null);
    const after = await api.getMeet('srv-meet-upcoming-1');
    assert.equal(after.data.summary.listing.competitionStatus, 'completed');
  });
});

describe('fixtureApi: setRegistrationStatus & pure helpers', () => {
  test('accepting a pending registration adds a roster entry in that division; declining removes it if unscored', async () => {
    const api = FA.createFixturePromoterApi();
    const before = await api.getMeet('srv-meet-upcoming-1');
    const beforeCount = before.data.state.athletes.length;

    // reg-ifc-3 is Jules Testperson (Fake) in ifc-g1 (pending)
    const accepted = await api.setRegistrationStatus('reg-ifc-3', 'accepted');
    assert.equal(accepted.error, null);
    assert.equal(accepted.data.status, 'accepted');

    const afterAccept = await api.getMeet('srv-meet-upcoming-1');
    assert.equal(afterAccept.data.state.athletes.length, beforeCount + 1);
    const addedAth = afterAccept.data.state.athletes.find(
      (a) => a.name === 'Jules Testperson (Fake)'
    );
    assert.ok(addedAth);
    assert.equal(addedAth.divisionId, 'ifc-g1');
    assert.equal(addedAth.lotNumber, 2); // Alex Sample is lot 1 in ifc-g1

    // Declining removes the unscored athlete from the roster
    const declined = await api.setRegistrationStatus('reg-ifc-3', 'declined');
    assert.equal(declined.error, null);
    const afterDecline = await api.getMeet('srv-meet-upcoming-1');
    assert.equal(afterDecline.data.state.athletes.length, beforeCount);
  });

  test('isMeetStateDirty detects config/roster edits and ignores result differences', () => {
    const s1 = MB.createBlankMeet('Test', '2026-11-01');
    const s2 = JSON.parse(JSON.stringify(s1));
    assert.equal(FA.isMeetStateDirty(s1, s2), false);

    // Result-only change is not dirty for the promoter builder
    s2.results.push({ id: 'e1_a1', eventId: 'e1', athleteId: 'a1', reps: 5, updatedAt: 1 });
    assert.equal(FA.isMeetStateDirty(s1, s2), false);

    // Division addition is dirty
    const s3 = MB.addDivision(s1, { name: 'Open', flight: 'A' });
    assert.equal(FA.isMeetStateDirty(s1, s3), true);
  });
});
