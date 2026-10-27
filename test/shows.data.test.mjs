import { test, describe, expect } from 'bun:test';

const ROOT = process.env.ZT_ROOT || '..';
const D = await import(`${ROOT}/lib/website/data.ts`);
const F = await import(`${ROOT}/lib/website/filters.ts`);
const SA = await import(`${ROOT}/lib/website/standingsAdapter.ts`);
const FX = await import(`${ROOT}/lib/promoter/fixtures.ts`);
const C = await import(`${ROOT}/lib/sync/client.ts`);
const M = await import(`${ROOT}/lib/sync/mapping.ts`);

// Builds an in-memory SyncClient backed by seeded meets (2 listed, 1 unlisted, 1 demo)
function createFakeShowsBackend() {
  const seedMeets = FX.createSeedMeets();
  const meets = [];
  const divisions = [];
  const events = [];
  const athletes = [];
  const results = [];
  // 026: directory gyms; the first seed meet is hosted by the listed one, the third by a removed one.
  const gyms = [
    { id: 'gym-listed', slug: 'northbank-barbell-erie-pa', name: 'Northbank Barbell', status: 'claimed' },
    { id: 'gym-removed', slug: 'gone-gym', name: 'Gone Gym', status: 'removed' },
  ];

  seedMeets.forEach((seed, idx) => {
    const rows = M.stateToRows(seed.state, {
      meetId: seed.summary.serverId,
      slug: seed.summary.slug,
      stations: seed.state.meet.stations,
      isDemo: false,
    });
    const l = seed.summary.listing;
    meets.push({
      ...rows.meet,
      competition_status: l.competitionStatus,
      registration_status: l.registrationStatus,
      results_status: l.resultsStatus,
      // Make the 2nd seed meet unlisted so we verify listPublicShows filters it out
      is_public_listed: idx !== 1,
      venue: l.venue,
      federation: l.federation,
      entry_fee_display: l.entryFeeDisplay,
      registration_deadline: l.registrationDeadline,
      athlete_cap: l.athleteCap,
      promoter_contact: l.promoterContact,
      host_gym_id: idx === 0 ? 'gym-listed' : idx === 2 ? 'gym-removed' : null,
      updated_at: seed.summary.updatedAt,
    });
    divisions.push(...rows.divisions);
    events.push(...rows.events);
    athletes.push(...rows.athletes);
    results.push(...rows.results);
  });

  // Also add a demo meet with is_public_listed: true to verify is_demo=eq.false excludes it
  meets.push({
    ...meets[0],
    id: 'srv-demo-hidden',
    slug: 'hidden-demo-meet',
    name: 'Hidden Demo Meet',
    is_demo: true,
    is_public_listed: true,
  });

  const fetchImpl = async (url) => {
    const u = new URL(url);
    const table = u.pathname.split('/').pop();
    let rows = [];

    if (table === 'meets') {
      rows = meets.filter((m) => m.is_public_listed === true && m.is_demo === false);
      const slugParam = u.searchParams.get('slug');
      if (slugParam?.startsWith('eq.')) {
        const target = slugParam.slice(3).toLowerCase();
        rows = rows.filter((m) => m.slug.toLowerCase() === target);
      }
    } else if (table === 'gyms') {
      const idParam = u.searchParams.get('id');
      const statusParam = u.searchParams.get('status');
      rows = gyms.filter((g) => !statusParam?.startsWith('in.(') || statusParam.slice(4, -1).split(',').includes(g.status));
      if (idParam?.startsWith('in.(')) {
        const ids = new Set(idParam.slice(4, -1).split(','));
        rows = rows.filter((g) => ids.has(g.id));
      }
    } else if (table === 'divisions' || table === 'events' || table === 'athletes' || table === 'results') {
      const source =
        table === 'divisions'
          ? divisions
          : table === 'events'
          ? events
          : table === 'athletes'
          ? athletes
          : results;
      const meetIdParam = u.searchParams.get('meet_id');
      if (meetIdParam?.startsWith('eq.')) {
        const id = meetIdParam.slice(3);
        rows = source.filter((r) => r.meet_id === id);
      } else if (meetIdParam?.startsWith('in.(')) {
        const ids = new Set(meetIdParam.slice(4, -1).split(','));
        rows = source.filter((r) => ids.has(r.meet_id));
      }
    }

    const text = JSON.stringify(rows);
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => JSON.parse(text),
      text: async () => text,
    };
  };

  return C.createSyncClient({
    url: 'https://fake.supabase.co',
    anonKey: 'ANON',
    fetchImpl,
  });
}

