'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { filterPublicGyms, gymDistanceMiles } from '@/lib/website/filters';
import { DEFAULT_RADIUS_MILES, RADIUS_OPTIONS_MILES, formatMiles, normalizeZip, type GeoPoint, type RadiusMiles } from '@/lib/geo/geo';
import type { DayPassAvailability, StrongmanGymListing } from '@/lib/website/types';
import { coverageLabel, rankGymsForShow, type TrainingNeed } from '@/lib/website/trainFor';
import { Cap, Key, KeyButton, textLink } from './sheet';
import { longIsoDate } from '@/lib/website/sheetFormat';

interface GymsBrowserProps {
  initialGyms: StrongmanGymListing[];
  availableStates: string[];
  availableImplements: string[];
  // From /gyms?q=&state= (10/21): the sitewide SearchAction in JSON-LD points here.
  initialSearch?: string;
  initialState?: string;
  // Train for this show (11/5): /gyms?show=<slug>. Gyms are ranked by how many of the show's implements they tag.
  trainFor?: { slug: string; name: string; date: string; needs: TrainingNeed[] } | null;
}

const DAY_PASS_LABELS: Record<DayPassAvailability, string> = {
  available: 'Day Pass Available',
  by_appointment: 'Drop-In By Appointment',
  not_available: 'Members Only',
  not_provided: 'Day pass not provided',
};

// Hand redraw in the sheet grammar (11/5, sweep item 5): the filter bar is one ruled block with a cap over each input;
// each gym is a ruled block (chips row, name + address + distance, hours/policy, equipment tags, footer with keys).
const CHIP = 'inline-flex items-center border-2 border-rule px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.04em] text-ink whitespace-nowrap';
const TAG = 'inline-flex items-center border border-rule px-2 py-0.5 text-[12px] font-bold text-ink';
const CHECK = { accentColor: 'var(--pen)' } as const;

