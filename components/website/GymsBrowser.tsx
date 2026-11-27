'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { filterPublicGyms, gymDistanceMiles } from '@/lib/website/filters';
import { DEFAULT_RADIUS_MILES, RADIUS_OPTIONS_MILES, formatMiles, normalizeZip, type GeoPoint, type RadiusMiles } from '@/lib/geo/geo';
import type { StrongmanGymListing } from '@/lib/website/types';
import { coverageLabel, rankGymsForShow, type TrainingNeed } from '@/lib/website/trainFor';
import { Cap, Key, KeyButton, MoreFiltersToggle, actionLink } from './sheet';
import { DIRECTORY_PAGE_SIZE, cleanShownParam, dayPassSummary, equipmentLine, missingDetailsLine, moreLabel, nextShown, shownLabel } from '@/lib/website/directory';
import { longIsoDate } from '@/lib/website/sheetFormat';

interface GymsBrowserProps {
  initialGyms: StrongmanGymListing[];
  availableStates: string[];
  availableImplements: string[];
  // From /gyms?q=&state= (10/21): the sitewide SearchAction in JSON-LD points here.
  initialSearch?: string;
  initialState?: string;
  initialIntroOnly?: boolean;   // 058: /gyms?intro=1
  initialShown?: number;        // pass 2: /gyms?n=72, how many cards were open when the visitor left (Back reopens them)
  // Train for this show (11/5): /gyms?show=<slug>. Gyms are ranked by how many of the show's implements they tag.
  trainFor?: { slug: string; name: string; date: string; needs: TrainingNeed[] } | null;
}

// Hand redraw in the sheet grammar (11/5, sweep item 5): the filter bar is one ruled block with a cap over each input.
// Pass 2 (11/27, merged audit rows 4, 13, 20): the list is paged at DIRECTORY_PAGE_SIZE with a "Show N more" key; a gym
// is two bands (details, then the action row) instead of five; equipment, gym type and intro sessions are text, not a
// chip each; whatever the listing has not supplied is one "Not provided: ..." line. On phones search and zip stay in
// view and the other filters open from "More filters".
const CHECK = { accentColor: 'var(--pen)' } as const;
const CHECK_LABEL = 'flex items-center gap-2.5 min-h-11 text-[15px] font-bold text-ink cursor-pointer';
const GYM_NOUN: [string, string] = ['gym', 'gyms'];

