import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.env.ZT_ROOT || '..';
const FA = await import(`${ROOT}/lib/promoter/fixtureApi.ts`);

const GOOD = {
  slug: 'iron-furnace-classic-2026',
  divisionId: 'ifc-g2',
  athleteName: 'Riley Competitor (Fake)',
  email: 'riley.competitor@example.com',
  emergencyContact: 'Sam Competitor (spouse) 717-555-0144',
  waiverAccepted: true,
  waiverVersion: 'testwaiver01',
};

describe('register: public meet shape (H1)', () => {
  test('getPublicMeetBySlug returns the allowlisted shape and no owner data', async () => {
    const api = FA.createFixturePromoterApi();
    const res = await api.getPublicMeetBySlug('iron-furnace-classic-2026');
    assert.equal(res.error, null);
    const pub = res.data;
    assert.equal(pub.slug, 'iron-furnace-classic-2026');
    assert.equal(pub.name, 'Iron Furnace Classic 2026');
    assert.equal(pub.promoterDisplayName, 'Keystone Iron Promotions (Demo)');
    assert.equal(pub.listing.promoterContact, 'promoter.demo@zerotacky.example');
    assert.equal(pub.acceptedCount, 2);
    assert.deepEqual(Object.keys(pub).sort(), ['acceptedCount', 'date', 'divisions', 'listing', 'name', 'promoterDisplayName', 'slug']);
    assert.deepEqual(Object.keys(pub.listing).sort(), ['athleteCap', 'competitionStatus', 'entryFeeDisplay', 'federation', 'promoterContact', 'registrationDeadline', 'registrationStatus', 'venue']);
    assert.equal(pub.divisions.length, 3);
    assert.deepEqual(pub.divisions[0].targetWeights[0], { eventName: '12" Log Clean & Press (For Reps)', weight: 185 });

    // Secrets: the only "@" allowed is the promoter's public contact.
    const json = JSON.stringify({ ...pub, listing: { ...pub.listing, promoterContact: null } });
    for (const needle of ['joinCode', 'adminPin', '@', 'emergencyContact', 'results', 'serverId', 'FRNC26', '1050']) {
      assert.equal(json.includes(needle), false, `public shape leaked "${needle}"`);
    }
  });

  test('getPublicMeetBySlug returns data null, error null for an unknown slug; works without a session', async () => {
    const api = FA.createFixturePromoterApi({ signedOut: true });
    const missing = await api.getPublicMeetBySlug('no-such-meet');
    assert.deepEqual(missing, { data: null, error: null });
    const ok = await api.getPublicMeetBySlug('iron-furnace-classic-2026');
    assert.equal(ok.error, null);
    assert.ok(ok.data);
  });

  test('bridged /shows fixture carries its own promoter name and contact', async () => {
    const api = FA.createFixturePromoterApi({ signedOut: true });
    const res = await api.getPublicMeetBySlug('garden-state-winter-wreckage-2026');
    assert.equal(res.error, null);
    assert.equal(res.data.listing.registrationStatus, 'waitlist');
    assert.notEqual(res.data.promoterDisplayName, 'Keystone Iron Promotions (Demo)');
    assert.equal(typeof res.data.promoterDisplayName, 'string');
    const json = JSON.stringify({ ...res.data, listing: { ...res.data.listing, promoterContact: null } });
    for (const needle of ['joinCode', 'adminPin', 'emergencyContact', 'results']) {
      assert.equal(json.includes(needle), false, `bridged public shape leaked "${needle}"`);
    }
  });
});

