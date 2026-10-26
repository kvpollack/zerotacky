'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import FollowShowButton from './FollowShowButton';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ExternalLink,
  Info,
  MapPin,
  Radio,
  Trophy,
} from 'lucide-react';
import { describeShowLifecycle } from '@/lib/website/filters';
import { formatShowDate } from '@/lib/website/showHistory';
import { directionsUrl, formatLocalDateTime } from '@/lib/website/format';
import type { DivisionResultsView, PublicShowRecord } from '@/lib/website/types';

interface ShowDetailClientProps {
  show: PublicShowRecord;
  divisionResults: DivisionResultsView[];
}

const SCORING_TYPE_LABELS: Record<string, string> = {
  reps: 'For Reps',
  max_weight: 'Max Weight',
  time_or_distance: 'Fastest Time / Distance if Capped',
  time_or_implements: 'Implements + Time / Split Tiebreaker',
};

export default function ShowDetailClient({ show, divisionResults }: ShowDetailClientProps) {
  const sortedDivisions = [...show.state.divisions].sort((a, b) => a.sortOrder - b.sortOrder);
  const sortedEvents = [...show.state.events].sort((a, b) => a.eventNumber - b.eventNumber);

  const [selectedDivId, setSelectedDivId] = useState<string>(sortedDivisions[0]?.id ?? 'ALL');

  const life = describeShowLifecycle(
    show.competitionStatus,
    show.registrationStatus,
    show.resultsStatus
  );

  const canRegisterInApp =
    show.registrationStatus === 'open' || show.registrationStatus === 'waitlist';

  const visibleDivisionResults =
    selectedDivId === 'ALL'
      ? divisionResults
      : divisionResults.filter((d) => d.division.id === selectedDivId);

  return (
    <div className="space-y-6">
      {/* Back Link */}
      <div>
        <Link
          href="/shows"
          className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase text-zt-muted hover:text-zt-text"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          Back to Show Directory
        </Link>
      </div>

      {/* Persistent Show Header */}
      <section className="bg-zt-surface border border-zt-border rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`text-[10px] font-black uppercase px-2.5 py-1 rounded ${
                show.competitionStatus === 'live'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : show.competitionStatus === 'upcoming'
                  ? 'bg-zt-primary/20 text-zt-primary-2 border border-zt-primary/40'
                  : show.competitionStatus === 'completed'
                  ? 'bg-zt-surface-2 text-zt-text border border-zt-border-strong'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              }`}
            >
              Competition: {life.competitionLabel}
            </span>

            <span className="text-[10px] font-bold uppercase px-2.5 py-1 rounded bg-zt-inset border border-zt-border text-zt-text-2">
              {life.registrationLabel}
            </span>

            <span
              className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded border ${
                life.canRenderOfficialPodium
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                  : 'bg-zt-inset text-zt-muted border-zt-border'
              }`}
            >
              Results: {life.resultsLabel}
            </span>
          </div>

          {show.isDemoFixture && (
            <span className="text-[10px] font-black uppercase px-2 py-1 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40">
              Demo Fixture (Sample Data)
            </span>
          )}
        </div>

        <div className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-black text-zt-text">{show.name}</h1>
          <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm font-bold text-zt-text-2">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-zt-primary" aria-hidden="true" />
              {show.date || 'Not provided'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-zt-secondary" aria-hidden="true" />
              {show.venue.facilityName ? `${show.venue.facilityName}, ` : ''}
              {show.venue.city}, {show.venue.state}
            </span>
            <span>Federation / Format: {show.federation || 'Not provided'}</span>
          </div>
          {show.lastUpdatedIso && (
            <div className="text-[11px] font-semibold text-zt-muted">
              Last updated: <UpdatedStamp iso={show.lastUpdatedIso} />
            </div>
          )}
        </div>

        {show.statusBannerNote && (
          <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs font-bold flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span>{show.statusBannerNote}</span>
          </div>
        )}

        {/* Lifecycle Action Bar */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-zt-border">
          <FollowShowButton slug={show.slug} isDemoFixture={!!show.isDemoFixture} />
          {show.liveScoreboardPath && (
            <Link
              href={show.liveScoreboardPath}
              className="px-4 py-2.5 rounded-xl bg-emerald-500 text-emerald-950 font-black text-xs uppercase tracking-wider inline-flex items-center gap-2 underline-offset-2 hover:underline"
            >
              <Radio className="w-4 h-4" aria-hidden="true" />
              Open Public Live Scoreboard
            </Link>
          )}

          {show.hostGymSlug && (
            <Link
              href={`/gyms/${show.hostGymSlug}`}
              className="px-3.5 py-2.5 rounded-xl bg-zt-inset border border-zt-border-strong text-zt-text font-extrabold text-xs uppercase inline-flex items-center gap-1.5 hover:border-zt-primary"
            >
              Host Gym: {show.hostGymName || show.venue.facilityName} →
            </Link>
          )}

          {show.isDemoFixture ? (
            <button
              type="button"
              disabled
              className="px-3.5 py-2.5 rounded-xl bg-zt-inset border border-zt-border text-zt-muted font-extrabold text-xs uppercase opacity-60 cursor-not-allowed"
            >
              Demo show: registration disabled
            </button>
          ) : show.registration.externalRegistrationUrl ? (
            <a
              href={show.registration.externalRegistrationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2.5 rounded-xl bg-zt-surface-2 border border-zt-border-strong text-zt-text font-extrabold text-xs uppercase inline-flex items-center gap-1.5 hover:border-zt-primary"
            >
              External Registration Page
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
          ) : canRegisterInApp ? (
            <Link
              href={`/register/${show.slug}`}
              className="px-4 py-2.5 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase tracking-wider inline-flex items-center gap-1.5 shadow"
            >
              {show.registrationStatus === 'waitlist' ? 'Join Waitlist →' : 'Register Now →'}
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="px-3.5 py-2.5 rounded-xl bg-zt-inset border border-zt-border text-zt-muted font-extrabold text-xs uppercase opacity-60 cursor-not-allowed"
            >
              {life.registrationLabel}
            </button>
          )}
        </div>
      </section>

      {/* SECTION A: LIVE SHOW CALLOUT */}
      {show.competitionStatus === 'live' && (
        <section
          aria-label="Live competition status"
          className="bg-emerald-950/30 border-2 border-emerald-500/50 rounded-2xl p-5 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-emerald-300">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Live Competition In Progress • Provisional Standings</span>
            </div>
            {show.lastUpdatedIso && (
              <span className="text-[11px] font-bold text-emerald-200/80">
                Snapshot updated: <UpdatedStamp iso={show.lastUpdatedIso} />
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-zt-text-2">
            Spectators can view real-time station callouts and auto-refreshing standings at{' '}
            <Link
              href={show.liveScoreboardPath || `/m/${show.slug}`}
              className="font-mono font-bold text-emerald-300 underline"
            >
              {show.liveScoreboardPath || `/m/${show.slug}`}
            </Link>{' '}
            with no login or volunteer join code required. All live rankings remain provisional
            until the promoter finalizes results.
          </p>
        </section>
      )}

      {/* SECTION B: COMPLETED SHOW — OFFICIAL PODIUMS vs PROVISIONAL WARNING */}
      {show.competitionStatus === 'completed' && (
        <section aria-labelledby="completed-results-heading" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2
              id="completed-results-heading"
              className="text-lg font-black uppercase tracking-wide text-zt-primary flex items-center gap-2"
            >
              <Trophy className="w-5 h-5" aria-hidden="true" />
              <span>
                {life.canRenderOfficialPodium
                  ? `Official Finalized Podiums${show.isDemoFixture ? ' (Demo Results)' : ''}`
                  : 'Provisional Standings, Pending Official Finalization'}
              </span>
            </h2>

            {/* Division Filter */}
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter results by division">
              <button
                type="button"
                onClick={() => setSelectedDivId('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold border ${
                  selectedDivId === 'ALL'
                    ? 'bg-zt-primary text-zt-on-primary border-zt-primary'
                    : 'bg-zt-inset text-zt-muted border-zt-border'
                }`}
              >
                All Divisions ({sortedDivisions.length})
              </button>
              {sortedDivisions.map((div) => (
                <button
                  key={div.id}
                  type="button"
                  onClick={() => setSelectedDivId(div.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold border ${
                    selectedDivId === div.id
                      ? 'bg-zt-primary text-zt-on-primary border-zt-primary'
                      : 'bg-zt-inset text-zt-muted border-zt-border'
                  }`}
                >
                  {div.name}
                </button>
              ))}
            </div>
          </div>

          {!life.canRenderOfficialPodium ? (
            <div className="bg-amber-500/15 border border-amber-500/40 rounded-2xl p-4 text-xs font-bold text-amber-200 space-y-1">
              <div className="uppercase tracking-wider font-black text-amber-300">
                Official Podium Not Yet Certified
              </div>
              <p>
                Although this show&apos;s competition date has passed, its results status is{' '}
                <strong>{life.resultsLabel}</strong>. Official podium cards are only displayed once
                the promoter explicitly marks results as finalized. See the provisional event-by-event
                table below.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {visibleDivisionResults.map((divView) => {
                // Only include finishers with totalPoints > 0 and overallPlace <= 3
                const podiumFinishers = divView.standings.filter(
                  (s) => s.overallPlace <= 3 && s.totalPoints > 0
                );

                return (
                  <div
                    key={divView.division.id}
                    className="bg-zt-surface border border-zt-border rounded-2xl p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-zt-border pb-2">
                      <div>
                        <h3 className="text-base font-black text-zt-text">
                          {divView.division.name}
                        </h3>
                        <span className="text-[11px] font-bold text-zt-muted">
                          {divView.athletes.length} competitor
                          {divView.athletes.length === 1 ? '' : 's'} • Official Final (Demo)
                        </span>
                      </div>
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                        Finalized
                      </span>
                    </div>

                    {podiumFinishers.length === 0 ? (
                      <p className="text-xs font-bold text-zt-muted py-2">
                        No podium finishers recorded for this division.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {podiumFinishers.map((finisher) => (
                          <div
                            key={finisher.athleteId}
                            className="bg-zt-inset border border-zt-border rounded-xl p-3 flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className={`text-xs font-black px-2 py-0.5 rounded ${
                                    finisher.overallPlace === 1
                                      ? 'bg-zt-primary text-zt-on-primary'
                                      : finisher.overallPlace === 2
                                      ? 'bg-zt-secondary text-zt-on-secondary'
                                      : 'bg-zt-surface-2 text-zt-text'
                                  }`}
                                >
                                  {finisher.isTiedOverall
                                    ? `T-#${finisher.overallPlace}`
                                    : `#${finisher.overallPlace}`}
                                </span>
                                <span className="font-black text-sm text-zt-text truncate">
                                  {finisher.athleteName}
                                </span>
                                {finisher.isTiedOverall && (
                                  <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-zt-primary/20 text-zt-primary-2">
                                    Co-Place Tie
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-zt-muted mt-1">
                                Event Wins: <strong className="text-zt-text-2">{finisher.eventWins}</strong>{' '}
                                • Final Ev Pts:{' '}
                                <strong className="text-zt-text-2">{finisher.finalEventPoints}</strong>
                              </div>
                            </div>

                            <div className="text-right flex-shrink-0">
                              <div className="text-xl font-black text-zt-primary">
                                {finisher.totalPoints}
                              </div>
                              <div className="text-[10px] font-bold uppercase text-zt-muted">
                                Total Pts
                              </div>
                            </div>
                          </div>
                        ))}

                        {divView.athletes.length < 3 && (
                          <div className="text-[11px] font-semibold text-zt-muted pt-1">
                            Note: {divView.division.name} had {divView.athletes.length} finisher
                            {divView.athletes.length === 1 ? '' : 's'}; unoccupied podium places are
                            not invented.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* SECTION C: EVENT-BY-EVENT SCOREBOARD & STANDINGS TABLE (For Live or Completed Shows) */}
      {(show.competitionStatus === 'completed' || show.competitionStatus === 'live') && (
        <section aria-labelledby="scoreboard-breakdown-heading" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2
                id="scoreboard-breakdown-heading"
                className="text-base font-black uppercase tracking-wider text-zt-text"
              >
                Event-by-Event Standings &amp; Breakdown
              </h2>
              <p className="text-xs text-zt-muted">
                Read-only view computed via ZeroTacky&apos;s scoring adapter (
                {show.state.meet.tiebreakerRule === 'event_wins'
                  ? 'Tiebreaker: Most Event Wins, then Final Event'
                  : 'Tiebreaker: Final Event Score, then Event Wins'}
                ).
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {visibleDivisionResults.map((divView) => (
              <div
                key={divView.division.id}
                className="bg-zt-surface border border-zt-border rounded-2xl p-4 space-y-3 overflow-x-auto"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-black uppercase text-zt-primary">
                    {divView.division.name} ({divView.standings.length} Athletes)
                  </h3>
                  <span className="text-[11px] font-bold text-zt-muted">
                    {divView.isOfficialFinal ? 'Official Final' : 'Provisional'}
                  </span>
                </div>

                {divView.standings.length === 0 ? (
                  <p className="text-xs font-bold text-zt-muted">
                    No athletes or scores recorded for this division.
                  </p>
                ) : (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-zt-border text-[10px] font-extrabold uppercase text-zt-muted">
                        <th className="py-2 pr-2">Place</th>
                        <th className="py-2 pr-3">Athlete</th>
                        {sortedEvents.map((ev) => (
                          <th key={ev.id} className="py-2 px-2">
                            Ev {ev.eventNumber}: {ev.name}
                          </th>
                        ))}
                        <th className="py-2 px-2 text-right">Wins</th>
                        <th className="py-2 pl-2 text-right">Total Pts</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zt-border">
                      {divView.standings.map((row) => (
                        <tr key={row.athleteId} className="hover:bg-zt-inset/60">
                          <td className="py-2.5 pr-2 font-black text-zt-text whitespace-nowrap">
                            {row.isTiedOverall ? `T-#${row.overallPlace}` : `#${row.overallPlace}`}
                          </td>
                          <td className="py-2.5 pr-3 font-bold text-zt-text whitespace-nowrap">
                            {row.athleteName}
                            {row.status === 'withdrawn' && (
                              <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-zt-danger text-white font-black uppercase">
                                Scratched
                              </span>
                            )}
                          </td>
                          {sortedEvents.map((ev) => {
                            const cell = row.eventBreakdown[ev.id];
                            return (
                              <td key={ev.id} className="py-2.5 px-2 whitespace-nowrap">
                                {cell ? (
                                  <div>
                                    <span className="font-mono font-bold text-zt-text">
                                      {cell.display}
                                    </span>
                                    <span className="ml-1.5 text-[10px] font-extrabold text-zt-primary">
                                      ({cell.points} pts{cell.isTied ? ' • Tie' : ''})
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-zt-muted">—</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="py-2.5 px-2 text-right font-bold text-zt-text-2">
                            {row.eventWins}
                          </td>
                          <td className="py-2.5 pl-2 text-right font-black text-zt-primary text-sm">
                            {row.totalPoints}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* SECTION D: EVENTS, RULES & DIVISION WEIGHT MATRIX (Always available on the persistent URL) */}
      <section aria-labelledby="events-weights-heading" className="space-y-4">
        <div className="space-y-1">
          <h2
            id="events-weights-heading"
            className="text-base font-black uppercase tracking-wider text-zt-primary"
          >
            Events, Rules &amp; Division Weights ({sortedEvents.length} Events)
          </h2>
          <p className="text-xs text-zt-muted">
            Weights and implement callouts by division or strength group. Unavailable details are
            labeled explicitly rather than guessed.
          </p>
        </div>

        <div className="space-y-3">
          {sortedEvents.map((ev) => (
            <div
              key={ev.id}
              className="bg-zt-surface border border-zt-border rounded-2xl p-4 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase px-2 py-0.5 rounded bg-zt-primary text-zt-on-primary">
                    Event {ev.eventNumber}
                  </span>
                  <h3 className="text-base font-black text-zt-text">{ev.name}</h3>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-zt-muted">
                  <span className="px-2 py-0.5 rounded bg-zt-inset border border-zt-border text-zt-text-2">
                    {SCORING_TYPE_LABELS[ev.scoringType] || ev.scoringType}
                  </span>
                  <span>{ev.timeCapSeconds}s Time Cap</span>
                  <span>• {ev.lanes === 2 ? '2 Lanes (Head-to-Head)' : 'Single Lane'}</span>
                </div>
              </div>

              {ev.fixedImplementDescription && (
                <div className="text-xs font-bold text-zt-text-2 bg-zt-inset border border-zt-border rounded-xl px-3 py-2">
                  Implement Spec: {ev.fixedImplementDescription}
                </div>
              )}

              {ev.maxFormat === 'rising_bar' && ev.risingBarWeights && (
                <div className="text-xs font-bold text-zt-text-2 bg-zt-inset border border-zt-border rounded-xl px-3 py-2">
                  Rising Bar Progression: {ev.risingBarWeights.join(' lb → ')} lb
                </div>
              )}

              {/* Division Weights Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {sortedDivisions.map((div) => {
                  const mainWeight = ev.divisionWeights?.[div.id];
                  const lightWeight = ev.divisionLightWeights?.[div.id];
                  const defaultHeight = ev.divisionDefaultHeights?.[div.id];
                  const calloutHeadline = ev.pitCrewCallout?.byDivision?.[div.id]?.headline;

                  let weightDisplay = 'Not provided';
                  if (calloutHeadline) {
                    weightDisplay = calloutHeadline;
                  } else if (typeof mainWeight === 'number' && mainWeight > 0) {
                    weightDisplay = `${mainWeight} lbs${
                      ev.weightIsAddedPlatesOnly
                        ? ' added plates'
                        : ev.weightEntryMode === 'per_hand'
                        ? ' / hand'
                        : ''
                    }`;
                    if (ev.hasTrumpWeight && typeof lightWeight === 'number' && lightWeight > 0) {
                      weightDisplay += ` (Light tier: ${lightWeight} lbs)`;
                    }
                  } else if (ev.weightIsAddedPlatesOnly && mainWeight === 0 && defaultHeight) {
                    weightDisplay = defaultHeight;
                  } else if (ev.fixedImplementDescription) {
                    weightDisplay = ev.fixedImplementDescription;
                  }

                  return (
                    <div
                      key={div.id}
                      className="bg-zt-inset border border-zt-border rounded-xl p-2.5 space-y-0.5"
                    >
                      <div className="text-[11px] font-extrabold text-zt-muted">{div.name}</div>
                      <div className="text-xs font-black text-zt-text">{weightDisplay}</div>
                      {defaultHeight && defaultHeight !== weightDisplay && (
                        <div className="text-[10px] font-bold text-zt-primary-2">
                          {ev.heightLabel || 'Setup'}: {defaultHeight}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION E: VENUE, SCHEDULE & REGISTRATION INFO */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-zt-surface border border-zt-border rounded-2xl p-5 space-y-2.5 text-xs">
          <h2 className="text-sm font-black uppercase tracking-wider text-zt-primary flex items-center gap-1.5">
            <Info className="w-4 h-4" aria-hidden="true" />
            <span>Registration &amp; Weigh-In Details</span>
          </h2>
          <dl className="space-y-2">
            <div className="flex justify-between gap-2 border-b border-zt-border pb-1.5">
              <dt className="font-bold text-zt-muted">Registration Status</dt>
              <dd className="font-black text-zt-text">{life.registrationLabel}</dd>
            </div>
            <div className="flex justify-between gap-2 border-b border-zt-border pb-1.5">
              <dt className="font-bold text-zt-muted">Entry Fee</dt>
              <dd className="font-bold text-zt-text">
                {show.registration.entryFeeDisplay || 'Not provided'}
              </dd>
            </div>
            <div className="flex justify-between gap-2 border-b border-zt-border pb-1.5">
              <dt className="font-bold text-zt-muted">Registration Deadline</dt>
              <dd className="font-bold text-zt-text">
                {show.registration.registrationDeadline || 'Not provided'}
              </dd>
            </div>
            <div className="flex justify-between gap-2 border-b border-zt-border pb-1.5">
              <dt className="font-bold text-zt-muted">Promoter Contact</dt>
              <dd className="font-bold text-zt-text">
                {show.registration.promoterContact || 'Not provided'}
              </dd>
            </div>
            <div className="pt-1">
              <dt className="font-bold text-zt-muted mb-0.5">Weigh-In / Grouping Policy</dt>
              <dd className="font-semibold text-zt-text-2">
                {show.registration.weighInNotes || 'Not provided'}
              </dd>
            </div>
          </dl>
        </div>

        <div className="bg-zt-surface border border-zt-border rounded-2xl p-5 space-y-2.5 text-xs">
          <h2 className="text-sm font-black uppercase tracking-wider text-zt-primary">
            Venue, Schedule &amp; Rules Summary
          </h2>
          <dl className="space-y-2">
            <div>
              <dt className="font-bold text-zt-muted">Facility &amp; Address</dt>
              <dd className="font-bold text-zt-text mt-0.5">
                <div>{show.venue.facilityName || 'Facility not provided'}</div>
                <div className="font-semibold text-zt-text-2">
                  {show.venue.streetAddress ? `${show.venue.streetAddress}, ` : ''}
                  {show.venue.city}, {show.venue.state} {show.venue.postalCode || ''}
                </div>
                {/* MS-14: a map link built from the address on file; nothing is invented when the address is missing */}
                {directionsUrl(show.venue) && (
                  <a
                    href={directionsUrl(show.venue) ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-1 text-zt-primary hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    Directions
                  </a>
                )}
              </dd>
            </div>
            <div>
              <dt className="font-bold text-zt-muted">Schedule Notes</dt>
              <dd className="font-semibold text-zt-text-2 mt-0.5">
                {show.scheduleNotes || 'Not provided'}
              </dd>
            </div>
            <div>
              <dt className="font-bold text-zt-muted">Rules &amp; Scoring Format</dt>
              <dd className="font-semibold text-zt-text-2 mt-0.5">
                {show.rulesSummary || 'Not provided'}
              </dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}

// MS-14: the ISO instant from the server, shown in the reader's local time once mounted. The server render (and the
// first client paint) shows the date only, which is the same string in every zone, so hydration stays clean.
function UpdatedStamp({ iso }: { iso: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return <time dateTime={iso}>{mounted ? formatLocalDateTime(iso) || formatShowDate(iso) : formatShowDate(iso)}</time>;
}
