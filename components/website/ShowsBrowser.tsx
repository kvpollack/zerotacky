'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { filterPublicShows } from '@/lib/website/filters';
import ShowRows from './ShowRows';
import { Cap, KeyButton, textLink } from './sheet';
import type { PublicShowSummary, ShowCompetitionStatus } from '@/lib/website/types';

interface ShowsBrowserProps {
  initialShows: PublicShowSummary[];
  availableStates: string[];
  availableImplements: string[];
}

// Hand redraw in the sheet grammar (11/5, sweep item 5): one ruled block, a cap over each input, count + reset in the
// bottom row. The rows themselves are ShowRows (Phase 3).
export default function ShowsBrowser({
  initialShows,
  availableStates,
  availableImplements,
}: ShowsBrowserProps) {
  const [search, setSearch] = useState('');
  const [competitionStatus, setCompetitionStatus] = useState<ShowCompetitionStatus | 'ALL'>('ALL');
  const [stateFilter, setStateFilter] = useState<string>('ALL');
  const [implementTag, setImplementTag] = useState<string>('ALL');
  const [federation, setFederation] = useState<string>('ALL');
  const [divisionQuery, setDivisionQuery] = useState<string>('');

  const availableFederations = useMemo(() => {
    const set = new Set<string>();
    for (const s of initialShows) {
      if (s.federation?.trim()) set.add(s.federation.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [initialShows]);

  const filteredShows = useMemo(
    () =>
      filterPublicShows(initialShows, {
        search,
        competitionStatus,
        state: stateFilter,
        implementTag,
        federation,
        divisionQuery,
      }),
    [initialShows, search, competitionStatus, stateFilter, implementTag, federation, divisionQuery]
  );

  const hasActiveFilters =
    search.trim() !== '' ||
    competitionStatus !== 'ALL' ||
    stateFilter !== 'ALL' ||
    implementTag !== 'ALL' ||
    federation !== 'ALL' ||
    divisionQuery.trim() !== '';

  const resetFilters = () => {
    setSearch('');
    setCompetitionStatus('ALL');
    setStateFilter('ALL');
    setImplementTag('ALL');
    setFederation('ALL');
    setDivisionQuery('');
  };

  return (
    <div className="space-y-5">
      {/* Filter bar */}
      <section aria-label="Filter strongman shows" className="zt-block grid-cols-1">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-4 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="show-search-input"><Cap as="span">Search show, venue, or event</Cap></label>
            <input
              id="show-search-input"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="e.g. Strongfest, Aston, York, Basket Deadlift, Circus Dumbbell..."
              className="zt-input"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="show-division-input"><Cap as="span">Division or class</Cap></label>
            <input
              id="show-division-input"
              type="text"
              value={divisionQuery}
              onChange={(e) => setDivisionQuery(e.target.value)}
              placeholder="e.g. Group 4, 105kg, Tier 2, Masters..."
              className="zt-input"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="show-status-select"><Cap as="span">Status</Cap></label>
            <select
              id="show-status-select"
              value={competitionStatus}
              onChange={(e) => setCompetitionStatus(e.target.value as ShowCompetitionStatus | 'ALL')}
              className="zt-input"
            >
              <option value="ALL">All Statuses</option>
              <option value="upcoming">Upcoming</option>
              <option value="live">Live Now</option>
              <option value="completed">Completed</option>
              <option value="postponed">Postponed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="show-state-select"><Cap as="span">State</Cap></label>
            <select id="show-state-select" value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} className="zt-input">
              <option value="ALL">All States</option>
              {availableStates.map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="show-implement-select"><Cap as="span">Implement</Cap></label>
            <select id="show-implement-select" value={implementTag} onChange={(e) => setImplementTag(e.target.value)} className="zt-input">
              <option value="ALL">Any Implement</option>
              {availableImplements.map((imp) => (
                <option key={imp} value={imp}>{imp}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="show-federation-select"><Cap as="span">Federation</Cap></label>
            <select id="show-federation-select" value={federation} onChange={(e) => setFederation(e.target.value)} className="zt-input">
              <option value="ALL">Any Federation / Unsanctioned</option>
              {availableFederations.map((fed) => (
                <option key={fed} value={fed}>{fed}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-5 text-[13px]">
          <div className="text-ink-muted">
            Showing <strong className="text-ink">{filteredShows.length}</strong> of {initialShows.length} shows
          </div>
          {hasActiveFilters && (
            <button type="button" onClick={resetFilters} className={textLink}>Reset filters</button>
          )}
        </div>
      </section>

      {/* Results list or empty state */}
      {filteredShows.length === 0 ? (
        <div className="zt-block grid-cols-1">
          <div className="flex flex-col items-start gap-3 px-5 py-6 sm:px-7">
            <div className="text-[22px] font-bold leading-tight text-ink">No strongman shows match your current filters.</div>
            <p className="text-[13px] leading-snug text-ink-muted max-w-md">
              Try clearing the implement, division, or state filter to see all upcoming, live, and completed shows.
            </p>
            <KeyButton variant="ink" onClick={resetFilters}>Reset all filters</KeyButton>
          </div>
        </div>
      ) : (
        <ShowRows shows={filteredShows} detail />
      )}
    </div>
  );
}
