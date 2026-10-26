import { test, describe, expect } from 'bun:test';

const ROOT = process.env.ZT_ROOT || '..';
const SA = await import(`${ROOT}/lib/promoter/supabaseApi.ts`);
const FX = await import(`${ROOT}/lib/promoter/fixtures.ts`);
const FA = await import(`${ROOT}/lib/promoter/fixtureApi.ts`);
const M = await import(`${ROOT}/lib/sync/mapping.ts`);
const MB = await import(`${ROOT}/lib/meetBuilder.ts`);
const UP = await import(`${ROOT}/lib/promoter/usePromoterApi.ts`);

// In-memory implementation of `PromoterDb` seeded from the same fixtures the promoter tests use,
// simulating the database tables and RPCs defined in `supabase/005_listing.sql`.
function createFakePromoterDb(opts = {}) {
  let signedOut = Boolean(opts.signedOut);
  let throwMessage = null;
  let seq = 200;

  let user = {
    id: FX.DEMO_PROMOTER_USER.id,
    email: FX.DEMO_PROMOTER_USER.email,
  };
  let profile = {
    id: FX.DEMO_PROMOTER_USER.id,
    email: FX.DEMO_PROMOTER_USER.email,
    display_name: FX.DEMO_PROMOTER_USER.displayName,
    is_athlete: FX.DEMO_PROMOTER_USER.roles.athlete,
    is_promoter: FX.DEMO_PROMOTER_USER.roles.promoter,
    is_gym_owner: FX.DEMO_PROMOTER_USER.roles.gymOwner,
    created_at: '2026-10-16T00:00:00.000Z',
    updated_at: '2026-10-16T00:00:00.000Z',
  };

  const meets = [];
  const divisions = [];
  const events = [];
  const athletes = [];
  const results = [];
  const registrations = [];
  // 023: athlete_accounts + the profiles a username can resolve to
  const athleteAccounts = [];
  const knownProfiles = [{ id: 'u-kurt', username: 'kurtpollack', display_name: 'Kurt Pollack' }, { id: 'u-grace', username: 'grace_g', display_name: 'Grace Gullo' }];

  for (const seed of FX.createSeedMeets()) {
    const rows = M.stateToRows(seed.state, {
      meetId: seed.summary.serverId,
      slug: seed.summary.slug,
      stations: seed.state.meet.stations,
      isDemo: false,
    });
    const l = seed.summary.listing;
    meets.push({
      ...rows.meet,
      owner_id: user.id,
      join_code: seed.summary.joinCode,
      competition_status: l.competitionStatus,
      registration_status: l.registrationStatus,
      results_status: l.resultsStatus,
      is_public_listed: l.isPublicListed,
      venue: l.venue ? JSON.parse(JSON.stringify(l.venue)) : null,
      federation: l.federation,
      entry_fee_display: l.entryFeeDisplay,
      registration_deadline: l.registrationDeadline,
      athlete_cap: l.athleteCap,
      promoter_contact: l.promoterContact,
      created_at: seed.summary.updatedAt,
      updated_at: seed.summary.updatedAt,
    });
    divisions.push(...rows.divisions);
    events.push(...rows.events);
    athletes.push(...rows.athletes);
    results.push(...rows.results);
  }

  for (const reg of FX.createSeedRegistrations()) {
    registrations.push({
      id: reg.id,
      meet_id: reg.meetServerId,
      user_id: null,
      athlete_id: reg.athleteId,
      division_id: reg.divisionId,
      name: reg.athleteName,
      email: reg.email,
      bodyweight: null,
      emergency_contact: reg.emergencyContact,
      status: reg.status,
      waitlisted: reg.waitlisted,
      paid: reg.paid,
      waiver_accepted_at: reg.waiverAcceptedAt,
      created_at: reg.createdAt,
      updated_at: reg.createdAt,
    });
  }

  const rpcCalls = [];

  function checkThrow() {
    if (throwMessage) throw new Error(throwMessage);
  }

  function toPromoterMeetRow(m) {
    const divCount = divisions.filter((d) => d.meet_id === m.id).length;
    const athCount = athletes.filter((a) => a.meet_id === m.id).length;
    const pendCount = registrations.filter(
      (r) => r.meet_id === m.id && (r.status === 'pending' || r.status === 'waitlist')
    ).length;
    const regCount = registrations.filter(
      (r) => r.meet_id === m.id && r.status === 'accepted'
    ).length;
    return {
      ...JSON.parse(JSON.stringify(m)),
      division_count: divCount,
      athlete_count: athCount,
      pending_count: pendCount,
      registration_count: regCount,
    };
  }

  return {
    rpcCalls,
    setSignedOut(v) {
      signedOut = Boolean(v);
    },
    setThrowError(msg) {
      throwMessage = msg;
    },

    async getUser() {
      checkThrow();
      if (signedOut) return null;
      return { ...user };
    },

    async selectProfile(userId) {
      checkThrow();
      if (userId !== profile.id) return null;
      return { ...profile };
    },

    async updateProfile(userId, patch) {
      checkThrow();
      if (userId !== profile.id) throw new Error('Profile not found');
      profile = { ...profile, ...patch, updated_at: new Date().toISOString() };
      return { ...profile };
    },

    async selectMyMeets() {
      checkThrow();
      return meets.map(toPromoterMeetRow);
    },

    async selectMeet(meetId) {
      checkThrow();
      const found = meets.find((m) => m.id === meetId);
      return found ? toPromoterMeetRow(found) : null;
    },

    async selectChildren(meetId) {
      checkThrow();
      return {
        divisions: divisions
          .filter((d) => d.meet_id === meetId)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((d) => ({ ...d })),
        events: events
          .filter((e) => e.meet_id === meetId)
          .sort((a, b) => a.event_number - b.event_number)
          .map((e) => JSON.parse(JSON.stringify(e))),
        athletes: athletes
          .filter((a) => a.meet_id === meetId)
          .map((a) => JSON.parse(JSON.stringify(a))),
        results: results
          .filter((r) => r.meet_id === meetId)
          .map((r) => JSON.parse(JSON.stringify(r))),
      };
    },

    async updateMeetListing(meetId, patch, expectedUpdatedAt = null) {
      checkThrow();
      rpcCalls.push({ fn: 'zt_update_listing', params: { p_meet_id: meetId, p_patch: patch, p_expected_updated_at: expectedUpdatedAt } });
      const idx = meets.findIndex((m) => m.id === meetId);
      if (idx < 0) throw new Error(`No meet found with serverId "${meetId}".`);
      if (expectedUpdatedAt && meets[idx].updated_at !== expectedUpdatedAt) {
        throw new Error(`This meet changed since you opened it (saved ${meets[idx].updated_at}). Reload to see the latest version, then redo your edits.`);
      }
      meets[idx] = {
        ...meets[idx],
        ...JSON.parse(JSON.stringify(patch)),
        updated_at: new Date().toISOString(),
      };
    },

    async selectRegistrations(meetId) {
      checkThrow();
      if (!meets.some((m) => m.id === meetId)) {
        throw new Error(`No meet found with serverId "${meetId}".`);
      }
      return registrations
        .filter((r) => r.meet_id === meetId)
        .map((r) => ({ ...r }));
    },

    async selectPublicMeetBySlug(slug) {
      checkThrow();
      const clean = String(slug ?? '').trim().toLowerCase();
      const m = meets.find((x) => x.slug.toLowerCase() === clean && !x.is_demo);
      if (!m) return null;
      const { join_code: _j, admin_pin: _a, owner_id: _o, ...publicMeet } = m;
      return {
        meet: JSON.parse(JSON.stringify(publicMeet)),
        promoter_display_name: profile.display_name,
        divisions: divisions
          .filter((d) => d.meet_id === m.id)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((d) => ({ ...d })),
        events: events
          .filter((e) => e.meet_id === m.id)
          .sort((a, b) => a.event_number - b.event_number)
          .map((e) => JSON.parse(JSON.stringify(e))),
        accepted_count: athletes.filter((a) => a.meet_id === m.id).length,
      };
    },

    async rpc(fn, params) {
      checkThrow();
      rpcCalls.push({ fn, params: JSON.parse(JSON.stringify(params)) });

      if (fn === 'zt_create_meet') {
        const slug = params.p_slug;
        if (meets.some((m) => m.slug.toLowerCase() === slug.toLowerCase())) {
          throw new Error(`A meet with the URL slug "${slug}" already exists. Choose a different slug.`);
        }
        const id = `srv-meet-${++seq}`;
        const nowIso = new Date().toISOString();
        const newMeet = {
          id,
          slug,
          name: params.p_name,
          date: params.p_date,
          owner_id: user.id,
          join_code: `JC${seq}`,
          admin_pin: '1050',
          run_order_method: 'reverse_overall',
          tiebreaker_rule: 'event_wins',
          available_plates: [100, 55, 45, 35, 25, 15, 10, 5, 2.5],
          collar_weight_per_pair: 0,
          stations: [
            { id: 'A', label: 'Station 1' },
            { id: 'B', label: 'Station 2' },
          ],
          is_demo: false,
          competition_status: 'upcoming',
          registration_status: 'not_provided',
          results_status: 'not_started',
          is_public_listed: false,
          venue: null,
          federation: null,
          entry_fee_display: null,
          registration_deadline: null,
          athlete_cap: null,
          promoter_contact: null,
          created_at: nowIso,
          updated_at: nowIso,
        };
        meets.unshift(newMeet);
        return toPromoterMeetRow(newMeet);
      }

      if (fn === 'zt_save_meet_config') {
        const meetId = params.p_meet_id;
        const idx = meets.findIndex((m) => m.id === meetId);
        if (idx < 0) throw new Error(`No meet found with serverId "${meetId}".`);

        const nextSlug = params.p_meet.slug;
        if (meets.some((m) => m.id !== meetId && m.slug.toLowerCase() === nextSlug.toLowerCase())) {
          throw new Error(`Another meet already uses the slug "${nextSlug}". Pick a unique slug.`);
        }

        // C3: optimistic concurrency, mirrors zt_save_meet_config
        if (params.p_expected_updated_at && new Date(meets[idx].updated_at).getTime() !== new Date(params.p_expected_updated_at).getTime()) {
          throw new Error(`This meet changed since you opened it (saved ${meets[idx].updated_at}). Reload to see the latest version, then redo your edits.`);
        }
        // Server-side H3 check
        const nextAthIds = new Set((params.p_athletes ?? []).map((a) => a.id));
        // M9: accepted registration's athlete leaves only through the registration
        const linked = registrations.find((r) => r.meet_id === meetId && r.status === 'accepted' && r.athlete_id && !nextAthIds.has(r.athlete_id));
        if (linked) {
          throw new Error(`${linked.name} is on the roster through an accepted registration. Decline or withdraw that registration instead of deleting the athlete.`);
        }
        const nextEvIds = new Set((params.p_events ?? []).map((e) => e.id));
        for (const r of results.filter((x) => x.meet_id === meetId)) {
          if (!nextAthIds.has(r.athlete_id)) {
            const athName = athletes.find((a) => a.meet_id === meetId && a.id === r.athlete_id)?.name ?? r.athlete_id;
            const evName = events.find((e) => e.meet_id === meetId && e.id === r.event_id)?.name ?? r.event_id;
            throw new Error(
              `${athName} has a recorded result in "${evName}" and cannot be removed from the roster. Mark the athlete withdrawn on meet day instead.`
            );
          }
          if (!nextEvIds.has(r.event_id)) {
            const evName = events.find((e) => e.meet_id === meetId && e.id === r.event_id)?.name ?? r.event_id;
            throw new Error(`Event "${evName}" has recorded results and cannot be removed.`);
          }
        }

        meets[idx] = {
          ...meets[idx],
          ...params.p_meet,
          id: meetId,
          updated_at: new Date().toISOString(),
        };

        for (let i = divisions.length - 1; i >= 0; i--) {
          if (divisions[i].meet_id === meetId) divisions.splice(i, 1);
        }
        divisions.push(...(params.p_divisions ?? []).map((d) => ({ ...d, meet_id: meetId })));

        for (let i = events.length - 1; i >= 0; i--) {
          if (events[i].meet_id === meetId) events.splice(i, 1);
        }
        events.push(...(params.p_events ?? []).map((e) => ({ ...e, meet_id: meetId })));

        for (let i = athletes.length - 1; i >= 0; i--) {
          if (athletes[i].meet_id === meetId) athletes.splice(i, 1);
        }
        athletes.push(...(params.p_athletes ?? []).map((a) => ({ ...a, meet_id: meetId })));

        return { id: meetId };
      }

      if (fn === 'zt_rotate_join_code') {
        const idx = meets.findIndex((m) => m.id === params.p_meet_id);
        if (idx < 0) throw new Error(`No meet found with serverId "${params.p_meet_id}".`);
        const nextCode = `ROT${++seq}`;
        meets[idx].join_code = nextCode;
        return { joinCode: nextCode };
      }

      if (fn === 'zt_delete_meet') {
        // mirrors supabase/010_meet_lifecycle.sql: owner only, not live/completed, name typed when data exists, cascades
        const idx = meets.findIndex((m) => m.id === params.p_meet_id);
        if (idx < 0) throw new Error('meet not found');
        const m = meets[idx];
        if (m.owner_id !== user.id) throw new Error('only the promoter who owns this meet can delete it');
        if (m.competition_status === 'live' || m.competition_status === 'completed') {
          throw new Error(`a ${m.competition_status} meet cannot be deleted. Set it to cancelled on the Listing tab first, or leave it as a record.`);
        }
        const counts = {
          divisions: divisions.filter((d) => d.meet_id === m.id).length,
          events: events.filter((e) => e.meet_id === m.id).length,
          athletes: athletes.filter((a) => a.meet_id === m.id).length,
          results: results.filter((r) => r.meet_id === m.id).length,
          registrations: registrations.filter((r) => r.meet_id === m.id).length,
        };
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        const typed = (params.p_confirm_name ?? '').trim().toLowerCase();
        if (total > 0 && typed !== m.name.trim().toLowerCase()) {
          throw new Error('this meet has data associated with it. Type the meet name exactly to confirm deletion.');
        }
        meets.splice(idx, 1);
        for (const arr of [divisions, events, athletes, results, registrations]) {
          for (let i = arr.length - 1; i >= 0; i--) if (arr[i].meet_id === m.id) arr.splice(i, 1);
        }
        return { id: m.id, name: m.name, deleted: counts };
      }

      if (fn === 'zt_meet_athlete_accounts') {
        if (!meets.some((m) => m.id === params.p_meet_id)) throw new Error('You do not have permission to view this meet.');
        return athleteAccounts.filter((l) => l.meet_id === params.p_meet_id).map((l) => {
          const prof = knownProfiles.find((pr) => pr.id === l.user_id);
          return { athleteId: l.athlete_id, username: prof.username, displayName: prof.display_name, fromRegistration: l.linked_by === null };
        });
      }

      if (fn === 'zt_link_athlete_account') {
        if (!meets.some((m) => m.id === params.p_meet_id)) throw new Error('You do not have permission to edit this meet.');
        const ath = athletes.find((a) => a.meet_id === params.p_meet_id && a.id === params.p_athlete_id);
        if (!ath) throw new Error('That athlete is not on this roster. Save the roster first.');
        const uname = String(params.p_username ?? '').trim().replace(/^@/, '').toLowerCase();
        const idx = athleteAccounts.findIndex((l) => l.meet_id === params.p_meet_id && l.athlete_id === params.p_athlete_id);
        if (!uname) {
          if (idx >= 0) athleteAccounts.splice(idx, 1);
          return { athleteId: params.p_athlete_id, username: null, displayName: null };
        }
        const prof = knownProfiles.find((pr) => pr.username === uname);
        if (!prof) throw new Error(`No ZeroTacky account has the username "${uname}".`);
        const other = athleteAccounts.find((l) => l.meet_id === params.p_meet_id && l.user_id === prof.id && l.athlete_id !== params.p_athlete_id);
        if (other) {
          const otherName = athletes.find((a) => a.meet_id === params.p_meet_id && a.id === other.athlete_id)?.name ?? other.athlete_id;
          throw new Error(`@${uname} is already linked to ${otherName} on this meet. Unlink that row first.`);
        }
        const link = { meet_id: params.p_meet_id, athlete_id: params.p_athlete_id, user_id: prof.id, linked_by: user.id };
        if (idx >= 0) athleteAccounts[idx] = link; else athleteAccounts.push(link);
        return { athleteId: params.p_athlete_id, username: prof.username, displayName: prof.display_name };
      }

      if (fn === 'zt_set_registration_status') {
        const reg = registrations.find((r) => r.id === params.p_id);
        if (!reg) throw new Error(`No registration found with id "${params.p_id}".`);
        const meet = meets.find((m) => m.id === reg.meet_id);
        if (!meet) throw new Error('Associated meet no longer exists.');
        const nextStatus = params.p_status;

        if (nextStatus === 'accepted') {
          const divExists = divisions.some((d) => d.meet_id === reg.meet_id && d.id === reg.division_id);
          if (!divExists) {
            throw new Error(
              `${reg.name} registered for a division that no longer exists on ${meet.name}. Decline the request or restore the division before accepting.`
            );
          }
          const athId = reg.athlete_id ?? `reg-ath-${String(reg.id).slice(0, 8)}`;
          if (!athletes.some((a) => a.meet_id === reg.meet_id && a.id === athId)) {
            const divAths = athletes.filter((a) => a.meet_id === reg.meet_id && a.division_id === reg.division_id);
            const maxLot = divAths.reduce((m, a) => Math.max(m, a.lot_number || 0), 0);
            athletes.push({
              id: athId,
              meet_id: reg.meet_id,
              division_id: reg.division_id,
              name: reg.name,
              bodyweight: reg.bodyweight,
              lot_number: maxLot + 1,
              status: 'active',
              rack_heights: {},
            });
          }
          reg.athlete_id = athId;
          reg.status = 'accepted';
        } else {
          if (reg.athlete_id) {
            const scored = results.filter((r) => r.meet_id === reg.meet_id && r.athlete_id === reg.athlete_id);
            if (scored.length > 0) {
              const evNames = scored
                .map((r) => events.find((e) => e.meet_id === reg.meet_id && e.id === r.event_id)?.name ?? r.event_id)
                .join(', ');
              const verb = nextStatus === 'declined' ? 'declined' : nextStatus === 'withdrawn' ? 'withdrawn' : 'reopened';
              throw new Error(
                `${reg.name} has recorded results (${evNames}), so the request cannot be ${verb}. Results are read-only here; mark the athlete withdrawn on meet day instead.`
              );
            }
            const athIdx = athletes.findIndex((a) => a.meet_id === reg.meet_id && a.id === reg.athlete_id);
            if (athIdx >= 0) athletes.splice(athIdx, 1);
            reg.athlete_id = null;
          }
          reg.status = nextStatus;
        }
        reg.updated_at = new Date().toISOString();
        return { ...reg };
      }

      if (fn === 'zt_submit_registration') {
        const cleanSlug = String(params.p_slug ?? '').toLowerCase();
        const meet = meets.find((m) => m.slug.toLowerCase() === cleanSlug);
        if (!meet) throw new Error(`No competition found at "${params.p_slug}".`);
        const inp = params.p_input;
        const dup = registrations.find(
          (r) =>
            r.meet_id === meet.id &&
            r.division_id === inp.divisionId &&
            r.email.toLowerCase() === inp.email.toLowerCase() &&
            r.status !== 'withdrawn' &&
            r.status !== 'declined'
        );
        if (dup) {
          throw new Error('An active or pending registration already exists for this email in the selected division.');
        }
        // mirrors zt_submit_registration (005): a submission without the waiver version is refused (C6)
        if (!String(inp.waiverVersion ?? '').trim()) throw new Error('The waiver version is missing. Reload the page and try again.');
        // mirrors 009: dateOfBirth required (YYYY-MM-DD), age judged on the meet date; under 12 refused; a minor needs
        // a guardian; an adult's guardian is dropped
        const dob = String(inp.dateOfBirth ?? '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) throw new Error('Enter the athlete date of birth.');
        const ref = meet.date || new Date().toISOString().slice(0, 10);
        let ageYears = Number(ref.slice(0, 4)) - Number(dob.slice(0, 4));
        if (ref.slice(5) < dob.slice(5)) ageYears -= 1;
        if (ageYears < 12) throw new Error('Athletes must be at least 12 on competition day. Contact the promoter about younger athletes.');
        const isMinor = ageYears < 18;
        if (isMinor && !(inp.guardian && String(inp.guardian.name ?? '').trim().length >= 2)) {
          throw new Error('An athlete under 18 must be registered by a parent or legal guardian. Enter the guardian full name.');
        }
        const waitlisted = meet.registration_status === 'waitlist';
        const id = `reg-${++seq}`;
        const nowIso = new Date().toISOString();
        registrations.unshift({
          id,
          meet_id: meet.id,
          user_id: signedOut ? null : user.id,
          athlete_id: null,
          division_id: inp.divisionId,
          name: inp.athleteName,
          email: inp.email,
          bodyweight: null,
          emergency_contact: inp.emergencyContact,
          status: 'pending',
          waitlisted,
          paid: false,
          waiver_accepted_at: nowIso,
          waiver_version: inp.waiverVersion,
          date_of_birth: dob,
          guardian_name: isMinor ? inp.guardian.name : null,
          guardian_contact: isMinor ? inp.guardian.contact : null,
          created_at: nowIso,
          updated_at: nowIso,
        });
        return { id, status: waitlisted ? 'waitlist' : 'pending' };
      }

      throw new Error(`Unsupported RPC: ${fn}`);
    },
  };
}

describe('supabaseApi: list/detail mapping & the three counts', () => {
  test('listMyMeets and getMeet map rows and split athleteCount, pendingCount, and registrationCount', async () => {
    const fakeDb = createFakePromoterDb();
    const api = SA.createSupabasePromoterApi(fakeDb, { today: () => '2026-11-01' });

    const listRes = await api.listMyMeets();
    expect(listRes.error).toBeNull();
    expect(listRes.data.length).toBe(3);

    const [upcoming, live, completed] = listRes.data;
    expect(upcoming.serverId).toBe('srv-meet-upcoming-1');
    expect(upcoming.divisionCount).toBe(3);
    expect(upcoming.athleteCount).toBe(2);
    expect(upcoming.pendingCount).toBe(5);
    expect(upcoming.registrationCount).toBe(2);
    expect(upcoming.joinCode).toBe('FRNC26');

    expect(live.athleteCount).toBe(4);
    expect(live.pendingCount).toBe(0);
    expect(live.registrationCount).toBe(1);

    expect(completed.athleteCount).toBe(3);
    expect(completed.pendingCount).toBe(0);
    expect(completed.registrationCount).toBe(0);

    const detailRes = await api.getMeet('srv-meet-upcoming-1');
    expect(detailRes.error).toBeNull();
    expect(detailRes.data.state.divisions.length).toBe(3);
    expect(detailRes.data.state.events.length).toBe(4);
    expect(detailRes.data.state.athletes.length).toBe(2);
  });
});

describe('supabaseApi: saveMeetState RPC pass-through & H3 orphan guard', () => {
  test('saveMeetState calls zt_save_meet_config, preserves results, and surfaces H3 errors when removing a scored athlete or event', async () => {
    const fakeDb = createFakePromoterDb();
    const api = SA.createSupabasePromoterApi(fakeDb);

    const live = (await api.getMeet('srv-meet-live-2')).data;
    const originalResults = JSON.parse(JSON.stringify(live.state.results));
    expect(originalResults.length).toBe(3);

    // Add a division and save
    const withNewDiv = MB.addDivision(live.state, { id: 'srs-d3', name: 'Novice', flight: 'A' });
    const saved = await api.saveMeetState('srv-meet-live-2', { ...withNewDiv, results: [] });
    expect(saved.error).toBeNull();
    expect(saved.data.summary.divisionCount).toBe(3);
    expect(saved.data.state.results).toEqual(originalResults);
    expect(fakeDb.rpcCalls.some((c) => c.fn === 'zt_save_meet_config')).toBe(true);

    // Removing scored athlete srs-a1 is refused
    const withoutScoredAthlete = {
      ...saved.data.state,
      athletes: saved.data.state.athletes.filter((a) => a.id !== 'srs-a1'),
    };
    const badAth = await api.saveMeetState('srv-meet-live-2', withoutScoredAthlete);
    expect(badAth.data).toBeNull();
    expect(badAth.error).toMatch(/Casey Placeholder \(Fake\)/);
    expect(badAth.error).toMatch(/12" Log Clean & Press/);

    // Removing scored event srs-ev-1 is refused
    const withoutScoredEvent = {
      ...saved.data.state,
      events: saved.data.state.events.filter((e) => e.id !== 'srs-ev-1'),
    };
    const badEv = await api.saveMeetState('srv-meet-live-2', withoutScoredEvent);
    expect(badEv.data).toBeNull();
    expect(badEv.error).toMatch(/Event "12" Log Clean & Press" has recorded results/);
  });

  test('C3: a save naming a stale revision is refused; the current revision saves; M9: a registration-linked athlete cannot be removed by a roster save', async () => {
    const fakeDb = createFakePromoterDb();
    const api = SA.createSupabasePromoterApi(fakeDb);
    const first = await api.getMeet('srv-meet-upcoming-1');
    const rev1 = first.data.summary.updatedAt;

    // someone else saves (same content, new revision)
    const other = await api.saveMeetState('srv-meet-upcoming-1', first.data.state, { expectedUpdatedAt: rev1 });
    expect(other.error).toBeNull();
    const rev2 = other.data.summary.updatedAt;
    expect(rev2).not.toBe(rev1);

    const stale = await api.saveMeetState('srv-meet-upcoming-1', first.data.state, { expectedUpdatedAt: rev1 });
    expect(stale.data).toBeNull();
    expect(stale.error).toMatch(/changed since you opened it/);
    const rpcBefore = fakeDb.rpcCalls.filter((c) => c.fn === 'zt_save_meet_config').length;

    const fresh = await api.saveMeetState('srv-meet-upcoming-1', first.data.state, { expectedUpdatedAt: rev2 });
    expect(fresh.error).toBeNull();
    const lastRpc = fakeDb.rpcCalls.filter((c) => c.fn === 'zt_save_meet_config').at(-1);
    expect(fakeDb.rpcCalls.filter((c) => c.fn === 'zt_save_meet_config').length).toBe(rpcBefore + 1);
    expect(lastRpc.params.p_expected_updated_at).toBe(rev2);

    // M9: ifc-ath-1 is on the roster through accepted reg-ifc-1
    const withoutLinked = { ...fresh.data.state, athletes: fresh.data.state.athletes.filter((a) => a.id !== 'ifc-ath-1') };
    const bad = await api.saveMeetState('srv-meet-upcoming-1', withoutLinked);
    expect(bad.data).toBeNull();
    expect(bad.error).toMatch(/accepted registration/);
    expect((await api.getMeet('srv-meet-upcoming-1')).data.state.athletes.some((a) => a.id === 'ifc-ath-1')).toBe(true);
  });

  // Astra gate (10/17 pm): listing writes carry the revision too, and a committed write with a failed re-read says so.
  test('gate C3: updateListing passes expectedUpdatedAt to zt_update_listing; a stale listing save is refused; a fresh one lands', async () => {
    const fakeDb = createFakePromoterDb();
    const api = SA.createSupabasePromoterApi(fakeDb);
    const first = await api.getMeet('srv-meet-upcoming-1');
    const rev1 = first.data.summary.updatedAt;

    // tab A closes registration
    const a = await api.updateListing('srv-meet-upcoming-1', { registrationStatus: 'closed' }, { expectedUpdatedAt: rev1 });
    expect(a.error).toBeNull();
    expect(a.data.listing.registrationStatus).toBe('closed');
    const rev2 = a.data.updatedAt;
    expect(rev2).not.toBe(rev1);
    const call = fakeDb.rpcCalls.filter((c) => c.fn === 'zt_update_listing').at(-1);
    expect(call.params.p_expected_updated_at).toBe(rev1);
    expect(call.params.p_patch).toEqual({ registration_status: 'closed' });

    // tab B, still on rev1, submits the whole old listing (registration open): refused, registration stays closed
    const stale = await api.updateListing('srv-meet-upcoming-1', { ...first.data.summary.listing }, { expectedUpdatedAt: rev1 });
    expect(stale.data).toBeNull();
    expect(stale.error).toMatch(/changed since you opened it/);
    expect((await api.getMeet('srv-meet-upcoming-1')).data.summary.listing.registrationStatus).toBe('closed');

    const fresh = await api.updateListing('srv-meet-upcoming-1', { federation: 'USS' }, { expectedUpdatedAt: rev2 });
    expect(fresh.error).toBeNull();
    expect(fresh.data.listing.federation).toBe('USS');
    expect(fresh.data.listing.registrationStatus).toBe('closed');
  });

  test('gate C2: a write that lands but cannot be re-read returns committed: true with a reload message, never a bare failure', async () => {
    const fakeDb = createFakePromoterDb();
    const api = SA.createSupabasePromoterApi(fakeDb);
    const first = await api.getMeet('srv-meet-upcoming-1');
    const realSelect = fakeDb.selectMeet.bind(fakeDb);
    let failReads = false;
    fakeDb.selectMeet = async (id) => {
      if (failReads) throw new Error('Network failure after commit');
      return realSelect(id);
    };

    // saveMeetState: the RPC runs, then the re-read fails
    const origRpc = fakeDb.rpc.bind(fakeDb);
    fakeDb.rpc = async (fn, params) => {
      const out = await origRpc(fn, params);
      if (fn === 'zt_save_meet_config') failReads = true;
      return out;
    };
    const saved = await api.saveMeetState('srv-meet-upcoming-1', first.data.state, { expectedUpdatedAt: first.data.summary.updatedAt });
    expect(saved.data).toBeNull();
    expect(saved.committed).toBe(true);
    expect(saved.error).toMatch(/saved, but the page could not refresh/);
    failReads = false;
    expect(fakeDb.rpcCalls.filter((c) => c.fn === 'zt_save_meet_config').length).toBe(1);

    // updateListing: same shape
    const rev = (await api.getMeet('srv-meet-upcoming-1')).data.summary.updatedAt;
    fakeDb.rpc = async (fn, params) => {
      const out = await origRpc(fn, params);
      return out;
    };
    const origUpdate = fakeDb.updateMeetListing.bind(fakeDb);
    fakeDb.updateMeetListing = async (...args) => {
      await origUpdate(...args);
      failReads = true;
    };
    const listed = await api.updateListing('srv-meet-upcoming-1', { federation: 'USS' }, { expectedUpdatedAt: rev });
    expect(listed.data).toBeNull();
    expect(listed.committed).toBe(true);
    expect(listed.error).toMatch(/Listing saved, but/);
    failReads = false;
    expect((await api.getMeet('srv-meet-upcoming-1')).data.summary.listing.federation).toBe('USS');

    // a refused write is NOT committed
    const refused = await api.updateListing('srv-meet-upcoming-1', { athleteCap: 0 });
    expect(refused.data).toBeNull();
    expect(refused.committed).toBeUndefined();
  });

  // Astra rehearsal R3 (10/17): the re-read can also fail one step later, in the child reads behind buildMeetDetail,
  // which used to fall through to the outer catch and come back as a bare error (meet created, Create re-enabled).
  test('R3: a child read that throws after the write landed still reports committed: true (createMeet and saveMeetState)', async () => {
    const fakeDb = createFakePromoterDb();
    const api = SA.createSupabasePromoterApi(fakeDb);
    const realChildren = fakeDb.selectChildren.bind(fakeDb);
    let failChildren = false;
    fakeDb.selectChildren = async (id) => {
      if (failChildren) throw new Error('children read timed out');
      return realChildren(id);
    };
    const origRpc = fakeDb.rpc.bind(fakeDb);
    fakeDb.rpc = async (fn, params) => {
      const out = await origRpc(fn, params);
      if (fn === 'zt_create_meet' || fn === 'zt_save_meet_config') failChildren = true;
      return out;
    };

    const before = (await api.listMyMeets()).data.length;
    const created = await api.createMeet({ name: 'R3 Commit Fault', date: '2027-03-06', slug: 'r3-commit-fault' });
    expect(created.data).toBeNull();
    expect(created.committed).toBe(true);
    expect(created.error).toMatch(/created, but it could not be loaded afterwards/);
    expect(created.error).toMatch(/do not create it again/);
    failChildren = false;
    expect((await api.listMyMeets()).data.length).toBe(before + 1);

    const first = await api.getMeet('srv-meet-upcoming-1');
    const saved = await api.saveMeetState('srv-meet-upcoming-1', first.data.state, { expectedUpdatedAt: first.data.summary.updatedAt });
    expect(saved.data).toBeNull();
    expect(saved.committed).toBe(true);
    expect(saved.error).toMatch(/saved, but the page could not refresh \(children read timed out\)/);
    failChildren = false;

    // and a failure BEFORE the write is still a plain, uncommitted error
    fakeDb.rpc = async (fn) => { if (fn === 'zt_create_meet') throw new Error('slug taken'); return origRpc(fn); };
    const refused = await api.createMeet({ name: 'Nope', date: '2027-03-06', slug: 'r3-commit-fault' });
    expect(refused.committed).toBeUndefined();
    expect(refused.error).toMatch(/slug taken/);
  });
});

describe('supabaseApi: accept/decline mapping of athleteId', () => {
  test('accept creates reg-ath-<left(id,8)> and updates counts; decline removes it; scored athlete decline is refused', async () => {
    const fakeDb = createFakePromoterDb();
    const api = SA.createSupabasePromoterApi(fakeDb, { today: () => '2026-11-01' });

    const acc = await api.setRegistrationStatus('reg-ifc-3', 'accepted');
    expect(acc.error).toBeNull();
    expect(acc.data.status).toBe('accepted');
    expect(acc.data.athleteId).toBe('reg-ath-reg-ifc-');

    const afterAcc = (await api.getMeet('srv-meet-upcoming-1')).data;
    expect(afterAcc.summary.athleteCount).toBe(3);
    expect(afterAcc.summary.registrationCount).toBe(3);
    expect(afterAcc.summary.pendingCount).toBe(4);
    expect(afterAcc.state.athletes.some((a) => a.id === acc.data.athleteId)).toBe(true);

    const dec = await api.setRegistrationStatus('reg-ifc-3', 'declined');
    expect(dec.error).toBeNull();
    expect(dec.data.status).toBe('declined');
    expect(dec.data.athleteId).toBeNull();

    const afterDec = (await api.getMeet('srv-meet-upcoming-1')).data;
    expect(afterDec.summary.athleteCount).toBe(2);
    expect(afterDec.summary.registrationCount).toBe(2);
    expect(afterDec.summary.pendingCount).toBe(4);

    // Declining reg-srs-1 (linked to scored srs-a1) is refused
    const blocked = await api.setRegistrationStatus('reg-srs-1', 'declined');
    expect(blocked.data).toBeNull();
    expect(blocked.error).toMatch(/Casey Placeholder \(Fake\) has recorded results/);
  });
});

describe('supabaseApi: athlete account links (023 show history)', () => {
  test('link by username (with @, any case), list, duplicate refused, unknown refused, unlink', async () => {
    const fakeDb = createFakePromoterDb();
    const api = SA.createSupabasePromoterApi(fakeDb);
    const detail = (await api.getMeet('srv-meet-upcoming-1')).data;
    const [a1, a2] = detail.state.athletes;

    expect((await api.listAthleteAccounts('srv-meet-upcoming-1')).data).toEqual([]);

    const linked = await api.linkAthleteAccount('srv-meet-upcoming-1', a1.id, '@KurtPollack');
    expect(linked.error).toBeNull();
    expect(linked.data).toEqual({ athleteId: a1.id, username: 'kurtpollack', displayName: 'Kurt Pollack', fromRegistration: false });

    const list = (await api.listAthleteAccounts('srv-meet-upcoming-1')).data;
    expect(list).toHaveLength(1);
    expect(list[0].username).toBe('kurtpollack');
    expect(list[0].fromRegistration).toBe(false);

    const dup = await api.linkAthleteAccount('srv-meet-upcoming-1', a2.id, 'kurtpollack');
    expect(dup.data).toBeNull();
    expect(dup.error).toMatch(/already linked to/);

    const unknown = await api.linkAthleteAccount('srv-meet-upcoming-1', a2.id, 'nobody_here');
    expect(unknown.error).toMatch(/No ZeroTacky account has the username "nobody_here"/);

    const missing = await api.linkAthleteAccount('srv-meet-upcoming-1', 'not-on-roster', 'grace_g');
    expect(missing.error).toMatch(/not on this roster/);

    const unlinked = await api.linkAthleteAccount('srv-meet-upcoming-1', a1.id, null);
    expect(unlinked.error).toBeNull();
    expect(unlinked.data).toBeNull();
    expect((await api.listAthleteAccounts('srv-meet-upcoming-1')).data).toEqual([]);

    const calls = fakeDb.rpcCalls.filter((c) => c.fn === 'zt_link_athlete_account');
    expect(calls.at(-1).params).toEqual({ p_meet_id: 'srv-meet-upcoming-1', p_athlete_id: a1.id, p_username: '' });
  });

  test('signed out: both methods refuse without touching the database', async () => {
    const fakeDb = createFakePromoterDb({ signedOut: true });
    const api = SA.createSupabasePromoterApi(fakeDb);
    expect((await api.listAthleteAccounts('srv-meet-upcoming-1')).error).toMatch(/Sign in required/);
    expect((await api.linkAthleteAccount('srv-meet-upcoming-1', 'x', 'kurtpollack')).error).toMatch(/Sign in required/);
    expect(fakeDb.rpcCalls.filter((c) => c.fn.startsWith('zt_link') || c.fn.startsWith('zt_meet_athlete'))).toHaveLength(0);
  });
});

describe('supabaseApi: getPublicMeetBySlug H1 secret check & submitRegistration', () => {
  test('getPublicMeetBySlug output contains none of joinCode, adminPin, emergencyContact, ownerId, or results', async () => {
    const fakeDb = createFakePromoterDb({ signedOut: true });
    const api = SA.createSupabasePromoterApi(fakeDb, { today: () => '2026-11-01' });

    const res = await api.getPublicMeetBySlug('iron-furnace-classic-2026');
    expect(res.error).toBeNull();
    expect(res.data).not.toBeNull();
    expect(res.data.acceptedCount).toBe(2);
    expect(res.data.promoterDisplayName).toBe('Keystone Iron Promotions (Demo)');

    const sanitized = {
      ...res.data,
      listing: { ...res.data.listing, promoterContact: null },
    };
    const json = JSON.stringify(sanitized);
    for (const forbidden of [
      'joinCode',
      'join_code',
      'adminPin',
      'admin_pin',
      'emergencyContact',
      'emergency_contact',
      'ownerId',
      'owner_id',
      'results',
      'FRNC26',
      '1050',
      '@',
    ]) {
      expect(json.includes(forbidden)).toBe(false);
    }

    const sub = await api.submitRegistration({
      slug: 'iron-furnace-classic-2026',
      divisionId: 'ifc-g1',
      athleteName: 'Taylor Public (Fake)',
      email: 'taylor.public@example.com',
      emergencyContact: 'Jordan Public 717-555-0199',
      dateOfBirth: '1990-05-02',
      guardian: null,
      waiverAccepted: true,
      waiverVersion: 'testwaiver01',
    });
    expect(sub.error).toBeNull();
    expect(sub.data.status).toBe('pending');
    // C6: the version reaches the RPC payload and comes back on the stored request (caught in the 10/17 browser pass)
    const rpc = fakeDb.rpcCalls.find((c) => c.fn === 'zt_submit_registration');
    expect(rpc.params.p_input.waiverVersion).toBe('testwaiver01');
    fakeDb.setSignedOut(false);   // the promoter reads it back
    const detail = await api.getMeet('srv-meet-upcoming-1');
    const stored = (await api.listRegistrations(detail.data.summary.serverId)).data.find((r) => r.id === sub.data.id);
    expect(stored.waiverVersion).toBe('testwaiver01');
    expect(stored.waiverAcceptedAt).not.toBeNull();
    expect(stored.guardian).toBeNull();
    expect(stored.dateOfBirth).toBe('1990-05-02');
    expect(rpc.params.p_input.dateOfBirth).toBe('1990-05-02');
    expect(rpc.params.p_input.guardian).toBeNull();

    // 009: a minor's guardian travels in the RPC payload, trimmed, and comes back on the stored request
    fakeDb.setSignedOut(true);
    const minor = await api.submitRegistration({
      slug: 'iron-furnace-classic-2026',
      divisionId: 'ifc-g1',
      athleteName: 'Teen Public (Fake)',
      email: 'teen.public@example.com',
      emergencyContact: 'Jordan Public 717-555-0199',
      dateOfBirth: '2010-03-04',
      guardian: { name: ' Jordan Public ', contact: ' jordan@example.com ' },
      waiverAccepted: true,
      waiverVersion: 'testwaiver01',
    });
    expect(minor.error).toBeNull();
    const minorRpc = fakeDb.rpcCalls.filter((c) => c.fn === 'zt_submit_registration').at(-1);
    expect(minorRpc.params.p_input.guardian).toEqual({ name: 'Jordan Public', contact: 'jordan@example.com' });
    fakeDb.setSignedOut(false);
    const storedMinor = (await api.listRegistrations(detail.data.summary.serverId)).data.find((r) => r.id === minor.data.id);
    expect(storedMinor.guardian).toEqual({ name: 'Jordan Public', contact: 'jordan@example.com' });
    expect(storedMinor.dateOfBirth).toBe('2010-03-04');

    // 009: too young is refused by the client rules before any RPC
    const rpcCountBefore = fakeDb.rpcCalls.filter((c) => c.fn === 'zt_submit_registration').length;
    fakeDb.setSignedOut(true);
    const young = await api.submitRegistration({
      slug: 'iron-furnace-classic-2026',
      divisionId: 'ifc-g1',
      athleteName: 'Kid Public (Fake)',
      email: 'kid.public@example.com',
      emergencyContact: 'Jordan Public 717-555-0199',
      dateOfBirth: '2016-01-01',
      guardian: { name: 'Jordan Public', contact: 'jordan@example.com' },
      waiverAccepted: true,
      waiverVersion: 'testwaiver01',
    });
    expect(young.error).toMatch(/at least 12 on competition day/);
    expect(fakeDb.rpcCalls.filter((c) => c.fn === 'zt_submit_registration').length).toBe(rpcCountBefore);
    fakeDb.setSignedOut(false);
  });
});

describe('supabaseApi: every method returns { data: null, error } when db throws', () => {
  test('never throws an unhandled rejection on database failure', async () => {
    const fakeDb = createFakePromoterDb();
    fakeDb.setThrowError('Simulated PostgREST outage');
    const api = SA.createSupabasePromoterApi(fakeDb);
    const dummyState = MB.createBlankMeet('Test', '2026-12-01');

    const calls = await Promise.all([
      api.getCurrentUser(),
      api.updateProfile({ displayName: 'New Name' }),
      api.listMyMeets(),
      api.getMeet('srv-meet-upcoming-1'),
      api.createMeet({ name: 'New', date: '2026-12-01' }),
      api.saveMeetState('srv-meet-upcoming-1', dummyState),
      api.updateListing('srv-meet-upcoming-1', { federation: 'USS' }),
      api.rotateJoinCode('srv-meet-upcoming-1'),
      api.archiveMeet('srv-meet-upcoming-1'),
      api.deleteMeet('srv-meet-upcoming-1'),
      api.listMyAthleteMeets(),
      api.followShow('iron-furnace-classic-2026', true),
      api.listRegistrations('srv-meet-upcoming-1'),
      api.setRegistrationStatus('reg-ifc-3', 'accepted'),
      api.listAthleteAccounts('srv-meet-upcoming-1'),
      api.linkAthleteAccount('srv-meet-upcoming-1', 'a1', 'kurtpollack'),
      api.getPublicMeetBySlug('iron-furnace-classic-2026'),
      api.submitRegistration({
        slug: 'iron-furnace-classic-2026',
        divisionId: 'ifc-g1',
        athleteName: 'Test Athlete',
        email: 'test@example.com',
        emergencyContact: 'Sam Test 717-555-0100',
        dateOfBirth: '1990-05-02',
        guardian: null,
        waiverAccepted: true,
        waiverVersion: 'testwaiver01',
      }),
    ]);

    for (const res of calls) {
      expect(res.data).toBeNull();
      expect(res.error).toMatch(/Simulated PostgREST outage/);
    }
  });

  test('getPromoterApi forwards to the lazily loaded fixture when the Supabase client is null (H1)', async () => {
    const savedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const savedKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    try {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      expect(UP.isLiveBackend()).toBe(false);
      const lazy = UP.getPromoterApi();
      // not the fixture object itself: a forwarding wrapper, so fixtureApi.ts stays out of the public bundle
      expect(lazy).not.toBe(FA.getFixturePromoterApi());
      expect(UP.getPromoterApi()).toBe(lazy);
      const viaLazy = await lazy.getPublicMeetBySlug('garden-state-winter-wreckage-2026');
      const direct = await FA.getFixturePromoterApi().getPublicMeetBySlug('garden-state-winter-wreckage-2026');
      expect(viaLazy.error).toBeNull();
      expect(viaLazy.data).toEqual(direct.data);
      // the dev hook reaches the same fixture singleton
      await UP.setFixtureSignedOutForDev(true);
      expect((await lazy.getCurrentUser()).data).toBeNull();
      await UP.setFixtureSignedOutForDev(false);
      expect((await lazy.getCurrentUser()).data).not.toBeNull();
    } finally {
      if (savedUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = savedUrl;
      if (savedKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = savedKey;
    }
  });
});

describe('supabaseApi: deleteMeet (010)', () => {
  test('a meet with data needs the exact name; then the meet, its children and registrations are gone', async () => {
    const fakeDb = createFakePromoterDb();
    const api = SA.createSupabasePromoterApi(fakeDb);
    const before = (await api.getMeet('srv-meet-upcoming-1')).data;
    expect(before.summary.divisionCount).toBeGreaterThan(0);

    const noName = await api.deleteMeet('srv-meet-upcoming-1');
    expect(noName.data).toBeNull();
    expect(noName.error).toContain('Type the meet name exactly');

    const wrongName = await api.deleteMeet('srv-meet-upcoming-1', { confirmName: 'Some Other Meet' });
    expect(wrongName.data).toBeNull();

    const ok = await api.deleteMeet('srv-meet-upcoming-1', { confirmName: `  ${before.summary.name.toUpperCase()} ` });
    expect(ok.error).toBeNull();
    expect(ok.data.id).toBe('srv-meet-upcoming-1');
    expect(ok.data.deleted.divisions).toBe(before.summary.divisionCount);
    expect(ok.data.deleted.athletes).toBe(before.summary.athleteCount);
    expect(ok.data.deleted.results).toBe(before.state.results.length);
    expect(ok.data.deleted.registrations).toBeGreaterThan(0);

    const after = await api.getMeet('srv-meet-upcoming-1');
    expect(after.data).toBeNull();
    expect((await api.listMyMeets()).data.some((m) => m.serverId === 'srv-meet-upcoming-1')).toBe(false);
    const regs = await api.listRegistrations('srv-meet-upcoming-1');
    expect(regs.data === null || regs.data.length === 0).toBe(true);
    const rpc = fakeDb.rpcCalls.filter((c) => c.fn === 'zt_delete_meet');
    expect(rpc.length).toBe(3);
    expect(rpc[0].params.p_confirm_name).toBeNull();
    expect(rpc[2].params.p_confirm_name).toBe(before.summary.name.toUpperCase());
  });

  test('live and completed meets are refused; an empty draft deletes without a name; signed out is refused', async () => {
    const fakeDb = createFakePromoterDb();
    const api = SA.createSupabasePromoterApi(fakeDb);
    const live = await api.deleteMeet('srv-meet-live-2', { confirmName: 'anything' });
    expect(live.data).toBeNull();
    expect(live.error).toContain('live meet cannot be deleted');
    const done = await api.deleteMeet('srv-meet-completed-3', { confirmName: 'anything' });
    expect(done.data).toBeNull();
    expect(done.error).toContain('completed meet cannot be deleted');

    const created = await api.createMeet({ name: 'Scratch Draft', date: '2027-01-09' });
    expect(created.error).toBeNull();
    const draft = await api.deleteMeet(created.data.summary.serverId);
    expect(draft.error).toBeNull();
    expect(Object.values(draft.data.deleted).every((n) => n === 0)).toBe(true);
    expect((await api.getMeet(created.data.summary.serverId)).data).toBeNull();

    const signedOutDb = createFakePromoterDb({ signedOut: true });
    const out = await SA.createSupabasePromoterApi(signedOutDb).deleteMeet('srv-meet-upcoming-1');
    expect(out.error).toBe('Sign in required to delete a meet.');
    expect(signedOutDb.rpcCalls.filter((c) => c.fn === 'zt_delete_meet').length).toBe(0);
  });
});
