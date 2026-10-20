'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Calendar, Dumbbell, ExternalLink, MapPin, RotateCcw, Search } from 'lucide-react';
import { filterPublicGyms, gymDistanceMiles } from '@/lib/website/filters';
import { DEFAULT_RADIUS_MILES, RADIUS_OPTIONS_MILES, formatMiles, normalizeZip, type GeoPoint, type RadiusMiles } from '@/lib/geo/geo';
import type { DayPassAvailability, StrongmanGymListing } from '@/lib/website/types';

interface GymsBrowserProps {
  initialGyms: StrongmanGymListing[];
  availableStates: string[];
  availableImplements: string[];
}

const DAY_PASS_LABELS: Record<DayPassAvailability, string> = {
  available: 'Day Pass Available',
  by_appointment: 'Drop-In By Appointment',
  not_available: 'Members Only',
  not_provided: 'Day pass not provided',
};

export default function GymsBrowser({
  initialGyms,
  availableStates,
  availableImplements,
}: GymsBrowserProps) {
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('ALL');
  const [implementTag, setImplementTag] = useState('ALL');
  const [dayPassOnly, setDayPassOnly] = useState(false);

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

  const hasActiveFilters =
    search.trim() !== '' || stateFilter !== 'ALL' || implementTag !== 'ALL' || dayPassOnly || zip.trim() !== '';

  const resetFilters = () => {
    setSearch('');
    setStateFilter('ALL');
    setImplementTag('ALL');
    setDayPassOnly(false);
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
      {/* Filter Bar */}
      <section
        aria-label="Filter gyms"
        className="bg-zt-surface border border-zt-border rounded-2xl p-4 space-y-3.5"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div>
            <label
              htmlFor="gym-search-input"
              className="block text-[11px] font-extrabold uppercase text-zt-muted mb-1"
            >
              Search Gym, City, or Equipment
            </label>
            <div className="relative">
              <Search
                className="w-4 h-4 text-zt-muted absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                id="gym-search-input"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="e.g. Keystone Forge, York, log, stones"
                className="w-full bg-zt-inset border border-zt-border-strong rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm font-bold text-zt-text"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="gym-zip-input"
              className="block text-[11px] font-extrabold uppercase text-zt-muted mb-1"
            >
              Near zip
            </label>
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
                className="w-28 bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-xs sm:text-sm font-bold text-zt-text"
              />
              <select
                aria-label="Within miles"
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value) as RadiusMiles)}
                className="flex-1 bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-xs font-bold text-zt-text"
              >
                {RADIUS_OPTIONS_MILES.map((r) => (
                  <option key={r} value={r}>
                    Within {r} miles
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="gym-state-select"
              className="block text-[11px] font-extrabold uppercase text-zt-muted mb-1"
            >
              State
            </label>
            <select
              id="gym-state-select"
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="w-full bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-xs font-bold text-zt-text"
            >
              <option value="ALL">All States</option>
              {availableStates.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="gym-implement-select"
              className="block text-[11px] font-extrabold uppercase text-zt-muted mb-1"
            >
              Filter by equipment
            </label>
            <select
              id="gym-implement-select"
              value={implementTag}
              onChange={(e) => setImplementTag(e.target.value)}
              className="w-full bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-xs font-bold text-zt-text"
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

        <div id="gym-zip-note" role="status" className={`text-[11px] font-bold ${zipState === 'unknown' || zipState === 'error' ? 'text-zt-danger-text' : 'text-zt-muted'} ${zipNote ? '' : 'hidden'}`}>
          {zipNote}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zt-border text-xs">
          <label className="inline-flex items-center gap-2 font-bold text-zt-text cursor-pointer">
            <input
              type="checkbox"
              checked={dayPassOnly}
              onChange={(e) => setDayPassOnly(e.target.checked)}
            />
            <span>Only show gyms with day-pass or appointment drop-in availability</span>
          </label>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="px-3 py-1.5 rounded-xl bg-zt-surface-2 border border-zt-border-strong text-zt-text font-extrabold text-xs uppercase flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              Reset Filters
            </button>
          )}
        </div>
      </section>

      {/* Listings */}
      {filteredGyms.length === 0 ? (
        <div className="bg-zt-surface border border-zt-border rounded-2xl p-8 text-center space-y-3">
          <div className="text-base font-black text-zt-text">
            {origin ? `No gyms within ${radius} miles of ${zip5}.` : 'No gyms match your current filters.'}
          </div>
          {origin && radius < 100 && (
            <button type="button" onClick={() => setRadius(100)} className="px-3 py-1.5 rounded-xl bg-zt-surface-2 border border-zt-border-strong text-zt-text font-extrabold text-xs uppercase">
              Widen to 100 miles
            </button>
          )}
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredGyms.map((gym) => (
            <article
              key={gym.id}
              className="bg-zt-surface border border-zt-border rounded-2xl p-5 flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${
                      gym.dayPassAvailability === 'available'
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                        : gym.dayPassAvailability === 'by_appointment'
                        ? 'bg-zt-secondary/20 text-zt-text border-zt-secondary/50'
                        : 'bg-zt-inset text-zt-muted border-zt-border'
                    }`}
                  >
                    {DAY_PASS_LABELS[gym.dayPassAvailability]}
                    {gym.dayPassPriceDisplay ? ` • ${gym.dayPassPriceDisplay}` : ''}
                  </span>

                  {gym.isDemoListing && (
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40">
                      Demo Listing
                    </span>
                  )}
                </div>

                <div>
                  <h2 className="text-lg font-black text-zt-text">
                    <Link href={`/gyms/${gym.slug}`} className="hover:text-zt-primary">
                      {gym.name}
                    </Link>
                  </h2>
                  <div className="text-xs font-bold text-zt-muted flex items-center gap-1.5 mt-0.5">
                    <MapPin className="w-3.5 h-3.5 text-zt-primary" aria-hidden="true" />
                    <span>
                      {gym.city}, {gym.state} •{' '}
                      {gym.streetAddress ? gym.streetAddress : 'Street address: Not provided'}
                    </span>
                    {origin && gymDistanceMiles(gym, origin) !== null && (
                      <span className="ml-1 px-1.5 py-0.5 rounded bg-zt-primary/15 text-zt-primary font-black">
                        {formatMiles(gymDistanceMiles(gym, origin) as number)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-xs text-zt-text-2 space-y-1">
                  <div>
                    <strong className="text-zt-muted">Drop-In Hours:</strong>{' '}
                    {gym.dropInHours || 'Not provided'}
                  </div>
                  <div>
                    <strong className="text-zt-muted">Drop-In Policy:</strong>{' '}
                    {gym.dropInPolicy || 'Not provided'}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-extrabold uppercase text-zt-muted mb-1 flex items-center gap-1">
                    <Dumbbell className="w-3 h-3 text-zt-secondary" aria-hidden="true" />
                    <span>Equipment ({gym.implementTags.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {gym.implementTags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] font-bold px-2 py-0.5 rounded bg-zt-inset border border-zt-border text-zt-text"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-zt-border flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-[11px] font-semibold text-zt-muted flex items-center gap-1">
                  <Calendar className="w-3 h-3" aria-hidden="true" />
                  Updated {gym.lastUpdatedDate}
                </span>

                <div className="flex items-center gap-2">
                  {gym.websiteUrl && (
                    <a
                      href={gym.websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-xl bg-zt-inset border border-zt-border-strong text-zt-text-2 font-bold text-xs inline-flex items-center gap-1 hover:text-zt-text"
                    >
                      Website
                      <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    </a>
                  )}
                  <Link
                    href={`/gyms/${gym.slug}`}
                    className="px-3.5 py-1.5 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase"
                  >
                    Equipment Details →
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}