import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.env.ZT_ROOT || '..';
const FA = await import(`${ROOT}/lib/promoter/fixtureApi.ts`);

// 048 result claims (#9) against the fixture: the same rules the RPCs enforce, so the UI can be exercised offline.
async function completedMeet(api) {
  const meets = (await api.listMyMeets()).data;
  const done = meets.find((m) => m.listing.competitionStatus === 'completed');
  assert.ok(done, 'fixture ships a completed meet');
  const detail = (await api.getMeet(done.serverId)).data;
  return { serverId: done.serverId, athletes: detail.state.athletes };
}

describe('fixtureApi: result claims', () => {
  test('claim -> pending; status shows it; duplicate pending refused; withdraw clears it', async () => {
    const api = FA.createFixturePromoterApi();
    const { serverId, athletes } = await completedMeet(api);
    const c = await api.claimResult(serverId, athletes[0].id, '  That is me  ');
    assert.equal(c.error, null);
    assert.equal(c.data.status, 'pending');
    assert.equal(c.data.note, 'That is me');
    assert.equal(c.data.athleteName, athletes[0].name);
    const st = await api.getClaimStatus(serverId);
    assert.equal(st.data.myClaim.id, c.data.id);
    assert.equal(st.data.myAthleteId, null);
    const dup = await api.claimResult(serverId, athletes[1].id, null);
    assert.match(dup.error, /already have a claim waiting/);
    assert.equal((await api.listMyClaims()).data.length, 1);
    const w = await api.withdrawClaim(c.data.id);
    assert.equal(w.data.withdrawn, true);
    assert.equal((await api.getClaimStatus(serverId)).data.myClaim, null);
    assert.match((await api.withdrawClaim(c.data.id)).error, /no longer pending/);
  });
  test('approve links the row (shows in listAthleteAccounts and claim status); a second approve is refused', async () => {
    const api = FA.createFixturePromoterApi();
    const { serverId, athletes } = await completedMeet(api);
    const c = (await api.claimResult(serverId, athletes[0].id, null)).data;
    const pending = (await api.listMeetClaims(serverId)).data;
    assert.equal(pending.length, 1);
    assert.equal(pending[0].alreadyLinked, false);
    const ok = await api.resolveClaim(c.id, true);
    assert.equal(ok.data.status, 'approved');
    const links = (await api.listAthleteAccounts(serverId)).data;
    assert.equal(links.length, 1);
    assert.equal(links[0].athleteId, athletes[0].id);
    assert.equal(links[0].username, 'demo_athlete');
    const st = (await api.getClaimStatus(serverId)).data;
    assert.equal(st.myAthleteId, athletes[0].id);
    assert.deepEqual(st.linkedAthleteIds, [athletes[0].id]);
    assert.match((await api.resolveClaim(c.id, true)).error, /already approved/);
    assert.match((await api.claimResult(serverId, athletes[0].id, null)).error, /already linked to an account/);
    assert.match((await api.claimResult(serverId, athletes[1].id, null)).error, /already linked to .* on this show/);
  });
  test('reject leaves the row unlinked and the athlete may claim another row', async () => {
    const api = FA.createFixturePromoterApi();
    const { serverId, athletes } = await completedMeet(api);
    const c = (await api.claimResult(serverId, athletes[0].id, null)).data;
    const r = await api.resolveClaim(c.id, false);
    assert.equal(r.data.status, 'rejected');
    assert.equal((await api.listAthleteAccounts(serverId)).data.length, 0);
    const again = await api.claimResult(serverId, athletes[1].id, null);
    assert.equal(again.data.status, 'pending');
    const list = (await api.listMeetClaims(serverId)).data;
    assert.deepEqual(list.map((x) => x.status), ['pending', 'rejected'], 'pending first');
  });
  test('a promoter link by username settles the matching pending claim', async () => {
    const api = FA.createFixturePromoterApi();
    const { serverId, athletes } = await completedMeet(api);
    const c = (await api.claimResult(serverId, athletes[0].id, null)).data;
    await api.linkAthleteAccount(serverId, athletes[0].id, '@demo_athlete');
    const mine = (await api.listMyClaims()).data;
    assert.equal(mine[0].id, c.id);
    assert.equal(mine[0].status, 'approved');
  });
  test('refusals: upcoming show, unknown athlete, long note, signed out', async () => {
    const api = FA.createFixturePromoterApi();
    const meets = (await api.listMyMeets()).data;
    const upcoming = meets.find((m) => m.listing.competitionStatus !== 'completed');
    const upDetail = (await api.getMeet(upcoming.serverId)).data;
    assert.match((await api.claimResult(upcoming.serverId, upDetail.state.athletes[0].id, null)).error, /once the show is completed/);
    const { serverId, athletes } = await completedMeet(api);
    assert.match((await api.claimResult(serverId, 'nope', null)).error, /not on this roster/);
    assert.match((await api.claimResult(serverId, athletes[0].id, 'x'.repeat(201))).error, /200 characters/);
    api.setSignedOutForDev(true);
    assert.match((await api.claimResult(serverId, athletes[0].id, null)).error, /Sign in/);
    assert.match((await api.getClaimStatus(serverId)).error, /Sign in/);
  });
});
