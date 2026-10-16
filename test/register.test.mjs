import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.env.ZT_ROOT || '..';
const FA = await import(`${ROOT}/lib/promoter/fixtureApi.ts`);

describe('register: pure validation helpers', () => {
  test('isRegistrationOpen allows open and waitlist only', () => {
    assert.equal(FA.isRegistrationOpen('open'), true);
    assert.equal(FA.isRegistrationOpen('waitlist'), true);
    assert.equal(FA.isRegistrationOpen('closed'), false);
    assert.equal(FA.isRegistrationOpen('day_of_only'), false);
    assert.equal(FA.isRegistrationOpen('not_applicable'), false);
    assert.equal(FA.isRegistrationOpen('not_provided'), false);
  });

  test('validateRegistrationInput checks required fields, email shape, division membership, and waiver acceptance', async () => {
    const api = FA.createFixturePromoterApi();
    const meetRes = await api.getMeet('srv-meet-upcoming-1');
    const detail = meetRes.data;

    const validBase = {
      slug: detail.summary.slug,
      divisionId: 'ifc-g2',
      athleteName: 'Riley Competitor (Fake)',
      email: 'riley.competitor@example.com',
      emergencyContact: 'Sam Competitor — 717-555-0144',
      waiverAccepted: true,
    };

    assert.equal(FA.validateRegistrationInput(validBase, detail), null);

    // Missing name
    assert.match(
      FA.validateRegistrationInput({ ...validBase, athleteName: ' ' }, detail),
      /athlete full name/
    );

    // Invalid email
    assert.match(
      FA.validateRegistrationInput({ ...validBase, email: 'not-an-email' }, detail),
      /valid email/
    );

    // Missing emergency contact
    assert.match(
      FA.validateRegistrationInput({ ...validBase, emergencyContact: '123' }, detail),
      /emergency contact/
    );

    // Division does not belong to meet
    assert.match(
      FA.validateRegistrationInput({ ...validBase, divisionId: 'nonexistent-div' }, detail),
      /valid division/
    );

    // Waiver not accepted
    assert.match(
      FA.validateRegistrationInput({ ...validBase, waiverAccepted: false }, detail),
      /accept the competition waiver/
    );
  });

  test('validateRegistrationInput rejects closed meets', async () => {
    const api = FA.createFixturePromoterApi();
    const closedMeet = (await api.getMeet('srv-meet-live-2')).data;

    const err = FA.validateRegistrationInput(
      {
        slug: closedMeet.summary.slug,
        divisionId: 'srs-d1',
        athleteName: 'Riley Competitor (Fake)',
        email: 'riley@example.com',
        emergencyContact: 'Sam — 717-555-0144',
        waiverAccepted: true,
      },
      closedMeet
    );
    assert.match(err, /currently closed/);
  });
});

describe('register: end-to-end submission into fixtureApi', () => {
  test('submitting a registration creates a pending RegistrationRequest visible on the promoter dashboard', async () => {
    const api = FA.createFixturePromoterApi();
    const beforeRegs = (await api.listRegistrations('srv-meet-upcoming-1')).data;

    const submitRes = await FA.submitFixtureRegistration(
      {
        slug: 'iron-furnace-classic-2026',
        divisionId: 'ifc-g2',
        athleteName: 'Quinn Newcomer (Fake)',
        email: 'Quinn.Newcomer@Example.com',
        emergencyContact: 'Pat Newcomer — 717-555-0188',
        waiverAccepted: true,
      },
      api
    );

    assert.equal(submitRes.error, null);
    assert.equal(submitRes.data.status, 'pending');
    assert.equal(submitRes.data.athleteName, 'Quinn Newcomer (Fake)');
    assert.equal(submitRes.data.email, 'quinn.newcomer@example.com');
    assert.equal(submitRes.data.paid, false);
    assert.ok(submitRes.data.waiverAcceptedAt);

    const afterRegs = (await api.listRegistrations('srv-meet-upcoming-1')).data;
    assert.equal(afterRegs.length, beforeRegs.length + 1);
    assert.equal(afterRegs[0].id, submitRes.data.id);
  });

  test('rejects duplicate active/pending registration for same email and division', async () => {
    const api = FA.createFixturePromoterApi();
    const payload = {
      slug: 'iron-furnace-classic-2026',
      divisionId: 'ifc-g3',
      athleteName: 'Avery Duplicate (Fake)',
      email: 'avery.dup@example.com',
      emergencyContact: 'Contact — 717-555-0100',
      waiverAccepted: true,
    };

    const first = await FA.submitFixtureRegistration(payload, api);
    assert.equal(first.error, null);

    const second = await FA.submitFixtureRegistration(payload, api);
    assert.equal(second.data, null);
    assert.match(second.error, /already exists/);
  });

  test('bridges public show fixtures from /shows so /register/garden-state-winter-wreckage-2026 (waitlist) works', async () => {
    const api = FA.createFixturePromoterApi();
    const showRes = await api.getMeetBySlug('garden-state-winter-wreckage-2026');
    assert.equal(showRes.error, null);
    assert.equal(showRes.data.summary.listing.registrationStatus, 'waitlist');

    const regRes = await FA.submitFixtureRegistration(
      {
        slug: 'garden-state-winter-wreckage-2026',
        divisionId: 'gs-t2',
        athleteName: 'Skyler Waitlist (Fake)',
        email: 'skyler.waitlist@example.com',
        emergencyContact: 'Morgan — 856-555-0192',
        waiverAccepted: true,
      },
      api
    );
    assert.equal(regRes.error, null);
    assert.equal(regRes.data.status, 'pending');
  });
});
