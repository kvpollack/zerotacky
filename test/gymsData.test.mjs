import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const G = await import('../lib/website/supabaseGyms.ts');
const D = await import('../lib/website/data.ts');
const EQ = await import('../lib/website/gymEquipment.ts');

// 015 gyms (10/20): the directory reads the `gyms` table; fixtures only when no backend is configured.
const row = (over = {}) => ({
  id: '11111111-1111-1111-1111-111111111111', slug: 'hercules-gym-syracuse-ny', name: 'Hercules Gym', status: 'unclaimed',
  gym_type: 'powerlifting', street_address: '6361 Thompson Rd St. 1', city: 'Syracuse', state: 'NY', zip: '13206',
  lat: 43.07, lng: -76.1, website_url: 'https://www.herculesgymsyracuse.com/', phone: '315-433-1361', instagram: '', contact: '',
  day_pass_availability: 'available', day_pass_price: '$10', day_pass_url: '', drop_in_policy: 'Day Passes Are Welcome During Staffed Hours. 1 Day – $10',
  drop_in_hours: '', equipment: ['monolift', 'deadlift_platform', 'comp_bars'], equipment_notes: { monolift: '3 monolifts' },
  source_url: 'https://www.herculesgymsyracuse.com/', confidence: 'high', last_verified: '2026-10-20', updated_at: '2026-10-20T01:00:00Z', ...over,
});

describe('gyms table -> listing', () => {
  test('maps ids to labels, street stays street-only, zip separate', () => {
    const l = G.mapGymRowToListing(row());
    assert.deepEqual(l.implementTags, ['Monolift', 'Deadlift platform', 'Competition bars']);
    assert.equal(l.equipment[0].category, 'Powerlifting');
    assert.equal(l.equipment[0].details, '3 monolifts');
    assert.equal(l.streetAddress, '6361 Thompson Rd St. 1');
    assert.equal(l.postalCode, '13206');
    assert.equal(l.claimStatus, 'unclaimed');
    assert.equal(l.isDemoListing, false);
    assert.equal(l.contactInfo, '315-433-1361');
    assert.equal(l.lastUpdatedDate, '2026-10-20');
    assert.equal(l.lat, 43.07);
  });
  test('every collector id has a label', () => {
    const ids = 'log;axle;yoke;farmers;frame;stones;natural_stones;sandbags;kegs;circus_db;husafell;conans_wheel;viking_press;loading_platform;car_deadlift;pull_harness;arm_over_arm;tire;power_stairs;turf_lane;comp_bars;calibrated_plates;monolift;combo_rack;deadlift_platform'.split(';');
    const known = new Set(EQ.GYM_EQUIPMENT.map((e) => e.id));
    for (const id of ids) assert.ok(known.has(id), `missing label for ${id}`);
    assert.equal(G.equipmentLabel('not_a_real_id'), 'not a real id');
  });
  test('blanks stay blank, no coordinates when null, claimed flag', () => {
    const l = G.mapGymRowToListing(row({ street_address: '', zip: '', lat: null, lng: null, equipment: null, equipment_notes: null, phone: '', status: 'claimed', day_pass_price: '' }));
    assert.equal(l.streetAddress, undefined);
    assert.equal(l.postalCode, undefined);
    assert.equal(l.lat, undefined);
    assert.deepEqual(l.implementTags, []);
    assert.equal(l.contactInfo, undefined);
    assert.equal(l.claimStatus, 'claimed');
    assert.equal(l.dayPassPriceDisplay, undefined);
  });
  test('display order: claimed, then most equipment, then confidence, then name', () => {
    const a = G.mapGymRowToListing(row({ slug: 'a', name: 'Zed', equipment: ['log'] }));
    const b = G.mapGymRowToListing(row({ slug: 'b', name: 'Bee', equipment: [], confidence: 'low' }));
    const c = G.mapGymRowToListing(row({ slug: 'c', name: 'Cee', equipment: [], confidence: 'high' }));
    const d = G.mapGymRowToListing(row({ slug: 'd', name: 'Dee', equipment: [], status: 'claimed', confidence: 'low' }));
    assert.deepEqual(G.sortListingsForDisplay([b, a, c, d]).map((g) => g.slug), ['d', 'a', 'c', 'b']);
  });
});

describe('listPublicGyms source selection', () => {
  test('demo mode returns the fixtures', async () => {
    const res = await D.listPublicGyms({ mode: 'demo' });
    assert.equal(res.source, 'demo');
    assert.ok(res.data.length >= 1);
    assert.ok(res.data.every((g) => g.isDemoListing));
  });
  test('with a client, rows come from the gyms table and no fixtures are mixed in', async () => {
    const calls = [];
    const client = { select: async (table, query) => { calls.push([table, query]); return [row()]; } };
    const res = await D.listPublicGyms({ client });
    assert.equal(res.source, 'live_supabase');
    assert.equal(calls[0][0], 'gyms');
    assert.match(calls[0][1], /status=in\.\(unclaimed,claimed\)/);
    assert.equal(res.data.length, 1);
    assert.equal(res.data[0].isDemoListing, false);
    const one = await D.getPublicGymBySlug('Hercules-Gym-Syracuse-NY', { client });
    assert.match(calls[1][1], /slug=eq\.hercules-gym-syracuse-ny/);
    assert.equal(one.data.name, 'Hercules Gym');
  });
  test('a failing client reports the error instead of falling back to fixtures', async () => {
    const client = { select: async () => { throw new Error('boom'); } };
    const res = await D.listPublicGyms({ client });
    assert.equal(res.data, null);
    assert.equal(res.error, 'boom');
  });
});
