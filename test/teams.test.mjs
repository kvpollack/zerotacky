import { test, describe, expect } from 'bun:test';

// 055 teams: the client-side half. The rules (join codes, capacity, shared roster row, partner board) live in
// supabase/055_teams.sql and were exercised against staging; here we pin the mapping, the state normaliser, the public
// projection, the RPC wrappers and the share link.
const ROOT = process.env.ZT_ROOT || '..';
const M = await import(`${ROOT}/lib/sync/mapping.ts`);
const MB = await import(`${ROOT}/lib/meetBuilder.ts`);
const R = await import(`${ROOT}/lib/promoter/rules.ts`);
const SA = await import(`${ROOT}/lib/promoter/supabaseApi.ts`);
const FA = await import(`${ROOT}/lib/promoter/fixtureApi.ts`);
const TP = await import(`${ROOT}/components/register/TeamPanel.tsx`);

const div = (extra = {}) => ({ id: 'd1', meetId: 'm1', name: 'Tag Team Open', flight: 'A', sortOrder: 0, ...extra });

describe('teams (055): division team_size mapping', () => {
  test('divisionToRow sends team_size only when set; rowToDivision keeps 2..6 and drops 1', () => {
    expect(M.divisionToRow(div(), 'm1').team_size).toBeUndefined();
    expect(M.divisionToRow(div({ teamSize: 2 }), 'm1').team_size).toBe(2);
    expect(M.divisionToRow(div({ teamSize: 1 }), 'm1').team_size).toBe(1);   // explicit shrink back to individual reaches the server
    const base = { id: 'd1', meet_id: 'm1', name: 'Tag Team Open', flight: 'A', sort_order: 0 };
    expect(M.rowToDivision({ ...base, team_size: 3 }).teamSize).toBe(3);
    expect(M.rowToDivision({ ...base, team_size: 1 }).teamSize).toBeUndefined();
    expect(M.rowToDivision(base).teamSize).toBeUndefined();
  });

  test('normalizeState keeps teamSize 2..6 and drops anything else', () => {
    const blank = MB.createBlankMeet('Teams Test');
    const state = { ...blank, divisions: [div({ teamSize: 2 }), div({ id: 'd2', teamSize: 1 }), div({ id: 'd3', teamSize: 9 }), div({ id: 'd4', teamSize: 2.5 })] };
    const out = MB.normalizeState(state);
    const by = Object.fromEntries(out.divisions.map((d) => [d.id, d.teamSize]));
    expect(by.d1).toBe(2);
    expect(by.d2).toBeUndefined();
    expect(by.d3).toBeUndefined();
    expect(by.d4).toBeUndefined();
  });

  test('updateDivision accepts a teamSize patch', () => {
    const blank = MB.createBlankMeet('Teams Test');
    const withDiv = { ...blank, divisions: [div()] };
    const up = MB.updateDivision(withDiv, 'd1', { teamSize: 4 });
    expect(up.divisions[0].teamSize).toBe(4);
    const back = MB.updateDivision(up, 'd1', { teamSize: 1 });
    expect(back.divisions[0].teamSize).toBe(1);
  });
});

