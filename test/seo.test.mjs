// Search metadata builders (Kurt 10/21): canonical helper and schema.org JSON-LD for home, shows, gyms, athletes.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const S = await import('../lib/website/seo.ts');

describe('canonical / noindex', () => {
  test('canonical wraps a relative path for metadataBase', () => {
    assert.deepEqual(S.canonical('/shows/x'), { alternates: { canonical: '/shows/x' } });
  });
  test('NOINDEX blocks index and follow', () => {
    assert.deepEqual(S.NOINDEX.robots, { index: false, follow: false });
  });
});

describe('showEventJsonLd', () => {
  const show = {
    id: '1', slug: 'all-out-strongfest-2026', name: 'All Out Strongfest 2026', date: '2026-10-24',
    venue: { facilityName: 'Power Plant Gym', streetAddress: '', city: 'Aston', state: 'PA', postalCode: '19014', country: 'US' },
    divisionGroupingStyle: 'inclusive', divisionLabels: [], implementTags: [], competitionStatus: 'upcoming',
    registrationStatus: 'closed', resultsStatus: 'not_started', isDemoFixture: false,
    promoterName: 'kvpollack', registration: { status: 'closed', entryFeeDisplay: 'Spectators free' },
  };
  test('SportsEvent with place, organizer and a closed offer', () => {
    const j = S.showEventJsonLd(show);
    assert.equal(j['@type'], 'SportsEvent');
    assert.equal(j.startDate, '2026-10-24');
    assert.equal(j.url, 'https://www.zerotacky.com/shows/all-out-strongfest-2026');
    assert.equal(j.eventStatus, 'https://schema.org/EventScheduled');
    assert.equal(j.location.name, 'Power Plant Gym');
    assert.equal(j.location.address.addressLocality, 'Aston');
    assert.equal(j.location.address.addressRegion, 'PA');
    assert.equal('streetAddress' in j.location.address, false);   // empty strings dropped
    assert.equal(j.organizer.name, 'kvpollack');
    assert.equal(j.offers.availability, 'https://schema.org/SoldOut');
    assert.equal(j.offers.url, 'https://www.zerotacky.com/register/all-out-strongfest-2026');
  });
  test('open registration is InStock; postponed maps to EventPostponed; summary row has no offers', () => {
    const j = S.showEventJsonLd({ ...show, competitionStatus: 'postponed', registration: { status: 'open' } });
    assert.equal(j.eventStatus, 'https://schema.org/EventPostponed');
    assert.equal(j.offers.availability, 'https://schema.org/InStock');
    const { registration, promoterName, ...summary } = show;
    const k = S.showEventJsonLd(summary);
    assert.equal('offers' in k, false);
    assert.equal('organizer' in k, false);
  });
  test('serialises without undefined and escapes nothing dangerous', () => {
    const json = JSON.stringify(S.showEventJsonLd(show));
    assert.equal(json.includes('undefined'), false);
    assert.equal(json.includes('""'), false);
  });
});

describe('gymJsonLd', () => {
  const gym = {
    id: 'g', slug: 'hercules-gym-syracuse-ny', name: 'Hercules Gym', city: 'Syracuse', state: 'NY', streetAddress: '1 Main St',
    postalCode: '13202', websiteUrl: 'https://www.herculesgymsyracuse.com', dayPassAvailability: 'available',
    implementTags: ['log', 'atlas_stones'], equipment: [], lat: 43.05, lng: -76.15, hostedShowSlugs: [], lastUpdatedDate: '2026-10-20', isDemoListing: false,
  };
  test('ExerciseGym with address, geo, sameAs and amenities', () => {
    const j = S.gymJsonLd(gym);
    assert.equal(j['@type'], 'ExerciseGym');
    assert.equal(j.sameAs, 'https://www.herculesgymsyracuse.com');
    assert.equal(j.address.postalCode, '13202');
    assert.deepEqual(j.geo, { '@type': 'GeoCoordinates', latitude: 43.05, longitude: -76.15 });
    assert.deepEqual(j.amenityFeature.map((a) => a.name), ['log', 'atlas stones']);
  });
  test('no coordinates, no geo; no website, no sameAs', () => {
    const j = S.gymJsonLd({ ...gym, lat: undefined, lng: undefined, websiteUrl: undefined, implementTags: [] });
    assert.equal('geo' in j, false);
    assert.equal('sameAs' in j, false);
    assert.equal('amenityFeature' in j, false);
  });
});

describe('athleteJsonLd', () => {
  test('ProfilePage around a Person with socials as sameAs', () => {
    const j = S.athleteJsonLd({
      id: 'u', username: 'kurt_lifts', displayName: 'Kurt P', roles: ['athlete'], badges: ['Athlete'], favoriteLift: 'Log press',
      favoriteLiftNote: '', location: 'Aston, PA', state: 'PA', homeGymName: '', prs: [], socials: { instagram: 'kurt', website: 'https://example.com' },
      avatarUrl: '', updatedAt: null,
    });
    assert.equal(j['@type'], 'ProfilePage');
    assert.equal(j.mainEntity.name, 'Kurt P');
    assert.equal(j.mainEntity.url, 'https://www.zerotacky.com/athletes/kurt_lifts');
    assert.equal(j.mainEntity.homeLocation.name, 'Aston, PA');
    assert.equal(j.mainEntity.sameAs.length, 2);
    assert.ok(j.mainEntity.sameAs.some((u) => u.includes('instagram.com/kurt')));
    assert.equal('image' in j.mainEntity, false);
  });
});

describe('site-level', () => {
  test('Organization and WebSite point at the production origin', () => {
    assert.equal(S.organizationJsonLd().url, 'https://www.zerotacky.com');
    assert.equal(S.websiteJsonLd().potentialAction.target.urlTemplate, 'https://www.zerotacky.com/gyms?q={search_term_string}');
  });
});
