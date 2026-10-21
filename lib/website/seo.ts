// Search metadata helpers (Kurt 10/21): canonical URLs and JSON-LD for the public site. Pure builders so the
// shapes are unit tested; pages render them through <JsonLd />. Nothing here reads the database.
import type { PublicShowRecord, PublicShowSummary, StrongmanGymListing } from './types';
import type { PublicAthlete } from './athletes';
import { SOCIAL_KEYS, socialUrl } from '../auth/profile';

export const SITE_NAME = 'ZeroTacky';
export const SITE_ORIGIN = 'https://www.zerotacky.com';

// Next resolves a relative canonical against metadataBase (set in app/layout.tsx), so pages pass their path.
export function canonical(path: string) {
  return { alternates: { canonical: path } };
}

// Pages that need an account or a meet code: keep them out of the index. robots.txt already disallows them,
// but a disallow only stops crawling; noindex is what keeps a linked URL out of results.
export const NOINDEX = { robots: { index: false, follow: false } } as const;

type Json = Record<string, unknown>;

function compact(o: Json): Json {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)));
}

export function organizationJsonLd(): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_ORIGIN,
    logo: `${SITE_ORIGIN}/icon-512.png`,
    description: 'Strongman shows, athlete registration, live scoring and a gym directory.',
  };
}

export function websiteJsonLd(): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_ORIGIN,
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${SITE_ORIGIN}/gyms?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

function eventStatus(show: PublicShowSummary): string {
  switch (show.competitionStatus) {
    case 'postponed': return 'https://schema.org/EventPostponed';
    case 'cancelled': return 'https://schema.org/EventCancelled';
    default: return 'https://schema.org/EventScheduled';
  }
}

// Google's event rich result needs name, startDate and location. Demo fixtures are excluded by the caller.
export function showEventJsonLd(show: PublicShowRecord | PublicShowSummary): Json {
  const v = show.venue;
  const record = show as Partial<PublicShowRecord>;
  const address = compact({
    '@type': 'PostalAddress',
    streetAddress: v.streetAddress,
    addressLocality: v.city,
    addressRegion: v.state,
    postalCode: v.postalCode,
    addressCountry: v.country || 'US',
  });
  const offers = record.registration
    ? compact({
        '@type': 'Offer',
        url: `${SITE_ORIGIN}/register/${show.slug}`,
        availability: record.registration.status === 'open' || record.registration.status === 'waitlist'
          ? 'https://schema.org/InStock'
          : 'https://schema.org/SoldOut',
        description: record.registration.entryFeeDisplay,
      })
    : undefined;
  return compact({
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: show.name,
    sport: 'Strongman',
    startDate: show.date,
    eventStatus: eventStatus(show),
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    url: `${SITE_ORIGIN}/shows/${show.slug}`,
    description: show.summaryNote,
    location: compact({ '@type': 'Place', name: v.facilityName || record.hostGymName, address }),
    organizer: record.promoterName ? { '@type': 'Person', name: record.promoterName } : undefined,
    offers,
  });
}

// ExerciseGym is the schema.org type for a gym; the map pack reads address + geo.
export function gymJsonLd(gym: StrongmanGymListing): Json {
  const geo = gym.lat !== undefined && gym.lng !== undefined ? { '@type': 'GeoCoordinates', latitude: gym.lat, longitude: gym.lng } : undefined;
  return compact({
    '@context': 'https://schema.org',
    '@type': 'ExerciseGym',
    name: gym.name,
    url: `${SITE_ORIGIN}/gyms/${gym.slug}`,
    sameAs: gym.websiteUrl,
    address: compact({
      '@type': 'PostalAddress',
      streetAddress: gym.streetAddress,
      addressLocality: gym.city,
      addressRegion: gym.state,
      postalCode: gym.postalCode,
      addressCountry: 'US',
    }),
    geo,
    amenityFeature: gym.implementTags.map((t) => ({ '@type': 'LocationFeatureSpecification', name: t.replace(/_/g, ' '), value: true })),
  });
}

export function athleteJsonLd(a: PublicAthlete): Json {
  return compact({
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    mainEntity: compact({
      '@type': 'Person',
      name: a.displayName,
      alternateName: a.username,
      url: `${SITE_ORIGIN}/athletes/${a.username}`,
      image: a.avatarUrl,
      homeLocation: a.location ? { '@type': 'Place', name: a.location } : undefined,
      sameAs: SOCIAL_KEYS.map((sk) => (a.socials[sk.key] ? socialUrl(sk.key, a.socials[sk.key] as string) : '')).filter(Boolean),
    }),
  });
}