describe('register: pure validation helpers', () => {
  test('isRegistrationOpen allows open and waitlist only', () => {
    assert.equal(FA.isRegistrationOpen('open'), true);
    assert.equal(FA.isRegistrationOpen('waitlist'), true);
    assert.equal(FA.isRegistrationOpen('closed'), false);
    assert.equal(FA.isRegistrationOpen('day_of_only'), false);
    assert.equal(FA.isRegistrationOpen('not_applicable'), false);
    assert.equal(FA.isRegistrationOpen('not_provided'), false);
  });

  test('validateRegistrationInput checks name, email, emergency contact (name + 7 digits), division, waiver', async () => {
    const api = FA.createFixturePromoterApi();
    const meet = (await api.getPublicMeetBySlug('iron-furnace-classic-2026')).data;

    assert.equal(FA.validateRegistrationInput(GOOD, meet), null);
    assert.match(FA.validateRegistrationInput({ ...GOOD, athleteName: ' ' }, meet), /athlete full name/);
    assert.match(FA.validateRegistrationInput({ ...GOOD, email: 'not-an-email' }, meet), /valid email/);
    assert.match(FA.validateRegistrationInput({ ...GOOD, emergencyContact: '123' }, meet), /Emergency contact needs a name and a phone/);
    assert.match(FA.validateRegistrationInput({ ...GOOD, emergencyContact: 'Sam Competitor' }, meet), /at least 7 digits/);
    assert.match(FA.validateRegistrationInput({ ...GOOD, emergencyContact: '717-555-0144' }, meet), /needs a name/);
    assert.equal(FA.validateRegistrationInput({ ...GOOD, emergencyContact: 'Jo 5550144' }, meet), null);
    assert.match(FA.validateRegistrationInput({ ...GOOD, divisionId: 'nonexistent-div' }, meet), /valid division/);
    assert.match(FA.validateRegistrationInput({ ...GOOD, waiverAccepted: false }, meet), /accept the competition waiver/);
  });

  test('validateRegistrationInput rejects closed meets', async () => {
    const api = FA.createFixturePromoterApi();
    const closed = (await api.getPublicMeetBySlug('steel-river-showdown-2026')).data;
    assert.match(FA.validateRegistrationInput({ ...GOOD, slug: closed.slug, divisionId: 'srs-d1' }, closed), /currently closed/);
  });

  test('decideRegistrationOutcome: closed/not_provided error; open past deadline error; open at cap error; waitlist always waitlist', async () => {
    const api = FA.createFixturePromoterApi();
    const open = (await api.getPublicMeetBySlug('iron-furnace-classic-2026')).data; // deadline 2026-11-07, cap 40, 2 on roster

    assert.deepEqual(FA.decideRegistrationOutcome(open, '2026-11-07'), { status: 'pending', error: null });
    const late = FA.decideRegistrationOutcome(open, '2026-11-08');
    assert.equal(late.status, null);
    assert.match(late.error, /closed on 2026-11-07/);

    const full = FA.decideRegistrationOutcome({ ...open, acceptedCount: 40 }, '2026-11-01');
    assert.equal(full.status, null);
    assert.match(full.error, /is full \(40 of 40 spots taken\)/);

    const wl = { ...open, listing: { ...open.listing, registrationStatus: 'waitlist' } };
    assert.deepEqual(FA.decideRegistrationOutcome(wl, '2026-12-01'), { status: 'waitlist', error: null });
    assert.deepEqual(FA.decideRegistrationOutcome({ ...wl, acceptedCount: 99 }, '2026-11-01'), { status: 'waitlist', error: null });

    for (const status of ['closed', 'not_provided', 'day_of_only', 'not_applicable']) {
      const res = FA.decideRegistrationOutcome({ ...open, listing: { ...open.listing, registrationStatus: status } }, '2026-11-01');
      assert.equal(res.status, null);
      assert.match(res.error, /currently closed/);
    }
  });
});

