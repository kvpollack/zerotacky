'use client';

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Lock,
  Unlock,
} from 'lucide-react';
import MasterClock from './MasterClock';
import { runOrderShortLabel } from '../setup/builder/MeetSection';
import StopStampButton from './StopStampButton';

export default function JudgePad({
  currentAthlete,
  currentDivision,
  currentEvent,
  currentResult,
  divisionAthletes,
  getElapsedSeconds,
  handleStatusAction,
  isLocked,
  lane2Athlete,
  lane2AthleteId,
  lane2Result,
  lockAndAdvance,
  meet,
  nextRunItem,
  pendingStatusAction,
  resetStopwatch,
  results,
  runOrder,
  saveResultPatch,
  selectRunOrderItem,
  setLane2AthleteId,
  setPendingStatusAction,
  setPitCrewCustomWeight,
  setStatusMenuOpen,
  stopAndStampFinish,
  subscribeClock,
  showStopStamp,
  statusActions,
  statusMenuOpen,
  timerRunning,
  toggleTimer,
  unlockScore,
  upNowPinHeight,
}) {
  return (
        <div className="space-y-3.5">
          {/* Run Order Strip */}
          <div className="bg-zt-surface border border-zt-border rounded-2xl p-3">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-zt-muted">
                Run Order ({runOrderShortLabel(meet.runOrderMethod)})
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-zt-surface-2 text-zt-primary">
                {currentEvent.lanes === 2 ? '2-Lane Head-to-Head' : 'Single Platform'}
              </span>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1.5">
              {runOrder.map((item) => {
                const hasScored = results.some(
                  (r) => r.eventId === currentEvent.id && r.athleteId === item.athlete.id
                );
                const isItemLocked = results.some(
                  (r) => r.eventId === currentEvent.id && r.athleteId === item.athlete.id && r.locked
                );
                const isSelected = item.athlete.id === currentAthlete.id;
                const isLane2 = currentEvent.lanes === 2 && item.athlete.id === lane2AthleteId;

                return (
                  <button
                    key={item.athlete.id}
                    onClick={() => selectRunOrderItem(item)}
                    className={`flex-shrink-0 px-3 py-2 rounded-xl border text-left transition active:scale-95 ${
                      isSelected
                        ? 'bg-zt-primary/20 border-zt-primary text-zt-primary-2 ring-1 ring-zt-primary'
                        : isLane2
                        ? 'bg-zt-secondary/20 border-zt-secondary text-zt-secondary'
                        : hasScored
                        ? 'bg-zt-success/15 border-zt-success/60 text-zt-success-text'
                        : 'bg-zt-inset border-zt-border text-zt-text-2'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[10px] font-extrabold uppercase opacity-80">
                      <span>
                        {currentEvent.lanes === 2
                          ? `Heat ${item.heatNumber} • L${item.lane}`
                          : `Order #${item.orderIndex}`}
                      </span>
                      {isItemLocked ? (
                        <Lock className="w-3 h-3 text-zt-success-text" aria-label="Score locked" />
                      ) : (
                        hasScored && <CheckCircle2 className="w-3 h-3 text-zt-success-text" />
                      )}
                    </div>
                    <div className="text-sm font-black truncate max-w-[125px]">{item.athlete.name}</div>
                    <div className="text-[11px] font-semibold opacity-75">
                      {item.currentOverallPoints} pts
                      {item.heightCallout ? ` • ${item.heightCallout}` : ''}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Universal Master Clock */}
          <MasterClock
            timeCapSeconds={currentEvent.timeCapSeconds}
            timerRunning={timerRunning}
            toggle={toggleTimer}
            resetStopwatch={resetStopwatch}
            subscribe={subscribeClock}
          />

          {/* Active Athlete Card (Platform / Lane 1) */}
          <div className="bg-zt-surface border-2 border-zt-primary/70 rounded-2xl p-4 space-y-4 shadow-lg">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider bg-zt-primary text-zt-on-primary px-2 py-0.5 rounded">
                    {currentEvent.lanes === 2 ? 'LANE 1 ATHLETE' : 'ON PLATFORM'}
                  </span>
                  {isLocked && (
                    <span className="text-[10px] font-black uppercase tracking-wider bg-zt-success/15 text-zt-success-text border border-zt-success/40 px-2 py-0.5 rounded flex items-center gap-1">
                      <Lock className="w-3 h-3" aria-hidden="true" />
                      Score Locked
                    </span>
                  )}
                  {currentResult.didNotStart && (
                    <span className="text-[10px] font-black uppercase tracking-wider bg-red-600 text-white px-2 py-0.5 rounded">
                      DNS
                    </span>
                  )}
                  {currentAthlete.status === 'withdrawn' && (
                    <span className="text-[10px] font-black uppercase tracking-wider bg-red-900 text-red-100 px-2 py-0.5 rounded">
                      Scratched
                    </span>
                  )}
                </div>
                <h2 className="text-2xl font-black mt-1 text-zt-text text-balance">
                  {currentAthlete.name}
                </h2>
                {upNowPinHeight && (
                  <div className="text-xs font-extrabold text-zt-primary mt-0.5">
                    {currentEvent.heightLabel || 'Rack / Pin'}: {upNowPinHeight}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setStatusMenuOpen((o) => !o);
                  setPendingStatusAction(null);
                }}
                aria-expanded={statusMenuOpen}
                aria-controls="athlete-status-menu"
                className="px-2.5 py-1.5 rounded-xl text-xs font-extrabold border bg-zt-inset border-zt-border-strong text-zt-muted flex items-center gap-1 flex-shrink-0"
              >
                Status
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${statusMenuOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>
            </div>

            {statusMenuOpen && (
              <div
                id="athlete-status-menu"
                className="rounded-xl border border-zt-border bg-zt-inset p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] uppercase tracking-wider font-extrabold text-zt-muted">
                    Athlete Status / Scratch
                  </span>
                  <span className="text-[10px] font-bold text-zt-subtle">Tap twice to confirm</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {statusActions.map((action) => {
                    const armed = pendingStatusAction === action.id;
                    const Icon = action.icon;
                    return (
                      <button
                        key={action.id}
                        type="button"
                        onClick={() => handleStatusAction(action)}
                        className={`py-3 px-2 rounded-xl text-xs font-black border flex items-center justify-center gap-1.5 transition active:scale-95 ${
                          armed
                            ? 'bg-red-600 border-red-500 text-white'
                            : 'bg-zt-surface border-zt-border-strong text-zt-text'
                        }`}
                      >
                        <Icon className="w-4 h-4" aria-hidden="true" />
                        {armed ? 'Tap Again to Confirm' : action.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <fieldset
              disabled={isLocked}
              className={`space-y-4 min-w-0 transition-opacity ${isLocked ? 'opacity-50' : ''}`}
            >
              <legend className="sr-only">Score entry</legend>

              {/* EVENT TYPE 1: REPS (With Heavy vs Light Trump Tier) */}
              {currentEvent.scoringType === 'reps' && (
                <div className="space-y-4">
                  {currentEvent.hasTrumpWeight && (
                    <div className="grid grid-cols-2 gap-2 bg-zt-inset p-1.5 rounded-xl border border-zt-border">
                      {['heavy', 'light'].map((t) => (
                        <button
                          key={t}
                          onClick={() => saveResultPatch(currentAthlete.id, { tier: t })}
                          className={`py-2.5 rounded-lg font-black text-xs uppercase transition ${
                            (currentResult.tier || 'heavy') === t
                              ? 'bg-zt-primary text-zt-on-primary shadow'
                              : 'text-zt-muted'
                          }`}
                        >
                          {t === 'heavy'
                            ? `Heavy Bar (${currentEvent.divisionWeights[currentDivision.id]} lb)`
                            : `Light Bar (${currentEvent.divisionLightWeights?.[currentDivision.id]} lb)`}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3 pt-1">
                    <button
                      onClick={() =>
                        saveResultPatch(currentAthlete.id, {
                          reps: Math.max(0, (currentResult.reps || 0) - 1),
                          didNotStart: false,
                        })
                      }
                      className="w-24 h-20 rounded-2xl bg-zt-surface-2 border border-zt-border-strong text-3xl font-black active:scale-95"
                    >
                      -1
                    </button>

                    <div className="text-center">
                      <div className="text-6xl font-black text-zt-primary leading-none">
                        {currentResult.reps || 0}
                      </div>
                      <div className="text-[11px] uppercase font-extrabold text-zt-muted mt-1">
                        Locked Reps
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        saveResultPatch(currentAthlete.id, {
                          reps: (currentResult.reps || 0) + 1,
                          didNotStart: false,
                        })
                      }
                      className="w-32 h-20 rounded-2xl bg-emerald-500 text-emerald-950 text-2xl font-black shadow-lg active:scale-95"
                    >
                      +1 REP
                    </button>
                  </div>

                  {currentEvent.groundTouchWarning && (
                    <button
                      type="button"
                      aria-pressed={!!currentResult.groundTouchWarned}
                      onClick={() =>
                        saveResultPatch(currentAthlete.id, {
                          groundTouchWarned: !currentResult.groundTouchWarned,
                        })
                      }
                      className={`w-full py-3 rounded-xl font-black text-xs uppercase tracking-wide flex items-center justify-center gap-2 border transition active:scale-[0.98] ${
                        currentResult.groundTouchWarned
                          ? 'bg-red-600 text-white border-red-500 shadow-lg'
                          : 'bg-zt-inset text-zt-primary border-zt-primary/60'
                      }`}
                    >
                      <AlertTriangle className="w-4 h-4" />
                      {currentResult.groundTouchWarned
                        ? 'Ground-Touch Warning Issued (Tap to Clear)'
                        : 'Ground-Touch Warning'}
                    </button>
                  )}
                </div>
              )}

              {/* EVENT TYPE 2: MAX WEIGHT (Rising Bar Grid + Custom Override) */}
              {currentEvent.scoringType === 'max_weight' && (
                <div className="space-y-3">
                  {currentEvent.maxFormat === 'rising_bar' && currentEvent.risingBarWeights && (
                    <div>
                      <div className="text-[11px] font-extrabold uppercase text-zt-muted mb-2">
                        Rising Bar Weights (Tap to cycle: Pending → Good → Pass → Fail)
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {currentEvent.risingBarWeights.map((w) => {
                          const st = currentResult.risingBarAttempts?.[w] || 'pending';
                          const nextOrder = {
                            pending: 'good',
                            good: 'pass',
                            pass: 'fail',
                            fail: 'pending',
                          };
                          return (
                            <button
                              key={w}
                              onClick={() => {
                                const nextMap = {
                                  ...(currentResult.risingBarAttempts || {}),
                                  [w]: nextOrder[st],
                                };
                                saveResultPatch(currentAthlete.id, {
                                  risingBarAttempts: nextMap,
                                  didNotStart: false,
                                });
                                setPitCrewCustomWeight(String(w));
                              }}
                              className={`p-3 rounded-xl border text-center transition active:scale-95 ${
                                st === 'good'
                                  ? 'bg-emerald-600 border-emerald-400 text-white shadow'
                                  : st === 'fail'
                                  ? 'bg-red-700 border-red-400 text-white'
                                  : st === 'pass'
                                  ? 'bg-zt-surface-2 border-zt-primary text-zt-primary-2'
                                  : 'bg-zt-inset border-zt-border text-zt-text-2'
                              }`}
                            >
                              <div className="text-lg font-black">{w} lbs</div>
                              <div className="text-[10px] font-extrabold uppercase tracking-wider mt-0.5">
                                {st}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="pt-1">
                    <label className="text-[11px] font-bold uppercase text-zt-muted">
                      Exact Max Weight Override (lbs)
                    </label>
                    <input
                      type="number"
                      placeholder="Or enter exact max lift in lbs..."
                      value={currentResult.maxWeightLbs || ''}
                      onChange={(e) =>
                        saveResultPatch(currentAthlete.id, {
                          maxWeightLbs: e.target.value ? Number(e.target.value) : 0,
                          didNotStart: false,
                        })
                      }
                      className="w-full mt-1 bg-zt-inset border border-zt-border-strong rounded-xl px-3.5 py-2.5 text-base font-bold text-zt-text"
                    />
                  </div>
                </div>
              )}

              {/* EVENT TYPE 3: TIME OR DISTANCE (Yoke / Farmers / Truck Pull) */}
              {currentEvent.scoringType === 'time_or_distance' && (
                <div className="space-y-3">
                  {showStopStamp && <StopStampButton onStamp={stopAndStampFinish} subscribe={subscribeClock} />}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[11px] font-extrabold uppercase text-zt-muted">
                        Finish Time (sec)
                      </label>
                      <div className="flex gap-1.5 mt-1">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={currentResult.timeSeconds ?? ''}
                          onChange={(e) =>
                            saveResultPatch(currentAthlete.id, {
                              timeSeconds: e.target.value ? Number(e.target.value) : 0,
                              didNotStart: false,
                            })
                          }
                          className="w-full bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2.5 text-base font-bold"
                        />
                        {!timerRunning && (
                          <button
                            onClick={() =>
                              saveResultPatch(currentAthlete.id, {
                                timeSeconds: getElapsedSeconds(),
                                didNotStart: false,
                              })
                            }
                            className="bg-zt-primary text-zt-on-primary px-3 rounded-xl font-black text-xs active:scale-95"
                          >
                            STAMP
                          </button>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-extrabold uppercase text-zt-muted">
                        If DNF: Distance (ft)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        placeholder="e.g. 42.5"
                        value={currentResult.distanceFeet ?? ''}
                        onChange={(e) =>
                          saveResultPatch(currentAthlete.id, {
                            distanceFeet: e.target.value ? Number(e.target.value) : 0,
                            didNotStart: false,
                          })
                        }
                        className="w-full mt-1 bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2.5 text-base font-bold"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* EVENT TYPE 4: STONES / MEDLEY (Implements + Split Tiebreaker) */}
              {currentEvent.scoringType === 'time_or_implements' && (
                <div className="space-y-3">
                  {showStopStamp && <StopStampButton onStamp={stopAndStampFinish} subscribe={subscribeClock} />}
                  <div className="flex items-center justify-between bg-zt-inset p-3 rounded-xl border border-zt-border">
                    <div>
                      <div className="text-[10px] text-zt-muted font-extrabold uppercase">
                        Stones / Implements
                      </div>
                      <div className="text-4xl font-black text-zt-primary">
                        {currentResult.implementsCompleted || 0}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          saveResultPatch(currentAthlete.id, {
                            implementsCompleted: Math.max(
                              0,
                              (currentResult.implementsCompleted || 0) - 1
                            ),
                          })
                        }
                        className="bg-zt-surface-2 text-zt-text-2 px-3 py-3 rounded-xl font-black text-sm"
                      >
                        -1
                      </button>
                      <button
                        onClick={() =>
                          saveResultPatch(currentAthlete.id, {
                            implementsCompleted: (currentResult.implementsCompleted || 0) + 1,
                            splitTimeSeconds: getElapsedSeconds(),
                            didNotStart: false,
                          })
                        }
                        className="bg-emerald-500 text-emerald-950 px-3.5 py-3 rounded-xl font-black text-xs active:scale-95"
                      >
                        +1 STONE &amp; STAMP SPLIT
                      </button>
                      {!timerRunning && (
                        <button
                          onClick={() =>
                            saveResultPatch(currentAthlete.id, {
                              implementsCompleted: currentEvent.implementCount || 5,
                              timeSeconds: getElapsedSeconds(),
                              didNotStart: false,
                            })
                          }
                          className="bg-zt-primary text-zt-on-primary px-3 py-3 rounded-xl font-black text-xs active:scale-95"
                        >
                          FINISHED ALL
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[11px] text-zt-muted font-bold uppercase">
                        Last Split Tiebreaker (s)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={currentResult.splitTimeSeconds ?? ''}
                        onChange={(e) =>
                          saveResultPatch(currentAthlete.id, {
                            splitTimeSeconds: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                        className="w-full mt-1 bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-zt-muted font-bold uppercase">
                        Full Course Finish (s)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={currentResult.timeSeconds ?? ''}
                        onChange={(e) =>
                          saveResultPatch(currentAthlete.id, {
                            timeSeconds: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                        className="w-full mt-1 bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 font-bold"
                      />
                    </div>
                  </div>
                </div>
              )}
            </fieldset>

            {isLocked ? (
              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="button"
                  onClick={unlockScore}
                  className="w-full py-3.5 rounded-xl border-2 border-zt-border-strong bg-zt-inset text-zt-text font-black text-sm flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                  <Unlock className="w-4 h-4" aria-hidden="true" />
                  Unlock to Edit
                </button>
                {nextRunItem && (
                  <button
                    type="button"
                    onClick={() => selectRunOrderItem(nextRunItem)}
                    className="w-full py-3 rounded-xl bg-zt-primary/15 border border-zt-primary/50 text-zt-primary font-extrabold text-sm flex items-center justify-center gap-2"
                  >
                    Go to {nextRunItem.athlete.name}
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={lockAndAdvance}
                className="w-full py-4 rounded-xl bg-zt-primary text-zt-on-primary font-black text-base flex flex-col items-center justify-center gap-0.5 shadow-lg active:scale-[0.98] transition"
              >
                <span className="flex items-center gap-2">
                  <Lock className="w-4 h-4" aria-hidden="true" />
                  Lock Score &amp; Advance to Next Athlete
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </span>
                <span className="text-[11px] font-bold opacity-80">
                  {nextRunItem
                    ? `Up next: ${nextRunItem.athlete.name}`
                    : 'Last athlete in run order — locks score only'}
                </span>
              </button>
            )}
          </div>

          {/* Second Head-to-Head Card for Lane 2 */}
          {currentEvent.lanes === 2 && lane2Athlete && lane2Result && (
            <div className="bg-zt-surface border-2 border-zt-secondary/70 rounded-2xl p-4 space-y-3 shadow-lg">
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider bg-zt-secondary text-zt-on-secondary px-2 py-0.5 rounded">
                    LANE 2 (HEAD-TO-HEAD)
                  </span>
                  <h2 className="text-xl font-black mt-1 text-zt-text">{lane2Athlete.name}</h2>
                </div>

                <select
                  value={lane2Athlete.id}
                  onChange={(e) => setLane2AthleteId(e.target.value)}
                  className="bg-zt-inset border border-zt-border-strong rounded-lg px-2 py-1 text-xs font-bold text-zt-secondary"
                >
                  {divisionAthletes
                    .filter((a) => a.id !== currentAthlete.id)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        Pair: {a.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-extrabold uppercase text-zt-muted">
                    Lane 2 Finish (sec)
                  </label>
                  <div className="flex gap-1.5 mt-1">
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={lane2Result.timeSeconds ?? ''}
                      onChange={(e) =>
                        saveResultPatch(lane2Athlete.id, {
                          timeSeconds: e.target.value ? Number(e.target.value) : 0,
                        })
                      }
                      className="w-full bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2.5 text-base font-bold"
                    />
                    <button
                      onClick={() =>
                        saveResultPatch(lane2Athlete.id, {
                          timeSeconds: getElapsedSeconds(),
                        })
                      }
                      className="bg-zt-secondary text-zt-on-secondary px-3 rounded-xl font-black text-xs active:scale-95"
                    >
                      STAMP
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-extrabold uppercase text-zt-muted">
                    If DNF: Distance (ft)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="e.g. 51.0"
                    value={lane2Result.distanceFeet ?? ''}
                    onChange={(e) =>
                      saveResultPatch(lane2Athlete.id, {
                        distanceFeet: e.target.value ? Number(e.target.value) : 0,
                      })
                    }
                    className="w-full mt-1 bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2.5 text-base font-bold"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
  );
}
