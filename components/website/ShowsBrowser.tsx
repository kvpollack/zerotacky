'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Calendar, Filter, MapPin, RotateCcw, Search } from 'lucide-react';
import { describeShowLifecycle, filterPublicShows } from '@/lib/website/filters';
import type { PublicShowSummary, ShowCompetitionStatus } from '@/lib/website/types';

interface ShowsBrowserProps {
  initialShows: PublicShowSummary[];
  availableStates: string[];
  availableImplements: string[];
}

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
      {/* Structured Filter Bar */}
      <section
        aria-label="Filter strongman shows"
        className="bg-zt-surface border border-zt-border rounded-2xl p-4 space-y-4"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Text Search */}
          <div className="md:col-span-2">
            <label
              htmlFor="show-search-input"
              className="block text-[11px] font-extrabold uppercase text-zt-muted mb-1"
            >
              Search by Show Name, City, Venue, or Implement
            </label>
            <div className="relative">
              <Search
                className="w-4 h-4 text-zt-muted absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                id="show-search-input"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="e.g. Strongfest, Aston, York, Basket Deadlift, Circus Dumbbell..."
                className="w-full bg-zt-inset border border-zt-border-strong rounded-xl pl-9 pr-3 py-2.5 text-xs sm:text-sm font-bold text-zt-text focus:outline-none focus:border-zt-primary"
              />
            </div>
          </div>

          {/* Division / Group Filter (Supports inclusive groups and weight classes) */}
          <div>
            <label
              htmlFor="show-division-input"
              className="block text-[11px] font-extrabold uppercase text-zt-muted mb-1"
            >
              Division or Group Filter (Optional)
            </label>
            <input
              id="show-division-input"
              type="text"
              value={divisionQuery}
              onChange={(e) => setDivisionQuery(e.target.value)}
              placeholder="e.g. Group 4, 105kg, Tier 2, Masters..."
              className="w-full bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2.5 text-xs sm:text-sm font-bold text-zt-text focus:outline-none focus:border-zt-primary"
            />
          </div>
        </div>

        {/* Status Pill Bar + Dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          <div>
            <label
              htmlFor="show-status-select"
              className="block text-[11px] font-extrabold uppercase text-zt-muted mb-1"
            >
              Competition Status
            </label>
            <select
              id="show-status-select"
              value={competitionStatus}
              onChange={(e) =>
                setCompetitionStatus(e.target.value as ShowCompetitionStatus | 'ALL')
              }
              className="w-full bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-xs font-bold text-zt-text"
            >
              <option value="ALL">All Statuses</option>
              <option value="upcoming">Upcoming</option>
              <option value="live">Live Now</option>
              <option value="completed">Completed</option>
              <option value="postponed">Postponed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="show-state-select"
              className="block text-[11px] font-extrabold uppercase text-zt-muted mb-1"
            >
              State / Location
            </label>
            <select
              id="show-state-select"
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
              htmlFor="show-implement-select"
              className="block text-[11px] font-extrabold uppercase text-zt-muted mb-1"
            >
              Implement / Equipment
            </label>
            <select
              id="show-implement-select"
              value={implementTag}
              onChange={(e) => setImplementTag(e.target.value)}
              className="w-full bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-xs font-bold text-zt-text"
            >
              <option value="ALL">Any Implement</option>
              {availableImplements.map((imp) => (
                <option key={imp} value={imp}>
                  {imp}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="show-federation-select"
              className="block text-[11px] font-extrabold uppercase text-zt-muted mb-1"
            >
              Federation / Format (Optional)
            </label>
            <select
              id="show-federation-select"
              value={federation}
              onChange={(e) => setFederation(e.target.value)}
              className="w-full bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-xs font-bold text-zt-text"
            >
              <option value="ALL">Any Federation / Unsanctioned</option>
              {availableFederations.map((fed) => (
                <option key={fed} value={fed}>
                  {fed}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zt-border text-xs">
          <div className="font-bold text-zt-muted flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-zt-primary" aria-hidden="true" />
            <span>
              Showing <strong className="text-zt-text">{filteredShows.length}</strong> of{' '}
              {initialShows.length} shows
            </span>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="px-3 py-1.5 rounded-xl bg-zt-surface-2 border border-zt-border-strong text-zt-text font-extrabold text-xs uppercase flex items-center gap-1.5 hover:border-zt-primary"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              Reset Filters
            </button>
          )}
        </div>
      </section>

      {/* Results List or Empty State */}
      {filteredShows.length === 0 ? (
        <div className="bg-zt-surface border border-zt-border rounded-2xl p-8 text-center space-y-3">
          <div className="text-base font-black text-zt-text">
            No strongman shows match your current filters.
          </div>
          <p className="text-xs text-zt-muted max-w-md mx-auto">
            Try clearing the implement, division, or state filter to see all upcoming, live, and
            completed demo competitions.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase tracking-wider"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            Reset All Filters
          </button>
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredShows.map((show) => {
            const life = describeShowLifecycle(
              show.competitionStatus,
              show.registrationStatus,
              show.resultsStatus
            );

            return (
              <article
                key={show.id}
                className="bg-zt-surface border border-zt-border rounded-2xl p-4 sm:p-5 space-y-3.5 hover:border-zt-border-strong transition"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                        show.competitionStatus === 'live'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : show.competitionStatus === 'upcoming'
                          ? 'bg-zt-primary/20 text-zt-primary-2 border border-zt-primary/40'
                          : show.competitionStatus === 'completed'
                          ? 'bg-zt-surface-2 text-zt-text border border-zt-border-strong'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      }`}
                    >
                      {life.competitionLabel}
                    </span>

                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-zt-inset border border-zt-border text-zt-text-2">
                      {life.registrationLabel}
                    </span>

                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                        life.canRenderOfficialPodium
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                          : 'bg-zt-inset text-zt-muted border-zt-border'
                      }`}
                    >
                      {life.resultsLabel}
                    </span>
                  </div>

                  {show.isDemoFixture && (
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40">
                      Demo Fixture
                    </span>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h2 className="text-lg sm:text-xl font-black text-zt-text">
                      <Link href={`/shows/${show.slug}`} className="hover:text-zt-primary">
                        {show.name}
                      </Link>
                    </h2>
                    <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-zt-muted">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-zt-primary" aria-hidden="true" />
                        {show.date}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-zt-secondary" aria-hidden="true" />
                        {show.venue.facilityName ? `${show.venue.facilityName} • ` : ''}
                        {show.venue.city}, {show.venue.state}
                      </span>
                      {show.federation && (
                        <span className="text-zt-text-2">Format: {show.federation}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                    {show.competitionStatus === 'live' && show.liveScoreboardPath && !show.isDemoFixture && (
                      <Link
                        href={show.liveScoreboardPath}
                        className="px-3.5 py-2 rounded-xl bg-emerald-500 text-emerald-950 font-black text-xs uppercase tracking-wider"
                      >
                        Live Scoreboard
                      </Link>
                    )}
                    <Link
                      href={`/shows/${show.slug}`}
                      className="px-4 py-2 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase tracking-wider"
                    >
                      {show.competitionStatus === 'completed'
                        ? 'View Results & Breakdown'
                        : 'View Show Details'}
                    </Link>
                  </div>
                </div>

                {show.summaryNote && (
                  <p className="text-xs text-zt-text-2 leading-relaxed">{show.summaryNote}</p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-zt-border text-xs">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase text-zt-muted block mb-1">
                      Divisions / Strength Groups ({show.divisionLabels.length})
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {show.divisionLabels.map((div) => (
                        <span
                          key={div}
                          className="text-[10px] font-bold px-2 py-0.5 rounded bg-zt-inset border border-zt-border text-zt-text"
                        >
                          {div}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] font-extrabold uppercase text-zt-muted block mb-1">
                      Implements ({show.implementTags.length})
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {show.implementTags.map((imp) => (
                        <span
                          key={imp}
                          className="text-[10px] font-bold px-2 py-0.5 rounded bg-zt-surface-2 text-zt-primary-2"
                        >
                          {imp}
                        </span>
                      ))}
                    </div>
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