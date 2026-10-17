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

    const blockedBySlug = await api.getMeetBySlug('iron-furnace-classic-2026');
    assert.equal(blockedBySlug.data, null);
    assert.match(blockedBySlug.error, /Sign in required/);
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

  test('seeded meets: upcoming has athleteCount 2, registrationCount 2 (accepted), pendingCount 5', async () => {
    const api = FA.createFixturePromoterApi();
    const listRes = await api.listMyMeets();
    assert.equal(listRes.error, null);
    assert.equal(listRes.data.length, 3);

    const [upcoming, live, completed] = listRes.data;
    assert.equal(upcoming.listing.competitionStatus, 'upcoming');
    assert.equal(upcoming.listing.registrationStatus, 'open');
    assert.equal(upcoming.athleteCount, 2);
    assert.equal(upcoming.registrationCount, 2);
    assert.equal(upcoming.pendingCount, 5);
    assert.equal(upcoming.listing.promoterContact, 'promoter.demo@zerotacky.example');

    const regsRes = await api.listRegistrations(upcoming.serverId);
    assert.equal(regsRes.error, null);
    assert.equal(regsRes.data.filter((r) => r.status === 'pending').length, 5);
    const accepted = regsRes.data.filter((r) => r.status === 'accepted');
    assert.deepEqual(accepted.map((r) => r.athleteId).sort(), ['ifc-ath-1', 'ifc-ath-2']);
    assert.ok(regsRes.data.every((r) => typeof r.emergencyContact === 'string' && r.emergencyContact.length > 0));

    assert.equal(live.listing.competitionStatus, 'live');
    assert.equal(live.pendingCount, 0);
    assert.equal(live.registrationCount, 1);
    assert.equal(completed.listing.competitionStatus, 'completed');
    assert.equal(completed.listing.resultsStatus, 'final');
  });
});

