'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import FollowShowButton from './FollowShowButton';
import { Cap, Key, KeyButton, WebCell, keyClass, textLink } from './sheet';
import { describeShowLifecycle } from '@/lib/website/filters';
import { formatShowDate } from '@/lib/website/showHistory';
import { directionsUrl, eventWeightDisplay, formatLocalDateTime } from '@/lib/website/format';
import { specSegments } from '@/lib/events/spec';
import { showTrainingNeeds, trainForShowHref } from '@/lib/website/trainFor';
import { prepSheetHref } from '@/lib/website/prepSheet';
import { safeVideoUrl, specNotes } from '@/lib/events/spec';
import { longIsoDate, shortIsoDate, splitFee, venueLine } from '@/lib/website/sheetFormat';
import { hasScheduleTimes, icsHref, scheduleTimeZone, scheduleTimeline, shiftIsoDate, timeZoneLabel } from '@/lib/website/schedule';
import type { DivisionResultsView, PublicShowRecord } from '@/lib/website/types';

// Show sheet (UI transition Phase 3, 11/2; mockup hybrid/web_show.html). Promoter band in the show's accent (the
// frame resolves it; refused or absent = ink), facts strip, then the sections the 10/26 page had, drawn as ruled
// blocks: live callout, podiums, event-by-event standings, the events x divisions matrix (events as rows, divisions
// as columns: Kurt 10/17, 10/27, so an athlete reads their column top to bottom), venue / schedule / rules and the
// registration block. Copy unchanged.
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

const GROUPING_LABELS: Record<PublicShowRecord['divisionGroupingStyle'], string> = {
  inclusive_strength_groups: 'Inclusive strength groups',
  traditional_weight_classes: 'Traditional weight classes',
  mixed: 'Mixed',
};

// numerals set in pen, like a filled-in value
const NUM = 'font-sheet text-pen';
const FACT_V = 'text-[15px] font-bold leading-snug text-ink';
const FACT_S = 'block text-[13px] font-normal text-ink-muted';
const TH = 'text-left text-xs tracking-[0.06em] uppercase font-normal text-ink-muted px-3 py-2.5 border border-rule bg-sheet';
const TD = 'px-3 py-2.5 border border-rule align-top';
const DT = 'text-xs tracking-[0.06em] uppercase text-ink-muted';
const DD = 'text-[15px] text-ink leading-snug';