describe('website data: listPublicShows & getPublicShowBySlug', () => {
  test('fallback to fixture shows when backend env is absent', async () => {
    const savedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const savedKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    try {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      const listRes = await D.listPublicShows();
      expect(listRes.source).toBe('demo');
      expect(listRes.error).toBeNull();
      expect(listRes.data.length).toBe(5);

      const detailRes = await D.getPublicShowBySlug('strongfest-2026');
      expect(detailRes.source).toBe('demo');
      expect(detailRes.data.name).toBe('Riverside Iron Fest 2026 (Demo Upcoming)');
    } finally {
      if (savedUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = savedUrl;
      if (savedKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = savedKey;
    }
  });

  test('with a live backend returns only listed non-demo meets and works with filterPublicShows and standingsAdapter', async () => {
    const client = createFakeShowsBackend();
    const savedDemoFlag = process.env.NEXT_PUBLIC_ZT_DEMO_SHOWS;
    try {
      process.env.NEXT_PUBLIC_ZT_DEMO_SHOWS = '0';

      const res = await D.listPublicShows({ client });
      expect(res.source).toBe('live_supabase');
      expect(res.error).toBeNull();
      // 2 listed non-demo meets (iron-furnace-classic-2026 and susquehanna-summer-anvil-2026)
      expect(res.data.map((s) => s.slug)).toEqual([
        'iron-furnace-classic-2026',
        'susquehanna-summer-anvil-2026',
      ]);

      // Existing filters in lib/website/filters.ts work on mapped rows
      const upcoming = F.filterPublicShows(res.data, { competitionStatus: 'upcoming' });
      expect(upcoming.length).toBe(1);
      expect(upcoming[0].slug).toBe('iron-furnace-classic-2026');

      const byState = F.filterPublicShows(res.data, { state: 'PA' });
      expect(byState.length).toBe(2);

      // Unlisted meet returns null on getPublicShowBySlug
      const unlisted = await D.getPublicShowBySlug('steel-river-showdown-2026', { client });
      expect(unlisted.data).toBeNull();

      // Completed finalized meet maps standings cleanly through buildAllDivisionResultsViews
      const completed = await D.getPublicShowBySlug('susquehanna-summer-anvil-2026', { client });
      expect(completed.error).toBeNull();
      expect(completed.data.resultsStatus).toBe('final');
      const views = SA.buildAllDivisionResultsViews(completed.data);
      expect(views.length).toBe(2);
      expect(views[0].isOfficialFinal).toBe(true);
      expect(views[0].standings[0].overallPlace).toBe(1);
    } finally {
      if (savedDemoFlag === undefined) delete process.env.NEXT_PUBLIC_ZT_DEMO_SHOWS;
      else process.env.NEXT_PUBLIC_ZT_DEMO_SHOWS = savedDemoFlag;
    }
  });

  test('appends demo fixtures with isDemoFixture: true by default (NEXT_PUBLIC_ZT_DEMO_SHOWS unset) and when set to "1"', async () => {
    const client = createFakeShowsBackend();
    const savedDemoFlag = process.env.NEXT_PUBLIC_ZT_DEMO_SHOWS;
    try {
      delete process.env.NEXT_PUBLIC_ZT_DEMO_SHOWS;
      const byDefault = await D.listPublicShows({ client });
      expect(byDefault.data.filter((s) => s.isDemoFixture).length).toBe(5);
      process.env.NEXT_PUBLIC_ZT_DEMO_SHOWS = '1';
      const withDemos = await D.listPublicShows({ client });
      expect(withDemos.error).toBeNull();
      expect(withDemos.data.length).toBe(2 + 5);
      const demoRows = withDemos.data.filter((s) => s.isDemoFixture);
      expect(demoRows.length).toBe(5);
    } finally {
      if (savedDemoFlag === undefined) delete process.env.NEXT_PUBLIC_ZT_DEMO_SHOWS;
      else process.env.NEXT_PUBLIC_ZT_DEMO_SHOWS = savedDemoFlag;
    }
  });
});

describe('host gym on public shows (026)', () => {
  test('listPublicShows attaches slug + name for a listed host gym and nothing for a removed or unset one', async () => {
    const client = createFakeShowsBackend();
    const res = await D.listPublicShows({ client, includeDemoShows: false });
    expect(res.error).toBeNull();
    const bySlug = new Map(res.data.map((s) => [s.slug, s]));
    const hosted = res.data.filter((s) => s.hostGymSlug);
    expect(hosted.length).toBe(1);
    expect(hosted[0].hostGymSlug).toBe('northbank-barbell-erie-pa');
    expect(hosted[0].hostGymName).toBe('Northbank Barbell');
    for (const s of res.data) if (s !== hosted[0]) expect(s.hostGymSlug).toBeUndefined();
    expect(bySlug.size).toBe(res.data.length);
  });

  test('getPublicShowBySlug carries the host gym so the show page can link /gyms/<slug>', async () => {
    const client = createFakeShowsBackend();
    const list = await D.listPublicShows({ client, includeDemoShows: false });
    const hosted = list.data.find((s) => s.hostGymSlug);
    const res = await D.getPublicShowBySlug(hosted.slug, { client, includeDemoShows: false });
    expect(res.data.hostGymSlug).toBe('northbank-barbell-erie-pa');
    expect(res.data.hostGymName).toBe('Northbank Barbell');
    const other = list.data.find((s) => !s.hostGymSlug);
    const res2 = await D.getPublicShowBySlug(other.slug, { client, includeDemoShows: false });
    expect(res2.data.hostGymSlug).toBeUndefined();
  });
});

