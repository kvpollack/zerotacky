import { test, describe, expect } from 'bun:test';

// 035 membership cards: pure helpers behind the Account section, the promoter Registrations column and the register nudge.
const M = await import('../lib/website/membershipCards.ts');

const TODAY = '2026-10-29';
const draft = (over = {}) => ({ federation: 'united_states_strongman', federationOther: '', memberNumber: '', expiresOn: '2027-03-01', ...over });

describe('cardStatus', () => {
  test('boundaries: yesterday expired, today expiring, 30 days expiring, 31 days valid', () => {
    expect(M.cardStatus('2026-10-28', TODAY)).toBe('expired');
    expect(M.cardStatus('2026-10-29', TODAY)).toBe('expiring');
    expect(M.cardStatus('2026-11-28', TODAY)).toBe('expiring');
    expect(M.cardStatus('2026-11-29', TODAY)).toBe('valid');
  });
  test('garbage dates never throw and read as valid', () => {
    expect(M.cardStatus('', TODAY)).toBe('valid');
    expect(M.cardStatus('2027-03-01', 'nope')).toBe('valid');
  });
  test('labels', () => {
    expect(M.cardStatusLabel('expired', '2026-01-01')).toBe('Expired 2026-01-01');
    expect(M.cardStatusLabel('expiring', '2026-11-01')).toBe('Expires 2026-11-01 (soon)');
    expect(M.cardStatusLabel('valid', '2027-03-01')).toBe('Expires 2027-03-01');
  });
});

describe('cardDraftProblem', () => {
  test('a complete draft passes', () => {
    expect(M.cardDraftProblem(draft(), TODAY)).toBeNull();
    expect(M.cardDraftProblem(draft({ federation: 'other', federationOther: 'Giants Live', memberNumber: 'GL-77' }), TODAY)).toBeNull();
  });
  test('other needs a name; names and numbers are capped', () => {
    expect(M.cardDraftProblem(draft({ federation: 'other' }), TODAY)).toBe('Name the federation.');
    expect(M.cardDraftProblem(draft({ federation: 'other', federationOther: '  ' }), TODAY)).toBe('Name the federation.');
    expect(M.cardDraftProblem(draft({ federation: 'other', federationOther: 'x'.repeat(M.FEDERATION_OTHER_MAX + 1) }), TODAY)).toMatch(/characters or fewer/);
    expect(M.cardDraftProblem(draft({ memberNumber: 'x'.repeat(M.MEMBER_NUMBER_MAX + 1) }), TODAY)).toMatch(/Member number/);
  });
  test('unknown federation is refused', () => {
    expect(M.cardDraftProblem(draft({ federation: 'ifsa' }), TODAY)).toBe('Pick a federation.');
  });
  test('expiry must be a real date, not in the past, not absurdly far out', () => {
    expect(M.cardDraftProblem(draft({ expiresOn: '' }), TODAY)).toMatch(/expiry date/);
    expect(M.cardDraftProblem(draft({ expiresOn: '2027-13-40' }), TODAY)).toMatch(/expiry date/);
    expect(M.cardDraftProblem(draft({ expiresOn: '2026-10-28' }), TODAY)).toMatch(/already expired/);
    expect(M.cardDraftProblem(draft({ expiresOn: TODAY }), TODAY)).toBeNull();
    expect(M.cardDraftProblem(draft({ expiresOn: '2036-12-31' }), TODAY)).toBeNull();
    expect(M.cardDraftProblem(draft({ expiresOn: '2037-01-01' }), TODAY)).toMatch(/too far out/);
  });
});

describe('cardFileProblem / cardExt', () => {
  test('images under 5 MB pass; others name the rule', () => {
    expect(M.cardFileProblem({ type: 'image/jpeg', size: 1000 })).toBeNull();
    expect(M.cardFileProblem({ type: 'image/PNG', size: 1000 })).toBeNull();
    expect(M.cardFileProblem({ type: 'image/webp', size: M.CARD_MAX_BYTES })).toBeNull();
    expect(M.cardFileProblem({ type: 'image/webp', size: M.CARD_MAX_BYTES + 1 })).toMatch(/5 MB/);
    expect(M.cardFileProblem({ type: 'application/pdf', size: 10 })).toMatch(/JPG, PNG, or WebP/);
    expect(M.cardFileProblem({ type: 'image/gif', size: 10 })).toMatch(/JPG, PNG, or WebP/);
  });
  test('object path lives in the owner folder with the right extension', () => {
    const p = M.cardObjectPath('11111111-2222-3333-4444-555555555555', 'image/png', 1700000000000);
    expect(p).toBe('11111111-2222-3333-4444-555555555555/card-1700000000000.png');
    expect(M.cardObjectPath('u', 'image/jpeg', 1)).toBe('u/card-1.jpg');
    expect(M.cardObjectPath('u', 'image/webp', 1)).toBe('u/card-1.webp');
  });
});