export default function GymsBrowser({
  initialGyms,
  availableStates,
  availableImplements,
  initialSearch = '',
  initialState = 'ALL',
  initialIntroOnly = false,
  initialShown = DIRECTORY_PAGE_SIZE,
  trainFor = null,
}: GymsBrowserProps) {
  const [search, setSearch] = useState(initialSearch);
  const [stateFilter, setStateFilter] = useState(initialState);
  const [implementTag, setImplementTag] = useState('ALL');
  const [dayPassOnly, setDayPassOnly] = useState(false);
  const [introOnly, setIntroOnly] = useState(initialIntroOnly);   // 058: ?intro=1 preselects it
  const [fullKitOnly, setFullKitOnly] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  // Zip + radius (Kurt 10/20). The zip resolves to a centroid through /api/zip so the table stays on the server.
  const [zip, setZip] = useState('');
  const [radius, setRadius] = useState<RadiusMiles>(DEFAULT_RADIUS_MILES);
  const [origin, setOrigin] = useState<GeoPoint | null>(null);
  const [zipState, setZipState] = useState<'idle' | 'looking' | 'ok' | 'unknown' | 'error'>('idle');
  const zip5 = normalizeZip(zip);
  useEffect(() => {
    if (!zip5) { setOrigin(null); setZipState('idle'); return undefined; }
    let alive = true;
    setZipState('looking');
    const t = setTimeout(() => {
      fetch(`/api/zip/${zip5}`)
        .then(async (r) => {
          if (!alive) return;
          if (r.status === 404) { setOrigin(null); setZipState('unknown'); return; }
          if (!r.ok) throw new Error(String(r.status));
          const j = (await r.json()) as { lat: number; lng: number };
          setOrigin({ lat: j.lat, lng: j.lng });
          setZipState('ok');
        })
        .catch(() => { if (alive) { setOrigin(null); setZipState('error'); } });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [zip5]);

  const filteredGyms = useMemo(
    () =>
      filterPublicGyms(initialGyms, {
        search,
        state: stateFilter,
        implementTag,
        dayPassOnly,
        introOnly,
        origin,
        radiusMiles: radius,
      }),
    [initialGyms, search, stateFilter, implementTag, dayPassOnly, introOnly, origin, radius]
  );
  // With a show: keep gyms that have at least one of its implements (or every one), best coverage first, then the
  // directory's own order (distance when a zip is set, otherwise name). Without a show every gym gets full coverage.
  const needs = trainFor?.needs ?? [];
  const rankedGyms = useMemo(() => {
    const byDistance = origin ? (a: StrongmanGymListing, b: StrongmanGymListing) => (gymDistanceMiles(a, origin) ?? Infinity) - (gymDistanceMiles(b, origin) ?? Infinity) : undefined;
    return rankGymsForShow(filteredGyms, needs, { fullOnly: fullKitOnly, tieBreak: byDistance });
  }, [filteredGyms, needs, fullKitOnly, origin]);

  // Paging: the count belongs to the filter set it was opened under, so any filter change starts again at one page
  // without an effect, and coming back to the same filters gives the list back as it was left.
  const filterKey = JSON.stringify([search, stateFilter, implementTag, dayPassOnly, introOnly, fullKitOnly, zip5 ?? '', radius]);
  // On Back the router remounts this component from its cached payload (the props of the first visit), so the count
  // is read from the address bar when there is one. On a first load both sources are the same `?n=`.
  const [page, setPage] = useState(() => ({
    key: filterKey,
    shown: typeof window === 'undefined' ? initialShown : cleanShownParam(new URLSearchParams(window.location.search).get('n') ?? undefined),
  }));
  const shown = page.key === filterKey ? page.shown : DIRECTORY_PAGE_SIZE;
  const visibleGyms = rankedGyms.slice(0, shown);
  const more = moreLabel(shown, rankedGyms.length);
  const showMore = () => {
    const n = nextShown(shown, rankedGyms.length);
    setPage({ key: filterKey, shown: n });
    // keep the count in the URL (no navigation) so Back from a gym page reopens the same cards at the same scroll
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('n', String(n));
      window.history.replaceState(null, '', url);
    } catch { /* the list still grows; only Back loses the count */ }
  };

  const hasActiveFilters =
    search.trim() !== '' || stateFilter !== 'ALL' || implementTag !== 'ALL' || dayPassOnly || introOnly || zip.trim() !== '' || fullKitOnly;
  // filters that sit behind "More filters" on a phone
  const moreCount = [stateFilter !== 'ALL', implementTag !== 'ALL', dayPassOnly, introOnly].filter(Boolean).length;
  const moreField = moreOpen ? 'flex' : 'hidden md:flex';

  const resetFilters = () => {
    setSearch('');
    setStateFilter('ALL');
    setImplementTag('ALL');
    setDayPassOnly(false);
    setIntroOnly(false);
    setFullKitOnly(false);
    setZip('');
  };

  const zipNote =
    zipState === 'looking' ? 'Looking up that zip…'
    : zipState === 'unknown' ? 'We do not know that zip. Check the digits.'
    : zipState === 'error' ? 'Zip lookup failed. Try again in a moment.'
    : zip.trim() && !zip5 ? 'Enter a 5-digit zip.'
    : origin ? `Showing gyms within ${radius} miles of ${zip5}, closest first.`
    : '';

  return (
    <div className="space-y-5">
      {trainFor && (
        <section aria-labelledby="train-for-heading" className="flex flex-col gap-3" data-testid="train-for">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <div className="flex flex-col gap-1 min-w-0">
              <Cap as="span">Training for a show · {longIsoDate(trainFor.date)}</Cap>
              <h2 id="train-for-heading" className="text-[22px] font-bold leading-tight text-ink">
                <Link href={`/shows/${trainFor.slug}`} className="inline-block py-2 no-underline hover:text-pen">{trainFor.name}</Link>
              </h2>
              <p className="text-[13px] leading-snug text-ink-muted max-w-2xl">
                {needs.length === 0
                  ? 'The promoter has not listed implements for the events yet, so every gym shows. Check back once the event specs are in.'
                  : 'Gyms below have at least one of the implements this show uses, the most complete kits first. Set a zip to put the closest first within each tier.'}
              </p>
            </div>
            <Link href="/gyms" className={`text-[13px] ${actionLink}`}>Clear show</Link>
          </div>
          {needs.length > 0 && (
            <dl className="flex flex-wrap gap-2">
              {needs.map((n) => (
                <div key={n.equipment} className="flex flex-col gap-1 px-4 py-3 min-w-0 max-w-full border-2 border-rule bg-sheet">
                  <dt className="text-[15px] font-bold leading-tight text-ink">{n.label}</dt>
                  <dd className="text-[12px] leading-snug text-ink-muted">{n.events.join(' · ')}</dd>
                </div>
              ))}
            </dl>
          )}
          {needs.length > 0 && (
            <label className={`${CHECK_LABEL} self-start`}>
              <input type="checkbox" checked={fullKitOnly} onChange={(e) => setFullKitOnly(e.target.checked)} className="w-5 h-5 shrink-0" style={CHECK} />
              Only gyms with everything the show uses
            </label>
          )}
        </section>
      )}
      {/* Filter bar */}
      <section aria-label="Filter gyms" className="zt-block grid-cols-1">
        <div id="gym-filter-grid" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-4 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="gym-search-input"><Cap as="span">Search gym, city, or equipment</Cap></label>
            <input
              id="gym-search-input"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="e.g. Hercules, Brooklyn, monolift, stones"
              className="zt-input"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="gym-zip-input"><Cap as="span">Near zip</Cap></label>
            <div className="flex gap-2">
              <input
                id="gym-zip-input"
                type="text"
                inputMode="numeric"
                autoComplete="postal-code"
                value={zip}
                onChange={(e) => setZip(e.target.value.replace(/[^\d-]/g, '').slice(0, 10))}
                placeholder="19063"
                aria-describedby="gym-zip-note"
                className="zt-input !w-24 shrink-0"
              />
              <select
                aria-label="Within miles"
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value) as RadiusMiles)}
                className="zt-input flex-1"
              >
                {RADIUS_OPTIONS_MILES.map((r) => (
                  <option key={r} value={r}>
                    Within {r} miles
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={`flex-col gap-1.5 ${moreField}`}>
            <label htmlFor="gym-state-select"><Cap as="span">State</Cap></label>
            <select
              id="gym-state-select"
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="zt-input"
            >
              <option value="ALL">All States</option>
              {availableStates.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          <div className={`flex-col gap-1.5 ${moreField}`}>
            <label htmlFor="gym-implement-select"><Cap as="span">Filter by equipment</Cap></label>
            <select
              id="gym-implement-select"
              value={implementTag}
              onChange={(e) => setImplementTag(e.target.value)}
              className="zt-input"
            >
              <option value="ALL">Any equipment</option>
              {availableImplements.map((imp) => (
                <option key={imp} value={imp}>
                  {imp}
                </option>
              ))}
            </select>
          </div>

          <div className={`flex-col col-span-full ${moreField}`}>
            <label className={CHECK_LABEL}>
              <input type="checkbox" checked={dayPassOnly} onChange={(e) => setDayPassOnly(e.target.checked)} className="w-5 h-5 shrink-0" style={CHECK} />
              <span>Only gyms with day-pass or appointment drop-in availability</span>
            </label>
            <label className={CHECK_LABEL}>
              <input type="checkbox" checked={introOnly} onChange={(e) => setIntroOnly(e.target.checked)} className="w-5 h-5 shrink-0" style={CHECK} />
              <span>New to strongman: only gyms that run intro sessions</span>
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2 sm:px-5 text-[13px]">
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="text-ink-muted" role="status">{shownLabel(shown, rankedGyms.length, GYM_NOUN)}</div>
            <div id="gym-zip-note" role="status" className={`${zipState === 'unknown' || zipState === 'error' ? 'text-redpen font-bold' : 'text-ink-muted'} ${zipNote ? '' : 'hidden'}`}>
              {zipNote}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {hasActiveFilters && (
              <button type="button" onClick={resetFilters} className={actionLink}>Reset filters</button>
            )}
            <MoreFiltersToggle open={moreOpen} onToggle={() => setMoreOpen((o) => !o)} count={moreCount} controls="gym-filter-grid" />
          </div>
        </div>
      </section>

      {/* Listings */}
      {rankedGyms.length === 0 ? (
        <div className="zt-block grid-cols-1">
          <div className="flex flex-col items-start gap-3 px-5 py-6 sm:px-7">
            <div className="text-[22px] font-bold leading-tight text-ink">
              {origin ? `No gyms within ${radius} miles of ${zip5}.` : 'No gyms match your current filters.'}
            </div>
            <div className="flex flex-wrap gap-2">
              {origin && radius < 100 && (
                <KeyButton variant="line" onClick={() => setRadius(100)}>Widen to 100 miles</KeyButton>
              )}
              <KeyButton variant="ink" onClick={resetFilters}>Reset filters</KeyButton>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visibleGyms.map(({ gym, coverage }) => {
              const miles = origin ? gymDistanceMiles(gym, origin) : null;
              const pass = dayPassSummary(gym.dayPassAvailability, gym.dayPassPriceDisplay);
              const equipment = equipmentLine(gym.implementTags);
              const missing = missingDetailsLine(gym);
              const kind = [
                gym.gymType ? (gym.gymType === 'mixed' ? 'Strongman + Powerlifting' : gym.gymType.charAt(0).toUpperCase() + gym.gymType.slice(1)) : '',
                gym.isDemoListing ? 'Demo listing' : '',
              ].filter(Boolean).join(' · ');
              const intro = gym.introSessions === 'yes' ? 'Intro sessions' : gym.introSessions === 'on_request' ? 'Intro on request' : '';
              return (
                <article key={gym.id} data-zt-gym-card="" className="zt-block @container grid-cols-1 grid-rows-[1fr_auto]">
                  <div className="flex flex-col gap-1.5 px-4 pt-1 pb-3.5 sm:px-5">
                    <div className="flex flex-col gap-1 @md:flex-row @md:items-start @md:justify-between @md:gap-5">
                      <div className="min-w-0">
                        <h2 className="text-[20px] font-bold leading-6 text-ink">
                          <Link href={`/gyms/${gym.slug}`} className="block py-2.5 no-underline hover:text-pen">{gym.name}</Link>
                        </h2>
                        <div className="text-[14px] leading-snug text-ink-muted">
                          <span className="font-bold text-ink">{gym.city}, {gym.state}</span>
                          {gym.streetAddress ? ` · ${gym.streetAddress}` : ''}
                          {miles !== null && <span className="font-bold text-pen"> · {formatMiles(miles)}</span>}
                        </div>
                      </div>
                      {pass && (
                        <div className="flex items-baseline gap-2 @md:flex-col @md:items-end @md:gap-0.5 @md:pt-3 @md:shrink-0 @md:max-w-[45%] @md:text-right" data-testid="day-pass">
                          <Cap as="span">{pass.label}</Cap>
                          <span className={`text-[15px] leading-5 ${pass.strong ? 'text-pen' : 'text-ink'}`}>{pass.value}</span>
                        </div>
                      )}
                    </div>
                    {trainFor && needs.length > 0 && (
                      <div className="text-[13px] leading-snug" data-testid="coverage">
                        <span className={`font-bold ${coverage.missing.length === 0 ? 'text-pen' : 'text-ink'}`}>{coverageLabel(coverage, needs.length)}</span>
                        {coverage.missing.length > 0 && (
                          <span className="text-ink-muted"> · missing {coverage.missing.map((n) => n.label.toLowerCase()).join(', ')}</span>
                        )}
                      </div>
                    )}
                    {(intro || kind) && (
                      <div className="text-[13px] leading-snug text-ink-muted">
                        {intro && <span className="font-bold text-pen">{intro}</span>}
                        {intro && kind ? ' · ' : ''}
                        {kind}
                      </div>
                    )}
                    <div className="text-[14px] leading-snug text-ink">
                      <span className="text-ink-muted">Equipment ({gym.implementTags.length}): </span>
                      {equipment.text || 'no list yet'}
                      {equipment.more > 0 && <span className="text-ink-muted"> +{equipment.more} more</span>}
                    </div>
                    {gym.dropInHours && (
                      <div className="text-[14px] leading-snug text-ink"><span className="text-ink-muted">Hours: </span>{gym.dropInHours}</div>
                    )}
                    {gym.dropInPolicy && (
                      <div className="text-[14px] leading-snug text-ink line-clamp-2"><span className="text-ink-muted">Policy: </span>{gym.dropInPolicy}</div>
                    )}
                    <div className="text-[12px] leading-snug text-ink-muted">
                      {missing ? `${missing} ` : ''}Updated {gym.lastUpdatedDate}
                    </div>
                  </div>

                  {/* sized by the card's own width (container query), since a card is as narrow at 768 px in two
                      columns as on a phone: under 448 px the two arrows go and the gaps tighten, so Website, Unclaimed
                      and the key share one line down to a 360 px phone; narrower than that the key wraps */}
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2 sm:px-5 text-[13px]">
                    <div className="flex flex-wrap items-center gap-x-3 @md:gap-x-5">
                      {gym.websiteUrl && (
                        <a href={gym.websiteUrl} target="_blank" rel="noopener noreferrer" className={actionLink}>Website<span aria-hidden="true" className="hidden @md:inline">&nbsp;↗</span></a>
                      )}
                      {gym.claimStatus === 'unclaimed' && (
                        <Link href={`/gyms/${gym.slug}/claim`} className={`${actionLink} font-normal text-ink-muted`}>Unclaimed</Link>
                      )}
                    </div>
                    <Key href={`/gyms/${gym.slug}`} variant="ink" className="min-h-11 px-3 @md:px-4 text-[12px] gap-0">Gym details<span aria-hidden="true" className="hidden @md:inline">&nbsp;→</span></Key>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="flex flex-col items-center gap-3 pt-1">
            <div className="text-[13px] text-ink-muted">{shownLabel(shown, rankedGyms.length, GYM_NOUN)}</div>
            {more && <KeyButton variant="line" onClick={showMore} className="w-full sm:w-auto sm:min-w-64">{more}</KeyButton>}
          </div>
        </>
      )}
    </div>
  );
}