describe('teams (055): public projection and registration rows', () => {
  test('toPublicRegistrationMeet carries teamSize for team divisions only', () => {
    const blank = MB.createBlankMeet('Teams Test');
    const detail = {
      summary: { serverId: 'm1', slug: 'teams-test', listing: { registrationStatus: 'open', competitionStatus: 'upcoming', athleteCap: null } },
      state: { ...blank, divisions: [div({ teamSize: 2 }), div({ id: 'd2', name: 'Open Men' })] },
    };
    const pub = R.toPublicRegistrationMeet(detail, 'Promoter');
    const d1 = pub.divisions.find((d) => d.id === 'd1');
    const d2 = pub.divisions.find((d) => d.id === 'd2');
    expect(d1.teamSize).toBe(2);
    expect(d2.teamSize).toBeUndefined();
  });

  test('registration rows map team_id / team_name / looking_for_partner; the seven wrappers use the SQL parameter names', async () => {
    const calls = [];
    const row = {
      id: 'r1', meet_id: 'm1', division_id: 'd1', athlete_name: 'Pat Mills', email: 'pat@example.com', emergency_contact: 'x',
      date_of_birth: '1990-01-01', guardian: null, status: 'pending', waitlisted: false, athlete_id: null, waiver_accepted_at: null,
      waiver_version: 'v1', created_at: '2026-11-10T00:00:00Z', updated_at: '2026-11-10T00:00:00Z',
      team_id: 't1', team_name: 'Mills & Co', looking_for_partner: true,
    };
    const fakeDb = {
      async getUser() { return { id: 'u1', email: 'pat@example.com' }; },
      async selectRegistrations() { return [row, { ...row, id: 'r2', team_id: null, team_name: null, looking_for_partner: false }]; },
      async rpc(fn, params) { calls.push({ fn, params }); if (fn === 'zt_my_registration') return null; return { ok: true }; },
    };
    const api = SA.createSupabasePromoterApi(fakeDb);
    const list = await api.listRegistrations('m1');
    expect(list.error).toBeNull();
    const r1 = list.data.find((r) => r.id === 'r1');
    const r2 = list.data.find((r) => r.id === 'r2');
    expect(r1.teamId).toBe('t1');
    expect(r1.teamName).toBe('Mills & Co');
    expect(r1.lookingForPartner).toBe(true);
    expect(r2.teamId).toBeNull();
    expect(r2.teamName).toBeNull();
    expect(r2.lookingForPartner).toBe(false);

    // the seven wrappers hit the 055 RPCs with the SQL parameter names
    await api.getMyRegistration('teams-test');
    await api.teamCreate('r1', 'Mills & Co');
    await api.teamJoin('r1', 'K7PQ2M');
    await api.teamLeave('r1');
    await api.teamRename('t1', 'New Name');
    await api.setPartnerFlag('r1', true);
    await api.teamUp('r1', 'r2');
    const names = calls.map((c) => c.fn);
    for (const fn of ['zt_my_registration', 'zt_team_create', 'zt_team_join', 'zt_team_leave', 'zt_team_rename', 'zt_set_partner_flag', 'zt_team_up']) expect(names).toContain(fn);
    expect(calls.find((c) => c.fn === 'zt_team_join').params).toEqual({ p_registration_id: 'r1', p_code: 'K7PQ2M' });
    expect(calls.find((c) => c.fn === 'zt_team_up').params).toEqual({ p_registration_id: 'r1', p_other_registration_id: 'r2' });
    expect(calls.find((c) => c.fn === 'zt_team_rename').params).toEqual({ p_team_id: 't1', p_name: 'New Name' });
    expect(calls.find((c) => c.fn === 'zt_set_partner_flag').params).toEqual({ p_registration_id: 'r1', p_flag: true });
  });

  test('getMyRegistration is null (not an error) when signed out', async () => {
    const api = SA.createSupabasePromoterApi({ async getUser() { return null; }, async rpc() { throw new Error('should not be called'); } });
    expect(await api.getMyRegistration('x')).toEqual({ data: null, error: null });
  });

  test('the preview backend has no teams: getMyRegistration is null and the actions refuse with one message', async () => {
    const api = FA.getFixturePromoterApi();
    expect((await api.getMyRegistration('riverside-iron-fest-2026')).data).toBeNull();
    const res = await api.teamCreate('r1', 'x');
    expect(res.data).toBeNull();
    expect(res.error).toMatch(/preview/i);
  });
});

describe('teams (055): share link', () => {
  test('teamShareUrl builds /register/<slug>?team=<code> on the given origin', () => {
    expect(TP.teamShareUrl('iron-harbor-classic-2026', 'K7PQ2M', 'https://zerotacky.com')).toBe('https://zerotacky.com/register/iron-harbor-classic-2026?team=K7PQ2M');
  });
});