describe('register: submitRegistration into fixtureApi (M10, M19)', () => {
  test('submission creates a pending request with emergencyContact and athleteId null; counts move', async () => {
    const api = FA.createFixturePromoterApi({ today: () => '2026-11-01' });
    const before = (await api.getMeet('srv-meet-upcoming-1')).data.summary;
    assert.equal(before.pendingCount, 5);

    const submitRes = await api.submitRegistration({
      ...GOOD,
      athleteName: 'Quinn Newcomer (Fake)',
      email: 'Quinn.Newcomer@Example.com',
      emergencyContact: 'Pat Newcomer 717-555-0188',
    });
    assert.equal(submitRes.error, null);
    assert.deepEqual(Object.keys(submitRes.data).sort(), ['id', 'status']);
    assert.equal(submitRes.data.status, 'pending');

    const regs = (await api.listRegistrations('srv-meet-upcoming-1')).data;
    const created = regs.find((r) => r.id === submitRes.data.id);
    assert.equal(regs[0].id, created.id);
    assert.equal(created.athleteName, 'Quinn Newcomer (Fake)');
    assert.equal(created.email, 'quinn.newcomer@example.com');
    assert.equal(created.emergencyContact, 'Pat Newcomer 717-555-0188');
    assert.equal(created.athleteId, null);
    assert.equal(created.waitlisted, false);
    assert.equal(created.paid, false);
    assert.ok(created.waiverAcceptedAt);

    const afterSubmit = (await api.getMeet('srv-meet-upcoming-1')).data.summary;
    assert.equal(afterSubmit.pendingCount, 6);
    assert.equal(afterSubmit.registrationCount, 2);
    assert.equal(afterSubmit.athleteCount, 2);

    const acc = await api.setRegistrationStatus(created.id, 'accepted');
    assert.equal(acc.error, null);
    const afterAccept = (await api.getMeet('srv-meet-upcoming-1')).data.summary;
    assert.equal(afterAccept.pendingCount, 5);
    assert.equal(afterAccept.registrationCount, 3);
    assert.equal(afterAccept.athleteCount, 3);
    assert.equal((await api.getPublicMeetBySlug(GOOD.slug)).data.acceptedCount, 3);

    const dec = await api.setRegistrationStatus(created.id, 'declined');
    assert.equal(dec.error, null);
    const afterDecline = (await api.getMeet('srv-meet-upcoming-1')).data.summary;
    assert.equal(afterDecline.pendingCount, 5);
    assert.equal(afterDecline.registrationCount, 2);
    assert.equal(afterDecline.athleteCount, 2);
  });

  test('rejects duplicate active/pending registration for same email and division', async () => {
    const api = FA.createFixturePromoterApi({ today: () => '2026-11-01' });
    const payload = { ...GOOD, divisionId: 'ifc-g3', athleteName: 'Avery Duplicate (Fake)', email: 'avery.dup@example.com' };
    const first = await api.submitRegistration(payload);
    assert.equal(first.error, null);
    const second = await api.submitRegistration(payload);
    assert.equal(second.data, null);
    assert.match(second.error, /already exists/);
  });

  test('M10: closed meet -> error; open past deadline -> error; open at cap -> error; nothing stored', async () => {
    const api = FA.createFixturePromoterApi({ today: () => '2026-11-08' });

    const closed = await api.submitRegistration({ ...GOOD, slug: 'steel-river-showdown-2026', divisionId: 'srs-d1' });
    assert.equal(closed.data, null);
    assert.match(closed.error, /currently closed/);

    const late = await api.submitRegistration(GOOD); // deadline 2026-11-07
    assert.equal(late.data, null);
    assert.match(late.error, /closed on 2026-11-07/);

    const api2 = FA.createFixturePromoterApi({ today: () => '2026-11-01' });
    const capped = await api2.updateListing('srv-meet-upcoming-1', { athleteCap: 2 }); // roster already has 2
    assert.equal(capped.error, null);
    const full = await api2.submitRegistration(GOOD);
    assert.equal(full.data, null);
    assert.match(full.error, /is full \(2 of 2 spots taken\)/);
    assert.equal((await api2.getMeet('srv-meet-upcoming-1')).data.summary.pendingCount, 5);
  });

  test('M10: waitlist status takes the entry past deadline and at cap, returns status waitlist, stores waitlisted=true', async () => {
    const api = FA.createFixturePromoterApi({ today: () => '2026-11-08' });
    const upd = await api.updateListing('srv-meet-upcoming-1', { registrationStatus: 'waitlist', athleteCap: 2 });
    assert.equal(upd.error, null);

    const res = await api.submitRegistration(GOOD);
    assert.equal(res.error, null);
    assert.equal(res.data.status, 'waitlist');
    const stored = (await api.listRegistrations('srv-meet-upcoming-1')).data.find((r) => r.id === res.data.id);
    assert.equal(stored.status, 'pending');
    assert.equal(stored.waitlisted, true);
    assert.equal((await api.getMeet('srv-meet-upcoming-1')).data.summary.pendingCount, 6);
  });

  test('bridges /shows fixtures: garden-state-winter-wreckage-2026 (waitlist) accepts onto the waitlist', async () => {
    const api = FA.createFixturePromoterApi();
    const regRes = await api.submitRegistration({
      slug: 'garden-state-winter-wreckage-2026',
      divisionId: 'gs-t2',
      athleteName: 'Skyler Waitlist (Fake)',
      email: 'skyler.waitlist@example.com',
      emergencyContact: 'Morgan Waitlist 856-555-0192',
      waiverAccepted: true,
      waiverVersion: 'testwaiver01',
    });
    assert.equal(regRes.error, null);
    assert.equal(regRes.data.status, 'waitlist');
  });

  test('unknown slug -> error, nothing stored', async () => {
    const api = FA.createFixturePromoterApi();
    const res = await api.submitRegistration({ ...GOOD, slug: 'no-such-meet' });
    assert.equal(res.data, null);
    assert.match(res.error, /No competition found/);
  });
});