describe('fixtureApi: create, saveMeetState, updateListing, rotateJoinCode, archiveMeet', () => {
  test('createMeet validates inputs, rejects duplicate slugs, and initializes emptyListing with zero counts', async () => {
    const api = FA.createFixturePromoterApi();

    const noName = await api.createMeet({ name: '  ', date: '2026-12-01' });
    assert.equal(noName.data, null);
    assert.match(noName.error, /Meet name is required/);

    const badDate = await api.createMeet({ name: 'Winter Show', date: 'not-a-date' });
    assert.equal(badDate.data, null);
    assert.match(badDate.error, /Meet date is required/);

    const created = await api.createMeet({ name: 'Keystone Anvil 2026', date: '2026-12-12' });
    assert.equal(created.error, null);
    assert.equal(created.data.summary.slug, 'keystone-anvil-2026');
    assert.equal(created.data.summary.listing.isPublicListed, false);
    assert.equal(created.data.summary.listing.promoterContact, null);
    assert.equal(created.data.summary.joinCode.length, 6);
    assert.equal(created.data.summary.pendingCount, 0);
    assert.equal(created.data.summary.registrationCount, 0);

    const dup = await api.createMeet({ name: 'Keystone Anvil 2026', date: '2026-12-12' });
    assert.equal(dup.data, null);
    assert.match(dup.error, /already exists/);
  });

  test('saveMeetState persists divisions while keeping the stored results array byte-for-byte', async () => {
    const api = FA.createFixturePromoterApi();
    const liveRes = await api.getMeet('srv-meet-live-2');
    assert.equal(liveRes.error, null);
    const originalResults = JSON.parse(JSON.stringify(liveRes.data.state.results));
    assert.ok(originalResults.length > 0);

    let mutated = MB.addDivision(liveRes.data.state, { name: 'Masters 40+', flight: 'A' });
    mutated = { ...mutated, results: [] };

    const saved = await api.saveMeetState('srv-meet-live-2', mutated);
    assert.equal(saved.error, null);
    assert.equal(saved.data.summary.divisionCount, liveRes.data.summary.divisionCount + 1);
    assert.deepEqual(saved.data.state.results, originalResults);

    const reread = await api.getMeet('srv-meet-live-2');
    assert.deepEqual(reread.data.state.results, originalResults);
  });

  test('H3: saveMeetState refuses a state that orphans a result (athlete or event), roster unchanged', async () => {
    const api = FA.createFixturePromoterApi();
    const live = (await api.getMeet('srv-meet-live-2')).data;
    const rosterBefore = JSON.parse(JSON.stringify(live.state.athletes));

    // srs-a1 has a locked result in srs-ev-1
    const withoutAthlete = { ...live.state, athletes: live.state.athletes.filter((a) => a.id !== 'srs-a1') };
    const r1 = await api.saveMeetState('srv-meet-live-2', withoutAthlete);
    assert.equal(r1.data, null);
    assert.match(r1.error, /Casey Placeholder \(Fake\)/);
    assert.match(r1.error, /12" Log Clean & Press/);

    const withoutEvent = { ...live.state, events: live.state.events.filter((e) => e.id !== 'srs-ev-1') };
    const r2 = await api.saveMeetState('srv-meet-live-2', withoutEvent);
    assert.equal(r2.data, null);
    assert.match(r2.error, /Event "12" Log Clean & Press" has recorded results/);

    const after = (await api.getMeet('srv-meet-live-2')).data;
    assert.deepEqual(after.state.athletes, rosterBefore);
    assert.equal(after.state.events.length, live.state.events.length);

    // srs-a4 has no results, so removing it is allowed
    const okState = { ...live.state, athletes: live.state.athletes.filter((a) => a.id !== 'srs-a4') };
    const r3 = await api.saveMeetState('srv-meet-live-2', okState);
    assert.equal(r3.error, null);
    assert.equal(r3.data.state.athletes.length, rosterBefore.length - 1);
  });

  test('L1: saveMeetState refuses a meet date earlier than the registration deadline', async () => {
    const api = FA.createFixturePromoterApi();
    const up = (await api.getMeet('srv-meet-upcoming-1')).data;
    // deadline is 2026-11-07
    const early = { ...up.state, meet: { ...up.state.meet, date: '2026-11-01' } };
    const res = await api.saveMeetState('srv-meet-upcoming-1', early);
    assert.equal(res.data, null);
    assert.match(res.error, /earlier than the registration deadline/);
    assert.equal((await api.getMeet('srv-meet-upcoming-1')).data.summary.date, '2026-11-14');
  });

  test('updateListing validates deadline <= meetDate, integer athleteCap, promoterContact shape', async () => {
    const api = FA.createFixturePromoterApi();
    const lateDeadline = await api.updateListing('srv-meet-upcoming-1', { registrationDeadline: '2026-11-20' });
    assert.equal(lateDeadline.data, null);
    assert.match(lateDeadline.error, /on or before the meet date/);

    const badCap = await api.updateListing('srv-meet-upcoming-1', { athleteCap: 0 });
    assert.equal(badCap.data, null);
    assert.match(badCap.error, /positive whole number/);

    const fractionalCap = await api.updateListing('srv-meet-upcoming-1', { athleteCap: 12.5 });
    assert.equal(fractionalCap.data, null);
    assert.match(fractionalCap.error, /positive whole number/);

    const nanCap = await api.updateListing('srv-meet-upcoming-1', { athleteCap: Number('abc') });
    assert.equal(nanCap.data, null);

    const badContact = await api.updateListing('srv-meet-upcoming-1', { promoterContact: 'call me' });
    assert.equal(badContact.data, null);
    assert.match(badContact.error, /email address or a phone number/);

    const goodUpdate = await api.updateListing('srv-meet-upcoming-1', {
      registrationDeadline: '2026-11-10',
      athleteCap: 50,
      federation: 'Unsanctioned',
      promoterContact: ' 717-555-0199 ',
    });
    assert.equal(goodUpdate.error, null);
    assert.equal(goodUpdate.data.listing.registrationDeadline, '2026-11-10');
    assert.equal(goodUpdate.data.listing.athleteCap, 50);
    assert.equal(goodUpdate.data.listing.federation, 'Unsanctioned');
    assert.equal(goodUpdate.data.listing.promoterContact, '717-555-0199');

    const cleared = await api.updateListing('srv-meet-upcoming-1', { promoterContact: '   ' });
    assert.equal(cleared.error, null);
    assert.equal(cleared.data.listing.promoterContact, null);
  });

  test('rotateJoinCode changes the stored 6-char code (re-read) and archiveMeet sets completed', async () => {
    const api = FA.createFixturePromoterApi();
    const before = await api.getMeet('srv-meet-upcoming-1');
    const oldCode = before.data.summary.joinCode;

    const rotated = await api.rotateJoinCode('srv-meet-upcoming-1');
    assert.equal(rotated.error, null);
    assert.equal(rotated.data.joinCode.length, 6);
    assert.notEqual(rotated.data.joinCode, oldCode);

    const stored = await api.getMeet('srv-meet-upcoming-1');
    assert.equal(stored.data.summary.joinCode, rotated.data.joinCode);
    const listed = (await api.listMyMeets()).data.find((m) => m.serverId === 'srv-meet-upcoming-1');
    assert.equal(listed.joinCode, rotated.data.joinCode);

    const archived = await api.archiveMeet('srv-meet-upcoming-1');
    assert.equal(archived.error, null);
    const after = await api.getMeet('srv-meet-upcoming-1');
    assert.equal(after.data.summary.listing.competitionStatus, 'completed');
  });
});

describe('fixtureApi: setRegistrationStatus (athleteId linkage) & pure helpers', () => {
  test('accept creates exactly one roster row linked by athleteId; decline removes exactly that id and updates counts', async () => {
    const api = FA.createFixturePromoterApi();
    const before = (await api.getMeet('srv-meet-upcoming-1')).data;
    const beforeIds = before.state.athletes.map((a) => a.id);

    // reg-ifc-3 is Jules Testperson (Fake) in ifc-g1 (pending)
    const accepted = await api.setRegistrationStatus('reg-ifc-3', 'accepted');
    assert.equal(accepted.error, null);
    assert.equal(accepted.data.status, 'accepted');
    assert.equal(accepted.data.athleteId, 'reg-ath-reg-ifc-3');

    const afterAccept = (await api.getMeet('srv-meet-upcoming-1')).data;
    assert.equal(afterAccept.state.athletes.length, beforeIds.length + 1);
    const added = afterAccept.state.athletes.find((a) => a.id === 'reg-ath-reg-ifc-3');
    assert.ok(added);
    assert.equal(added.name, 'Jules Testperson (Fake)');
    assert.equal(added.divisionId, 'ifc-g1');
    assert.equal(added.lotNumber, 2); // Alex Sample is lot 1 in ifc-g1
    assert.equal(afterAccept.summary.athleteCount, 3);
    assert.equal(afterAccept.summary.registrationCount, 3);
    assert.equal(afterAccept.summary.pendingCount, 4);

    const declined = await api.setRegistrationStatus('reg-ifc-3', 'declined');
    assert.equal(declined.error, null);
    assert.equal(declined.data.athleteId, null);
    const afterDecline = (await api.getMeet('srv-meet-upcoming-1')).data;
    assert.deepEqual(afterDecline.state.athletes.map((a) => a.id), beforeIds);
    assert.equal(afterDecline.summary.athleteCount, 2);
    assert.equal(afterDecline.summary.registrationCount, 2);
    assert.equal(afterDecline.summary.pendingCount, 4);
  });

  test('H2: two registrants with the same name in the same division become two athletes; declining a pending same-name request removes nothing', async () => {
    const api = FA.createFixturePromoterApi();
    const base = {
      slug: 'iron-furnace-classic-2026',
      divisionId: 'ifc-g1',
      athleteName: 'Alex Sample (Fake)', // same name as the seeded ifc-ath-1
      emergencyContact: 'Sam Sample 717-555-0101',
      waiverAccepted: true,
      waiverVersion: 'testwaiver01',
    };
    const s1 = await api.submitRegistration({ ...base, email: 'alex.one@example.com' });
    const s2 = await api.submitRegistration({ ...base, email: 'alex.two@example.com' });
    assert.equal(s1.error, null);
    assert.equal(s2.error, null);

    const rosterBefore = (await api.getMeet('srv-meet-upcoming-1')).data.state.athletes.map((a) => a.id);

    // Declining a pending request with the same name as a roster athlete must not touch the roster.
    const dec = await api.setRegistrationStatus(s1.data.id, 'declined');
    assert.equal(dec.error, null);
    const rosterAfterDecline = (await api.getMeet('srv-meet-upcoming-1')).data.state.athletes.map((a) => a.id);
    assert.deepEqual(rosterAfterDecline, rosterBefore);

    const acc2 = await api.setRegistrationStatus(s2.data.id, 'accepted');
    assert.equal(acc2.error, null);
    const regs = (await api.listRegistrations('srv-meet-upcoming-1')).data;
    const sameName = regs.filter((r) => r.athleteName === 'Alex Sample (Fake)' && r.status === 'accepted');
    assert.equal(sameName.length, 2);
    const ids = sameName.map((r) => r.athleteId).sort();
    assert.deepEqual(ids, ['ifc-ath-1', `reg-ath-${s2.data.id}`]);
    const roster = (await api.getMeet('srv-meet-upcoming-1')).data.state.athletes;
    assert.equal(roster.filter((a) => a.name === 'Alex Sample (Fake)' && a.divisionId === 'ifc-g1').length, 2);
  });

  test('M6: accept fails when the division no longer exists; roster unchanged', async () => {
    const api = FA.createFixturePromoterApi();
    const up = (await api.getMeet('srv-meet-upcoming-1')).data;
    // ifc-g3 has no athletes or results; reg-ifc-6 and reg-ifc-7 are pending in it
    const noG3 = {
      ...up.state,
      divisions: up.state.divisions.filter((d) => d.id !== 'ifc-g3'),
      events: up.state.events.map((e) => {
        const { 'ifc-g3': _drop, ...rest } = e.divisionWeights;
        return { ...e, divisionWeights: rest };
      }),
    };
    const saved = await api.saveMeetState('srv-meet-upcoming-1', noG3);
    assert.equal(saved.error, null);

    const res = await api.setRegistrationStatus('reg-ifc-6', 'accepted');
    assert.equal(res.data, null);
    assert.match(res.error, /division that no longer exists/);
    const regs = (await api.listRegistrations('srv-meet-upcoming-1')).data;
    assert.equal(regs.find((r) => r.id === 'reg-ifc-6').status, 'pending');
    assert.equal((await api.getMeet('srv-meet-upcoming-1')).data.state.athletes.length, up.state.athletes.length);
  });

  test('declining or withdrawing an accepted request whose athlete has results is refused; roster and status unchanged', async () => {
    const api = FA.createFixturePromoterApi();
    const live = (await api.getMeet('srv-meet-live-2')).data;
    const rosterBefore = JSON.parse(JSON.stringify(live.state.athletes));
    assert.equal(live.summary.registrationCount, 1);

    for (const status of ['declined', 'withdrawn']) {
      const res = await api.setRegistrationStatus('reg-srs-1', status);
      assert.equal(res.data, null);
      assert.match(res.error, /Casey Placeholder \(Fake\) has recorded results \(12" Log Clean & Press\)/);
    }
    const regs = (await api.listRegistrations('srv-meet-live-2')).data;
    const reg = regs.find((r) => r.id === 'reg-srs-1');
    assert.equal(reg.status, 'accepted');
    assert.equal(reg.athleteId, 'srs-a1');
    const after = (await api.getMeet('srv-meet-live-2')).data;
    assert.deepEqual(after.state.athletes, rosterBefore);
    assert.equal(after.summary.registrationCount, 1);
  });

  test('isMeetStateDirty detects config/roster edits and ignores result differences', () => {
    const s1 = MB.createBlankMeet('Test', '2026-11-01');
    const s2 = JSON.parse(JSON.stringify(s1));
    assert.equal(FA.isMeetStateDirty(s1, s2), false);

    s2.results.push({ id: 'e1_a1', eventId: 'e1', athleteId: 'a1', reps: 5, updatedAt: 1 });
    assert.equal(FA.isMeetStateDirty(s1, s2), false);

    const s3 = MB.addDivision(s1, { name: 'Open', flight: 'A' });
    assert.equal(FA.isMeetStateDirty(s1, s3), true);
  });
});

// Astra gate round (10/17 pm): fixture mirrors of the 007 server rules.
describe('fixtureApi: gate round (cap on roster save, accepted division fixed, listing revision)', () => {
  test('C4: a roster save above the listing cap is refused; lowering the cap below the roster is refused', async () => {
    const api = FA.createFixturePromoterApi();
    const meet = (await api.getMeet('srv-meet-upcoming-1')).data;   // 2 athletes, cap 40
    const capped = await api.updateListing('srv-meet-upcoming-1', { athleteCap: 2 });
    assert.equal(capped.error, null);

    const tooLow = await api.updateListing('srv-meet-upcoming-1', { athleteCap: 1 });
    assert.equal(tooLow.data, null);
    assert.match(tooLow.error, /roster already has 2 athletes/);

    const withExtra = {
      ...meet.state,
      athletes: [...meet.state.athletes, { ...meet.state.athletes[0], id: 'walk-in-1', name: 'Walk In', lotNumber: 9 }],
    };
    const over = await api.saveMeetState('srv-meet-upcoming-1', withExtra);
    assert.equal(over.data, null);
    assert.match(over.error, /roster has 3 athletes but the listing cap is 2/);
    assert.equal((await api.getMeet('srv-meet-upcoming-1')).data.state.athletes.length, 2);

    const raised = await api.updateListing('srv-meet-upcoming-1', { athleteCap: 3 });
    assert.equal(raised.error, null);
    const ok = await api.saveMeetState('srv-meet-upcoming-1', withExtra);
    assert.equal(ok.error, null);
    assert.equal(ok.data.state.athletes.length, 3);
  });

  test('M9: an accepted athlete cannot be moved to another division through the roster; name edits are fine', async () => {
    const api = FA.createFixturePromoterApi();
    const meet = (await api.getMeet('srv-meet-upcoming-1')).data;   // ifc-ath-1 is accepted reg-ifc-1 in ifc-g1
    const moved = {
      ...meet.state,
      athletes: meet.state.athletes.map((a) => (a.id === 'ifc-ath-1' ? { ...a, divisionId: 'ifc-g2' } : a)),
    };
    const refused = await api.saveMeetState('srv-meet-upcoming-1', moved);
    assert.equal(refused.data, null);
    assert.match(refused.error, /registered for a specific division/);
    assert.equal((await api.getMeet('srv-meet-upcoming-1')).data.state.athletes.find((a) => a.id === 'ifc-ath-1').divisionId, 'ifc-g1');

    const renamed = {
      ...meet.state,
      athletes: meet.state.athletes.map((a) => (a.id === 'ifc-ath-1' ? { ...a, name: 'Alex Sample-Corrected' } : a)),
    };
    const ok = await api.saveMeetState('srv-meet-upcoming-1', renamed);
    assert.equal(ok.error, null);
    assert.equal(ok.data.state.athletes.find((a) => a.id === 'ifc-ath-1').name, 'Alex Sample-Corrected');
  });

  test('C3 (listing): a stale tab cannot flip registration back open; the revision advances on every listing save', async () => {
    const api = FA.createFixturePromoterApi();
    const first = (await api.getMeet('srv-meet-upcoming-1')).data;
    const rev1 = first.summary.updatedAt;

    const closed = await api.updateListing('srv-meet-upcoming-1', { registrationStatus: 'closed' }, { expectedUpdatedAt: rev1 });
    assert.equal(closed.error, null);
    assert.equal(closed.data.listing.registrationStatus, 'closed');
    assert.notEqual(closed.data.updatedAt, rev1);

    const stale = await api.updateListing('srv-meet-upcoming-1', { ...first.summary.listing }, { expectedUpdatedAt: rev1 });
    assert.equal(stale.data, null);
    assert.match(stale.error, /changed since you opened it/);
    assert.equal((await api.getMeet('srv-meet-upcoming-1')).data.summary.listing.registrationStatus, 'closed');

    const fresh = await api.updateListing('srv-meet-upcoming-1', { federation: 'USS' }, { expectedUpdatedAt: closed.data.updatedAt });
    assert.equal(fresh.error, null);
    assert.equal(fresh.data.listing.registrationStatus, 'closed');
  });
});