export default function GymsBrowser({
  initialGyms,
  availableStates,
  availableImplements,
  initialSearch = '',
  initialState = 'ALL',
  trainFor = null,
}: GymsBrowserProps) {
  const [search, setSearch] = useState(initialSearch);
  const [stateFilter, setStateFilter] = useState(initialState);
  const [implementTag, setImplementTag] = useState('ALL');
  const [dayPassOnly, setDayPassOnly] = useState(false);
  const [fullKitOnly, setFullKitOnly] = useState(false);

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
        origin,
        radiusMiles: radius,
      }),
    [initialGyms, search, stateFilter, implementTag, dayPassOnly, origin, radius]
  );
  // With a show: keep gyms that have at least one of its implements (or every one), best coverage first, then the
  // directory's own order (distance when a zip is set, otherwise name). Without a show every gym gets full coverage.
  const needs = trainFor?.needs ?? [];
  const rankedGyms = useMemo(() => {
    const byDistance = origin ? (a: StrongmanGymListing, b: StrongmanGymListing) => (gymDistanceMiles(a, origin) ?? Infinity) - (gymDistanceMiles(b, origin) ?? Infinity) : undefined;
    return rankGymsForShow(filteredGyms, needs, { fullOnly: fullKitOnly, tieBreak: byDistance });
  }, [filteredGyms, needs, fullKitOnly, origin]);

  const hasActiveFilters =
    search.trim() !== '' || stateFilter !== 'ALL' || implementTag !== 'ALL' || dayPassOnly || zip.trim() !== '' || fullKitOnly;

  const resetFilters = () => {
    setSearch('');
    setStateFilter('ALL');
    setImplementTag('ALL');
    setDayPassOnly(false);
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
                <Link href={`/shows/${trainFor.slug}`} className="no-underline hover:text-pen">{trainFor.name}</Link>
              </h2>
              <p className="text-[13px] leading-snug text-ink-muted max-w-2xl">
                {needs.length === 0
                  ? 'The promoter has not listed implements for the events yet, so every gym shows. Check back once the event specs are in.'
                  : 'Gyms below have at least one of the implements this show uses, the most complete kits first. Set a zip to put the closest first within each tier.'}
              </p>
            </div>
            <Link href="/gyms" className={`text-[13px] ${textLink}`}>Clear show</Link>
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
            <label className="flex items-center gap-2.5 text-[15px] font-bold text-ink cursor-pointer self-start">
              <input type="checkbox" checked={fullKitOnly} onChange={(e) => setFullKitOnly(e.target.checked)} className="w-5 h-5 shrink-0" style={{ accentColor: 'var(--pen)' }} />
              Only gyms with everything the show uses
            </label>
          )}
        </section>
      )}
      {/* Filter bar */}
      <section aria-label="Filter gyms" className="zt-block grid-cols-1">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-4 px-4 py-4 sm:px-5">
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

          <div className="flex flex-col gap-1.5">
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

          <div className="flex flex-col gap-1.5">
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
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-5">
          <div className="flex flex-col gap-1.5 min-w-0">
            <label className="flex items-center gap-2.5 text-[15px] font-bold text-ink cursor-pointer">
              <input type="checkbox" checked={dayPassOnly} onChange={(e) => setDayPassOnly(e.target.checked)} className="w-5 h-5 shrink-0" style={CHECK} />
              <span>Only gyms with day-pass or appointment drop-in availability</span>
            </label>
            <div id="gym-zip-note" role="status" className={`text-[13px] ${zipState === 'unknown' || zipState === 'error' ? 'text-redpen font-bold' : 'text-ink-muted'} ${zipNote ? '' : 'hidden'}`}>
              {zipNote}
            </div>
          </div>
          {hasActiveFilters && (
            <button type="button" onClick={resetFilters} className={`text-[13px] ${textLink}`}>Reset filters</button>
          )}
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rankedGyms.map(({ gym, coverage }) => {
            const miles = origin ? gymDistanceMiles(gym, origin) : null;
            return (
              <article key={gym.id} className="zt-block grid-cols-1 grid-rows-[auto_auto_auto_1fr_auto]">
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-5">
                  <span className={gym.dayPassAvailability === 'available' ? `${CHIP} border-pen bg-pen text-pen-label` : CHIP}>
                    {DAY_PASS_LABELS[gym.dayPassAvailability]}
                    {gym.dayPassPriceDisplay ? ` · ${gym.dayPassPriceDisplay}` : ''}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {gym.gymType && <span className={CHIP}>{gym.gymType === 'mixed' ? 'Strongman + Powerlifting' : gym.gymType}</span>}
                    {gym.isDemoListing && <span className={`${CHIP} border-dashed`}>Demo listing</span>}
                    {gym.claimStatus === 'unclaimed' && (
                      <Link href={`/gyms/${gym.slug}/claim`} className={`${CHIP} border-dashed text-ink-muted no-underline hover:text-pen hover:border-pen`}>Unclaimed</Link>
                    )}
                  </span>
                </div>

                <div className="flex flex-col gap-1 px-4 py-3 sm:px-5">
                  <h2 className="text-[22px] font-bold leading-tight text-ink">
                    <Link href={`/gyms/${gym.slug}`} className="no-underline hover:text-pen">{gym.name}</Link>
                  </h2>
                  <div className="text-[13px] text-ink-muted">
                    <span className="font-bold text-ink">{gym.city}, {gym.state}</span>
                    {' · '}
                    {gym.streetAddress ? gym.streetAddress : 'Street address not provided'}
                    {miles !== null && <span className="font-bold text-pen"> · {formatMiles(miles)}</span>}
                  </div>
                  {trainFor && needs.length > 0 && (
                    <div className="text-[13px] leading-snug" data-testid="coverage">
                      <span className={`font-bold ${coverage.missing.length === 0 ? 'text-pen' : 'text-ink'}`}>{coverageLabel(coverage, needs.length)}</span>
                      {coverage.missing.length > 0 && (
                        <span className="text-ink-muted"> · missing {coverage.missing.map((n) => n.label.toLowerCase()).join(', ')}</span>
                      )}
                    </div>
                  )}
                </div>

                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-4 py-3 sm:px-5 text-[13px] leading-snug">
                  <dt className="text-ink-muted">Hours</dt>
                  <dd className="text-ink">{gym.dropInHours || 'Not provided'}</dd>
                  <dt className="text-ink-muted">Policy</dt>
                  <dd className="text-ink">{gym.dropInPolicy || 'Not provided'}</dd>
                </dl>

                <div className="flex flex-col gap-1.5 px-4 py-3 sm:px-5">
                  <Cap as="span">Equipment ({gym.implementTags.length})</Cap>
                  <div className="flex flex-wrap gap-1.5">
                    {gym.implementTags.length === 0 && <span className="text-[13px] text-ink-muted">No equipment list yet.</span>}
                    {gym.implementTags.map((tag) => (
                      <span key={tag} className={TAG}>{tag}</span>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
                  <span className="text-[12px] text-ink-muted">Updated {gym.lastUpdatedDate}</span>
                  <div className="flex items-center gap-2">
                    {gym.websiteUrl && (
                      <a href={gym.websiteUrl} target="_blank" rel="noopener noreferrer" className={`text-[13px] ${textLink}`}>Website <span aria-hidden="true">↗</span></a>
                    )}
                    <Key href={`/gyms/${gym.slug}`} variant="ink" className="min-h-10 px-4 text-[12px]">Gym details →</Key>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