export default function ShowDetailClient({ show, divisionResults }: ShowDetailClientProps) {
  const sortedDivisions = [...show.state.divisions].sort((a, b) => a.sortOrder - b.sortOrder);
  const sortedEvents = [...show.state.events].sort((a, b) => a.eventNumber - b.eventNumber);
  const trainHref = trainForShowHref(show, showTrainingNeeds(sortedEvents));

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

  const athleteCount = show.state.athletes.length;
  const directions = directionsUrl(show.venue, { demo: show.isDemoFixture });
  const liveHref = show.liveScoreboardPath || `/m/${show.slug}`;
  const fee = splitFee(show.registration.entryFeeDisplay);

  return (
    <div className="flex flex-col gap-7">
      {/* Back Link */}
      <div>
        <Link href="/shows" className="inline-flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-[0.04em] text-ink-muted hover:text-ink no-underline">
          <span aria-hidden="true">←</span>
          Back to Show Directory
        </Link>
      </div>

      {/* Promoter band: the one place on this page the show's colour fills */}
      <div>
        <div className="bg-slot text-slot-label border-2 border-b-0 border-rule flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-5 sm:px-7 min-h-16 py-3 text-[15px] sm:text-lg leading-snug">
          <h1 className="font-normal">
            <span className="font-bold text-xl sm:text-[22px]">{show.name}</span>
            <span className="opacity-60 mx-3.5" aria-hidden="true">·</span>
            <span>{show.date ? longIsoDate(show.date) : 'Not provided'}</span>
            <span className="opacity-60 mx-3.5" aria-hidden="true">·</span>
            <span>{venueLine(show.venue)}</span>
          </h1>
          <div className="text-[13px] sm:text-[15px] uppercase tracking-[0.04em]">
            <span>Competition: {life.competitionLabel}</span>
            <span className="opacity-60 mx-3.5" aria-hidden="true">·</span>
            <span>Results: {life.resultsLabel}</span>
            {show.isDemoFixture && (
              <>
                <span className="opacity-60 mx-3.5" aria-hidden="true">·</span>
                <span>Demo Fixture (Sample Data)</span>
              </>
            )}
          </div>
        </div>

        {/* Facts strip */}
        <section aria-label="Show facts" className="zt-block border-t-0 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <WebCell pad="sm" className="min-h-[84px] justify-center gap-1 px-4">
            <Cap>Date</Cap>
            <div className={`${NUM} text-[28px] leading-none`}>{show.date ? shortIsoDate(show.date) : <span className="text-ink-muted text-[15px] font-sans">Not provided</span>}</div>
          </WebCell>
          <WebCell pad="sm" className="min-h-[84px] justify-center gap-1 px-4">
            <Cap>Venue</Cap>
            <div className={FACT_V}>
              {show.venue.facilityName || 'Facility not provided'}
              <span className={FACT_S}>{show.venue.city}, {show.venue.state}</span>
            </div>
          </WebCell>
          <WebCell pad="sm" className="min-h-[84px] justify-center gap-1 px-4">
            <Cap>Federation / Format</Cap>
            <div className={FACT_V}>
              {show.federation || 'Not provided'}
              <span className={FACT_S}>{GROUPING_LABELS[show.divisionGroupingStyle]}</span>
            </div>
          </WebCell>
          <WebCell pad="sm" className="min-h-[84px] justify-center gap-1 px-4">
            <Cap>Athletes</Cap>
            <div className={`${NUM} text-[28px] leading-none`}>
              {athleteCount}
              {show.registration.athleteCap ? <span className="font-sans text-[13px] text-ink-muted"> / {show.registration.athleteCap} cap</span> : null}
            </div>
          </WebCell>
          <WebCell pad="sm" className="min-h-[84px] justify-center gap-1 px-4">
            <Cap>Registration</Cap>
            <div className={FACT_V}>{life.registrationLabel}</div>
          </WebCell>
          <WebCell pad="sm" className="min-h-[84px] justify-center gap-1 px-4">
            <Cap>Live board</Cap>
            {show.liveScoreboardPath ? (
              <Link href={show.liveScoreboardPath} className="text-[13px] font-bold text-pen underline underline-offset-4 decoration-1 break-all leading-snug">{show.liveScoreboardPath}</Link>
            ) : (
              <div className={`${FACT_V} text-ink-muted font-normal`}>Not published</div>
            )}
          </WebCell>
        </section>

        {show.lastUpdatedIso && (
          <div className="text-[12px] text-ink-muted mt-2">
            Last updated: <UpdatedStamp iso={show.lastUpdatedIso} />
          </div>
        )}
      </div>

      {show.statusBannerNote && (
        <div role="note" className="zt-block grid-cols-1">
          <WebCell className="gap-1">
            <Cap>Note</Cap>
            <p className="text-[15px] font-bold text-ink">{show.statusBannerNote}</p>
          </WebCell>
        </div>
      )}

      {/* SECTION A: LIVE SHOW CALLOUT */}
      {show.competitionStatus === 'live' && (
        <section aria-label="Live competition status" className="zt-block grid-cols-1">
          <WebCell className="gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 text-[13px] font-bold uppercase tracking-[0.04em] text-pen">
                <span className="w-2.5 h-2.5 bg-pen animate-pulse" aria-hidden="true" />
                <span>Live Competition In Progress • Provisional Standings</span>
              </div>
              {show.lastUpdatedIso && (
                <span className="text-[12px] text-ink-muted">
                  Snapshot updated: <UpdatedStamp iso={show.lastUpdatedIso} />
                </span>
              )}
            </div>
            <p className="text-[15px] leading-[1.55] text-ink max-w-[760px]">
              Spectators can view real-time station callouts and auto-refreshing standings at{' '}
              <Link href={liveHref} className={`${textLink} text-pen`}>{liveHref}</Link>{' '}
              with no login or volunteer join code required. All live rankings remain provisional
              until the promoter finalizes results.
            </p>
          </WebCell>
        </section>
      )}

      {/* SECTION B: COMPLETED SHOW — OFFICIAL PODIUMS vs PROVISIONAL WARNING */}
      {show.competitionStatus === 'completed' && (
        <section aria-labelledby="completed-results-heading">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-2.5">
            <h2 id="completed-results-heading" className="text-[22px] font-bold leading-tight text-ink">
              {life.canRenderOfficialPodium
                ? `Official Finalized Podiums${show.isDemoFixture ? ' (Demo Results)' : ''}`
                : 'Provisional Standings, Pending Official Finalization'}
            </h2>

            {/* Division Filter */}
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter results by division">
              <KeyButton variant={selectedDivId === 'ALL' ? 'ink' : 'line'} className="min-h-9 px-3 text-xs" onClick={() => setSelectedDivId('ALL')} aria-pressed={selectedDivId === 'ALL'}>
                All Divisions ({sortedDivisions.length})
              </KeyButton>
              {sortedDivisions.map((div) => (
                <KeyButton key={div.id} variant={selectedDivId === div.id ? 'ink' : 'line'} className="min-h-9 px-3 text-xs" onClick={() => setSelectedDivId(div.id)} aria-pressed={selectedDivId === div.id}>
                  {div.name}
                </KeyButton>
              ))}
            </div>
          </div>

          {!life.canRenderOfficialPodium ? (
            <div className="zt-block grid-cols-1">
              <WebCell className="gap-1">
                <Cap>Official Podium Not Yet Certified</Cap>
                <p className="text-[15px] leading-[1.55] text-ink max-w-[760px]">
                  Although this show&apos;s competition date has passed, its results status is{' '}
                  <strong>{life.resultsLabel}</strong>. Official podium cards are only displayed once
                  the promoter explicitly marks results as finalized. See the provisional event-by-event
                  table below.
                </p>
              </WebCell>
            </div>
          ) : (
            <div className={`zt-block grid-cols-1 ${visibleDivisionResults.length > 1 ? 'md:grid-cols-2' : ''}`}>
              {visibleDivisionResults.map((divView) => {
                // Only include finishers with totalPoints > 0 and overallPlace <= 3
                const podiumFinishers = divView.standings.filter(
                  (s) => s.overallPlace <= 3 && s.totalPoints > 0
                );

                return (
                  <WebCell key={divView.division.id} pad="none" className="gap-0">
                    <div className="flex items-center justify-between gap-2 px-5 py-3 border-b border-rule">
                      <div>
                        <h3 className="text-base font-bold text-ink">{divView.division.name}</h3>
                        <span className="text-[12px] text-ink-muted">
                          {divView.athletes.length} competitor
                          {divView.athletes.length === 1 ? '' : 's'} • Official Final (Demo)
                        </span>
                      </div>
                      <span className="text-xs uppercase tracking-[0.04em] font-bold text-ink">Finalized</span>
                    </div>

                    {podiumFinishers.length === 0 ? (
                      <p className="text-[13px] text-ink-muted px-5 py-4">
                        No podium finishers recorded for this division.
                      </p>
                    ) : (
                      <div>
                        {podiumFinishers.map((finisher) => (
                          <div key={finisher.athleteId} className="grid grid-cols-[56px_1fr_auto] items-center gap-3 px-5 py-2.5 border-b border-rule last:border-b-0">
                            <div className={`${NUM} text-[28px] leading-none`}>
                              {finisher.isTiedOverall ? `T${finisher.overallPlace}` : finisher.overallPlace}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-[15px] text-ink truncate">{finisher.athleteName}</span>
                                {finisher.isTiedOverall && (
                                  <span className="text-[11px] uppercase tracking-[0.04em] text-pen font-bold">Co-Place Tie</span>
                                )}
                              </div>
                              <div className="text-[12px] text-ink-muted mt-0.5">
                                Event Wins: <strong className="text-ink">{finisher.eventWins}</strong>{' '}
                                • Final Ev Pts: <strong className="text-ink">{finisher.finalEventPoints}</strong>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className={`${NUM} text-[22px] leading-none`}>{finisher.totalPoints}</div>
                              <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mt-1">Total Pts</div>
                            </div>
                          </div>
                        ))}

                        {divView.athletes.length < 3 && (
                          <div className="text-[12px] text-ink-muted px-5 py-2.5">
                            Note: {divView.division.name} had {divView.athletes.length} finisher
                            {divView.athletes.length === 1 ? '' : 's'}; unoccupied podium places are
                            not invented.
                          </div>
                        )}
                      </div>
                    )}
                  </WebCell>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* SECTION C: EVENT-BY-EVENT SCOREBOARD & STANDINGS TABLE (For Live or Completed Shows) */}
      {(show.competitionStatus === 'completed' || show.competitionStatus === 'live') && (
        <section aria-labelledby="scoreboard-breakdown-heading" className="flex flex-col gap-4">
          <div>
            <h2 id="scoreboard-breakdown-heading" className="text-[22px] font-bold leading-tight text-ink">
              Event-by-Event Standings &amp; Breakdown
            </h2>
            <p className="text-[13px] text-ink-muted mt-1">
              Read-only view computed via ZeroTacky&apos;s scoring adapter (
              {show.state.meet.tiebreakerRule === 'event_wins'
                ? 'Tiebreaker: Most Event Wins, then Final Event'
                : 'Tiebreaker: Final Event Score, then Event Wins'}
              ).
            </p>
          </div>

          {visibleDivisionResults.map((divView) => (
            <div key={divView.division.id}>
              <div className="flex items-end justify-between gap-2 mb-2">
                <h3 className="text-base font-bold text-ink">
                  {divView.division.name} ({divView.standings.length} Athletes)
                </h3>
                <span className="text-xs uppercase tracking-[0.06em] text-ink-muted">
                  {divView.isOfficialFinal ? 'Official Final' : 'Provisional'}
                </span>
              </div>

              {divView.standings.length === 0 ? (
                <p className="text-[13px] text-ink-muted">No athletes or scores recorded for this division.</p>
              ) : (
                <div className="overflow-x-auto border-2 border-rule">
                  <table className="w-full text-left border-collapse text-[13px]">
                    <thead>
                      <tr>
                        <th scope="col" className={TH}>Place</th>
                        <th scope="col" className={TH}>Athlete</th>
                        {sortedEvents.map((ev) => (
                          <th key={ev.id} scope="col" className={`${TH} whitespace-nowrap`}>
                            Ev {ev.eventNumber}: {ev.name}
                          </th>
                        ))}
                        <th scope="col" className={`${TH} text-right`}>Wins</th>
                        <th scope="col" className={`${TH} text-right`}>Total Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {divView.standings.map((row) => (
                        <tr key={row.athleteId}>
                          <td className={`${TD} ${NUM} text-xl leading-none whitespace-nowrap`}>
                            {row.isTiedOverall ? `T${row.overallPlace}` : row.overallPlace}
                          </td>
                          <td className={`${TD} font-bold text-ink whitespace-nowrap`}>
                            {row.athleteName}
                            {row.status === 'withdrawn' && (
                              <span className="ml-2 text-[11px] uppercase tracking-[0.04em] text-redpen font-bold">Scratched</span>
                            )}
                          </td>
                          {sortedEvents.map((ev) => {
                            const cell = row.eventBreakdown[ev.id];
                            return (
                              <td key={ev.id} className={`${TD} whitespace-nowrap`}>
                                {cell ? (
                                  <div>
                                    <span className={`${NUM} text-base`}>{cell.display}</span>
                                    <span className="ml-1.5 text-[11px] text-ink-muted">
                                      ({cell.points} pts{cell.isTied ? ' • Tie' : ''})
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-ink-muted">—</span>
                                )}
                              </td>
                            );
                          })}
                          <td className={`${TD} text-right ${NUM} text-base`}>{row.eventWins}</td>
                          <td className={`${TD} text-right ${NUM} text-xl leading-none`}>{row.totalPoints}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {/* SECTION D: EVENTS, RULES & DIVISION WEIGHT MATRIX (Always available on the persistent URL).
          Kurt 10/17 / 10/27: one matrix, events as rows and divisions as columns, so an athlete reads their column
          top to bottom. Scrolls sideways on phones with the event column pinned. Implement specs and rising-bar
          progressions are footnotes under the table. */}
      <section aria-labelledby="events-weights-heading">
        <div className="mb-2.5 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 id="events-weights-heading" className="text-[22px] font-bold leading-tight text-ink">
              Events &amp; Weights by Division ({sortedEvents.length} Events)
            </h2>
            <p className="text-[13px] text-ink-muted mt-1">
              Find your division across the top and read down. Details the promoter has not entered say so
              rather than guessing.
            </p>
          </div>
          {/* Comp-prep sheet (11/5, gaps #15): the same events as a printable training sheet with a CSV, for the division
              picked in the standings strip (or all). */}
          {sortedEvents.length > 0 && (
            <Key href={prepSheetHref(show.slug, selectedDivId)} variant="line" className="!min-h-10 !px-4 !text-[12px] shrink-0">Prep sheet</Key>
          )}
        </div>

        <div className="border-2 border-rule">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] border-collapse">
              <thead>
                <tr>
                  <th scope="col" className={`${TH} sticky left-0 z-10 min-w-[13rem]`}>Event</th>
                  {sortedDivisions.map((div) => (
                    <th key={div.id} scope="col" className={`${TH} text-ink font-bold normal-case tracking-normal text-[15px] min-w-[9rem] whitespace-nowrap`}>
                      {div.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedEvents.map((ev) => (
                  <tr key={ev.id}>
                    <th scope="row" className={`${TD} sticky left-0 z-10 bg-sheet text-left font-normal`}>
                      <div className="flex items-baseline gap-2">
                        <span className={`${NUM} text-base`}>E{ev.eventNumber}</span>
                        <span className="font-bold text-[15px] text-ink">{ev.name}</span>
                      </div>
                      <div className="text-[12px] text-ink-muted mt-1">
                        {SCORING_TYPE_LABELS[ev.scoringType] || ev.scoringType} · {ev.timeCapSeconds}s cap
                        {ev.lanes === 2 ? ' · 2 lanes' : ''}
                      </div>
                      {/* Event spec starter (11/4): implement, course and equipment rules, with a video link when given */}
                      {(specSegments(ev.spec).length > 0 || safeVideoUrl(ev.spec?.videoUrl)) && (
                        <div className="text-[12px] text-ink mt-1 whitespace-normal">
                          {specSegments(ev.spec).join(' · ')}
                          {safeVideoUrl(ev.spec?.videoUrl) && (
                            <>
                              {specSegments(ev.spec).length > 0 ? ' · ' : ''}
                              <a href={safeVideoUrl(ev.spec?.videoUrl) ?? undefined} target="_blank" rel="noopener noreferrer" className={textLink}>Video</a>
                            </>
                          )}
                        </div>
                      )}
                    </th>
                    {sortedDivisions.map((div) => {
                      const w = eventWeightDisplay(ev, div.id);
                      return (
                        <td key={div.id} className={TD}>
                          <div className={w.main ? `${NUM} text-[22px] leading-none` : 'text-ink-muted'}>{w.main || 'Not provided'}</div>
                          {w.kg && <div className="text-[12px] text-ink-muted mt-1">{w.kg}</div>}
                          {w.setup && <div className="text-[12px] text-ink-muted mt-1">{w.setup}</div>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sortedEvents.some((ev) => ev.fixedImplementDescription || specNotes(ev.spec) || (ev.maxFormat === 'rising_bar' && ev.risingBarWeights)) && (
            <ul className="border-t border-rule px-3 py-2.5 space-y-1 text-[13px] text-ink">
              {sortedEvents.map((ev) => (
                <React.Fragment key={ev.id}>
                  {ev.fixedImplementDescription && (
                    <li><span className="text-ink-muted">Ev {ev.eventNumber} implement:</span> {ev.fixedImplementDescription}</li>
                  )}
                  {specNotes(ev.spec) && (
                    <li><span className="text-ink-muted">Ev {ev.eventNumber} notes:</span> {specNotes(ev.spec)}</li>
                  )}
                  {ev.maxFormat === 'rising_bar' && ev.risingBarWeights && (
                    <li><span className="text-ink-muted">Ev {ev.eventNumber} rising bar:</span> <span className={NUM}>{ev.risingBarWeights.join(' lb → ')}</span> lb</li>
                  )}
                </React.Fragment>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* SECTION E: VENUE, SCHEDULE & REGISTRATION INFO. Text on the left, the registration block on the right. */}
      <section className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-7 items-start">
        <div className="px-1">
          <h2 className="text-[22px] font-bold leading-tight text-ink mb-3">Venue, Schedule &amp; Rules Summary</h2>
          <dl className="space-y-4">
            <div>
              <dt className={DT}>Facility &amp; Address</dt>
              <dd className={`${DD} mt-1`}>
                <div className="font-bold">{show.venue.facilityName || 'Facility not provided'}</div>
                <div>
                  {show.venue.streetAddress ? `${show.venue.streetAddress}, ` : ''}
                  {show.venue.city}, {show.venue.state} {show.venue.postalCode || ''}
                </div>
                {/* MS-14: a map link built from the address on file; nothing is invented when the address is missing or
                    a placeholder, and demo fixtures (made-up venues) get none (Astra LT-05/06) */}
                {directions && (
                  <a href={directions} target="_blank" rel="noopener noreferrer" className={`${textLink} inline-flex items-center gap-1 mt-1 text-[13px]`}>
                    Directions ↗
                  </a>
                )}
              </dd>
            </div>
            <div>
              <dt className={DT}>Meet-Day Schedule</dt>
              <dd className={`${DD} mt-1 leading-[1.55] max-w-[760px]`}>
                {/* 044 (gaps #7a): the promoter's structured timeline, else the legacy free-text note, else 'Not provided'. */}
                {hasScheduleTimes(show.schedule) ? (
                  <>
                    <table className="w-full max-w-[520px] text-[14px] border-collapse">
                      <tbody>
                        {scheduleTimeline(show.schedule).map((row) => (
                          <tr key={row.label} className="border-b border-rule last:border-b-0">
                            <th scope="row" className="text-left font-normal text-ink-muted py-1.5 pr-4 align-top">
                              {row.label}
                              {row.dayBefore && show.date ? <span className="block text-[12px]">{longIsoDate(shiftIsoDate(show.date, -1))}</span> : null}
                            </th>
                            <td className={`${NUM} text-[15px] py-1.5 text-right whitespace-nowrap align-top`}>{row.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="text-[12px] text-ink-muted mt-1.5">
                      Times are {timeZoneLabel(scheduleTimeZone(show.schedule, show.venue.state))}.
                      {show.schedule?.notes ? <span className="block mt-1 text-[13px] text-ink">{show.schedule.notes}</span> : null}
                    </div>
                    {!show.isDemoFixture && show.date ? (
                      <a href={icsHref(show.slug)} className={`${textLink} inline-flex items-center gap-1 mt-2 text-[13px]`} download>
                        Add to calendar (.ics)
                      </a>
                    ) : null}
                  </>
                ) : (
                  show.scheduleNotes || 'Not provided'
                )}
              </dd>
            </div>
            <div>
              <dt className={DT}>Rules &amp; Scoring Format</dt>
              <dd className={`${DD} mt-1 leading-[1.55] max-w-[760px]`}>{show.rulesSummary || 'Not provided'}</dd>
            </div>
          </dl>
        </div>

        <div className="zt-block grid-cols-1">
          <WebCell pad="lg" className="gap-3.5">
            <Cap as="h2">Registration &amp; Weigh-In Details</Cap>
            <div>
              {fee.amount ? (
                <div className={`${NUM} text-[44px] leading-none`}>
                  {fee.amount}
                  {fee.note && <span className="block sm:inline font-sans text-[15px] text-ink mt-1.5 sm:mt-0 sm:ml-2.5">{fee.note}</span>}
                </div>
              ) : (
                <div className="text-[15px] font-bold text-ink">{fee.note || <span className="text-ink-muted font-normal">Entry fee not provided</span>}</div>
              )}
              <div className="text-[13px] text-ink-muted mt-1.5">
                {show.registration.entryFeeDisplay ? 'Entry Fee · ' : ''}Registration Deadline: {show.registration.registrationDeadline || 'Not provided'}
              </div>
            </div>
            <dl className="text-[13px] leading-[1.5] space-y-1.5">
              <div><dt className="inline text-ink-muted">Registration Status: </dt><dd className="inline font-bold text-ink">{life.registrationLabel}</dd></div>
              <div><dt className="inline text-ink-muted">Promoter Contact: </dt><dd className="inline text-ink">{show.registration.promoterContact || 'Not provided'}</dd></div>
              <div><dt className="inline text-ink-muted">Weigh-In / Grouping Policy: </dt><dd className="inline text-ink">{show.registration.weighInNotes || 'Not provided'}</dd></div>
            </dl>

            {/* Lifecycle Action Bar */}
            <div className="flex flex-wrap gap-2.5 mt-1">
              {show.isDemoFixture ? (
                <button type="button" disabled className={keyClass('line', 'opacity-50 cursor-not-allowed')}>
                  Demo show: registration disabled
                </button>
              ) : show.registration.externalRegistrationUrl ? (
                <a href={show.registration.externalRegistrationUrl} target="_blank" rel="noopener noreferrer" className={keyClass('pen')}>
                  External Registration Page ↗
                </a>
              ) : canRegisterInApp ? (
                <Key href={`/register/${show.slug}`} variant="pen">
                  {show.registrationStatus === 'waitlist' ? 'Join Waitlist →' : 'Register Now →'}
                </Key>
              ) : (
                <button type="button" disabled className={keyClass('line', 'opacity-50 cursor-not-allowed')}>
                  {life.registrationLabel}
                </button>
              )}
              <FollowShowButton slug={show.slug} isDemoFixture={!!show.isDemoFixture} />
              {show.liveScoreboardPath && (
                <Key href={show.liveScoreboardPath} variant="ink">Open Public Live Scoreboard</Key>
              )}
              {/* Train for this show (11/5): the gym directory ranked by this show's event implements; only when the
                  promoter has specced at least one event with a mappable implement. */}
              {trainHref && (
                <Key href={trainHref} variant="line">Find a gym to train for this show</Key>
              )}
            </div>
          </WebCell>
          <WebCell pad="lg" className="gap-1.5">
            <Cap>Promoter</Cap>
            <div className="text-base font-bold text-ink">{show.promoterName || show.hostGymName || 'Not provided'}</div>
            {show.hostGymSlug && (
              <Link href={`/gyms/${show.hostGymSlug}`} className={`${textLink} text-[13px]`}>
                Host Gym: {show.hostGymName || show.venue.facilityName} →
              </Link>
            )}
            {show.lastUpdatedIso && (
              <div className="text-[13px] text-ink-muted">Last updated: <UpdatedStamp iso={show.lastUpdatedIso} /></div>
            )}
          </WebCell>
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