describe('federationLabel / rowToCard / draftToInsert', () => {
  test('named federations have a long and a short form; other uses the typed name', () => {
    expect(M.federationLabel({ federation: 'united_states_strongman', federationOther: null })).toBe('United States Strongman');
    expect(M.federationLabel({ federation: 'united_states_strongman', federationOther: null }, 'short')).toBe('USS');
    expect(M.federationLabel({ federation: 'strongman_corporation', federationOther: null }, 'short')).toBe('Strongman Corp');
    expect(M.federationLabel({ federation: 'other', federationOther: ' Giants Live ' })).toBe('Giants Live');
    expect(M.federationLabel({ federation: 'other', federationOther: null })).toBe('Other federation');
  });
  test('rowToCard normalizes nulls, dates and unknown federations', () => {
    const c = M.rowToCard({ id: 'c1', user_id: 'u1', federation: 'ifsa', federation_other: null, member_number: null, expires_on: '2027-03-01T00:00:00', image_path: 'u1/card-1.jpg' });
    expect(c).toEqual({ id: 'c1', userId: 'u1', federation: 'other', federationOther: null, memberNumber: null, expiresOn: '2027-03-01', imagePath: 'u1/card-1.jpg', createdAt: '' });
  });
  test('draftToInsert trims and nulls optional fields; federation_other only for other', () => {
    expect(M.draftToInsert('u1', draft({ memberNumber: ' 123 ', federationOther: 'ignored' }), 'u1/card-1.png')).toEqual({
      user_id: 'u1', federation: 'united_states_strongman', federation_other: null, member_number: '123', expires_on: '2027-03-01', image_path: 'u1/card-1.png',
    });
    expect(M.draftToInsert('u1', draft({ federation: 'other', federationOther: ' Giants Live ' }), 'p').federation_other).toBe('Giants Live');
    expect(M.draftToInsert('u1', draft({ memberNumber: '   ' }), 'p').member_number).toBeNull();
  });
});

describe('groupRegistrationCards', () => {
  test('groups by registration id, keeps order, tolerates a missing user_id', () => {
    const rows = [
      { registration_id: 'r1', id: 'c1', user_id: 'u1', federation: 'united_states_strongman', federation_other: null, member_number: '1', expires_on: '2027-01-01', image_path: 'u1/a.jpg' },
      { registration_id: 'r2', id: 'c2', federation: 'other', federation_other: 'Giants Live', member_number: null, expires_on: '2027-01-01', image_path: 'u2/a.jpg' },
      { registration_id: 'r1', id: 'c3', user_id: 'u1', federation: 'strongman_corporation', federation_other: null, member_number: null, expires_on: '2026-01-01', image_path: 'u1/b.jpg' },
    ];
    const g = M.groupRegistrationCards(rows);
    expect(Object.keys(g).sort()).toEqual(['r1', 'r2']);
    expect(g.r1.map((c) => c.id)).toEqual(['c1', 'c3']);
    expect(g.r2[0].userId).toBe('');
    expect(g.r3).toBeUndefined();
    expect(M.groupRegistrationCards([])).toEqual({});
  });
});

describe('showWantsMembershipCard', () => {
  test('named federations nudge; empty and unsanctioned do not', () => {
    expect(M.showWantsMembershipCard('United States Strongman')).toBe(true);
    expect(M.showWantsMembershipCard('Strongman Corporation')).toBe(true);
    expect(M.showWantsMembershipCard('')).toBe(false);
    expect(M.showWantsMembershipCard('   ')).toBe(false);
    expect(M.showWantsMembershipCard(undefined)).toBe(false);
    expect(M.showWantsMembershipCard(null)).toBe(false);
    expect(M.showWantsMembershipCard('Unsanctioned')).toBe(false);
    expect(M.showWantsMembershipCard('Unsanctioned / Inclusive Format')).toBe(false);
  });
});
