'use client';

import {
  AlertTriangle,
  ArrowRight,
  Shuffle,
} from 'lucide-react';
import LayoutToggle from '@/components/shell/LayoutToggle';

// `layout` 'tv' puts the load card and the transition list side by side for a pit-side TV or laptop.
export default function PitCrew({
  layout = 'phone',
  toggleLayout,
  currentAthlete,
  currentDivision,
  currentEvent,
  nextRunItem,
  nextSetup,
  onDeckPinHeight,
  pitCrewCallout,
  pitCrewCustomWeight,
  pitCrewUseLightTier,
  plateLoad,
  setPitCrewCustomWeight,
  setPitCrewUseLightTier,
  transitionRows,
  upNowPinHeight,
  updateAthleteRackPin,
  readOnly = false,   // spectator phones: show the floor view, no edits
}) {
  const tv = layout === 'tv';
  return (
        <div className={tv ? 'grid grid-cols-1 lg:grid-cols-5 gap-4 items-start' : 'space-y-4'}>
        <div className={tv ? 'lg:col-span-3 space-y-4' : 'space-y-4'}>
          {/* Up Now & On Deck Athlete Rack / Pin Height Callout Banner */}
          {currentEvent.hasHeightCallout && currentAthlete && (
            <div className="bg-zt-surface border-2 border-zt-primary rounded-2xl p-4 space-y-3 shadow-lg">
              <div className="flex justify-between items-center">
                <span className="text-xs font-black uppercase tracking-wider text-zt-primary">
                  {currentEvent.heightLabel || 'Implement Rack / Pin Height'}
                </span>
                <span className="text-[11px] font-bold text-zt-muted">
                  {currentDivision.name}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-zt-inset border border-zt-primary/60 rounded-xl p-3">
                  <div className="text-[10px] font-extrabold uppercase text-zt-primary">
                    UP NOW • {currentAthlete.name}
                  </div>
                  <div className="text-xl font-black text-zt-text mt-0.5">{upNowPinHeight}</div>
                </div>

                <div className="bg-zt-inset border border-zt-border rounded-xl p-3">
                  <div className="text-[10px] font-extrabold uppercase text-zt-muted">
                    ON DECK • {nextRunItem ? nextRunItem.athlete.name : 'End of Division'}
                  </div>
                  <div className="text-xl font-black text-zt-text-2 mt-0.5">
                    {onDeckPinHeight || '—'}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-extrabold uppercase text-zt-muted">
                  {readOnly ? `${currentAthlete.name}'s Personal Pin / Height` : `Update ${currentAthlete.name}'s Personal Pin / Height Override`}
                </label>
                {readOnly ? (
                  <div className="w-full mt-1 bg-zt-inset border border-zt-border rounded-xl px-3 py-2 text-sm font-bold text-zt-text">
                    {currentAthlete.rackHeights?.[currentEvent.id] || 'not set'}
                  </div>
                ) : (
                  <input
                    type="text"
                    placeholder="e.g., Pin 14 (6'4&quot;) or 48&quot; Bar..."
                    value={currentAthlete.rackHeights?.[currentEvent.id] || ''}
                    onChange={(e) =>
                      updateAthleteRackPin(currentAthlete.id, currentEvent.id, e.target.value)
                    }
                    className="w-full mt-1 bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-sm font-bold text-zt-text"
                  />
                )}
              </div>
            </div>
          )}

          <div className="bg-zt-surface border border-zt-border rounded-2xl p-4 space-y-4">
            <div className="flex justify-between items-start gap-2">
              <div>
                <span className="text-xs font-extrabold uppercase text-zt-primary">
                  {plateLoad.callOutLabel}
                </span>
                <h2 className="text-xl font-black text-zt-text mt-0.5">{currentEvent.name}</h2>
              </div>
              <div className="flex items-start gap-2">
                <div className="text-right bg-zt-inset px-3 py-1.5 rounded-xl border border-zt-border">
                  <div className="text-[10px] uppercase font-bold text-zt-muted">Empty Tare</div>
                  <div className="text-base font-black text-zt-text">
                    {currentEvent.implementEmptyWeight} lbs
                  </div>
                </div>
                {toggleLayout && <LayoutToggle layout={layout} onToggle={toggleLayout} />}
              </div>
            </div>

            {currentEvent.hasTrumpWeight && (
              <div className="grid grid-cols-2 gap-2 bg-zt-inset p-1.5 rounded-xl border border-zt-border">
                <button
                  disabled={readOnly}
                  onClick={() => {
                    if (readOnly) return;
                    setPitCrewUseLightTier(false);
                    setPitCrewCustomWeight('');
                  }}
                  className={`py-2.5 rounded-lg font-black text-xs uppercase ${
                    !pitCrewUseLightTier ? 'bg-zt-primary text-zt-on-primary' : 'text-zt-muted'
                  }`}
                >
                  Heavy Bar ({currentEvent.divisionWeights[currentDivision.id]} lbs)
                </button>
                <button
                  disabled={readOnly}
                  onClick={() => {
                    if (readOnly) return;
                    setPitCrewUseLightTier(true);
                    setPitCrewCustomWeight('');
                  }}
                  className={`py-2.5 rounded-lg font-black text-xs uppercase ${
                    pitCrewUseLightTier ? 'bg-zt-primary text-zt-on-primary' : 'text-zt-muted'
                  }`}
                >
                  Light Bar ({currentEvent.divisionLightWeights?.[currentDivision.id]} lbs)
                </button>
              </div>
            )}

            {pitCrewCallout && (
              <div className="rounded-2xl border-2 border-zt-primary bg-zt-primary/10 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-zt-primary">
                    {currentEvent.pitCrewCallout.title}
                  </span>
                  <span className="text-[11px] font-black uppercase bg-zt-primary text-zt-on-primary px-2 py-0.5 rounded-md">
                    {currentDivision.name} • Flight {currentDivision.flight}
                  </span>
                </div>
                <div className="text-2xl font-black text-zt-text leading-tight text-balance">
                  {pitCrewCallout.headline}
                </div>
                {pitCrewCallout.stats?.length > 0 && (
                  <div className="grid grid-cols-2 gap-2.5">
                    {pitCrewCallout.stats.map((s) => (
                      <div
                        key={s.label}
                        className="bg-zt-inset border border-zt-border rounded-xl p-3"
                      >
                        <div className="text-[11px] uppercase font-extrabold text-zt-muted">
                          {s.label}
                        </div>
                        <div className="text-xl font-black text-zt-primary mt-0.5 leading-tight">
                          {s.value}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {currentEvent.loadingPoints === 0 ? (
              pitCrewCallout ? null : (
                <div className="bg-zt-inset border border-zt-border rounded-xl p-4">
                  <div className="text-xs uppercase font-extrabold text-zt-primary">
                    Fixed Implement Layout (No Plate Math)
                  </div>
                  <div className="text-lg font-black mt-1 text-zt-text">
                    {currentEvent.fixedImplementDescription ||
                      `Load ${plateLoad.targetInputWeight} lb Implement`}
                  </div>
                </div>
              )
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 bg-zt-inset p-4 rounded-xl border border-zt-border">
                  <div>
                    <div className="text-[11px] text-zt-muted uppercase font-extrabold">
                      {currentEvent.weightIsAddedPlatesOnly
                        ? 'Added Plate Weight'
                        : currentEvent.weightEntryMode === 'per_hand'
                        ? 'Target Per Hand'
                        : 'Target Total Weight'}
                    </div>
                    <div className="text-3xl font-black text-zt-text mt-0.5">
                      {plateLoad.targetInputWeight} lbs
                    </div>
                    {plateLoad.collarWeightApplied > 0 && (
                      <div className="text-[11px] text-zt-muted mt-0.5">
                        Includes {plateLoad.collarWeightApplied} lb collars
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-[11px] text-zt-primary uppercase font-extrabold">
                      Load {plateLoad.callOutLabel}
                    </div>
                    <div className="text-3xl font-black text-zt-primary mt-0.5">
                      {plateLoad.weightPerLoadingPoint} lbs
                    </div>
                    <div className="text-[11px] text-zt-muted mt-0.5">
                      Total System: {plateLoad.totalSystemWeight} lbs
                    </div>
                  </div>
                </div>

                {/* Visual Plate Stack */}
                <div className="space-y-2">
                  <div className="text-xs font-extrabold uppercase text-zt-muted">
                    Plates on EACH Loading Point ({plateLoad.loadingPoints} Points Total):
                  </div>
                  {plateLoad.platesPerPoint.length === 0 ? (
                    <div className="p-4 bg-zt-inset rounded-xl border border-zt-border text-zt-muted font-bold text-sm">
                      Empty Implement Only (No Plates Needed)
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2.5">
                      {plateLoad.platesPerPoint.map((p) => (
                        <div
                          key={p.weight}
                          className="bg-zt-primary text-zt-on-primary px-4 py-3 rounded-2xl font-black flex items-center gap-2 shadow-md"
                        >
                          <span className="text-2xl">{p.count}×</span>
                          <span className="text-xl">{p.weight} lb</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Custom Weight Tester Input (crew only; spectators see the floor view) */}
                {!readOnly && (
                <div className="pt-2 border-t border-zt-border">
                  <label className="text-[11px] font-extrabold uppercase text-zt-muted">
                    Custom Target Weight Override (Test Rising Bar / Odd Yoke Jumps)
                  </label>
                  <div className="flex gap-2 mt-1">
                    <input
                      type="number"
                      placeholder="Enter any target weight in lbs..."
                      value={pitCrewCustomWeight}
                      onChange={(e) => setPitCrewCustomWeight(e.target.value)}
                      className="flex-1 bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-sm font-bold"
                    />
                    {pitCrewCustomWeight && (
                      <button
                        onClick={() => setPitCrewCustomWeight('')}
                        className="px-3 py-2 rounded-xl bg-zt-surface-2 text-xs font-bold"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
                )}

                {plateLoad.warningMessage && (
                  <div className="p-3.5 rounded-xl bg-zt-danger/15 border border-zt-danger text-zt-danger-text text-xs font-bold flex items-start gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-zt-danger flex-shrink-0 mt-0.5" />
                    <span>{plateLoad.warningMessage}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

          {/* Next Group / Lifter Transition */}
          <section
            aria-label="Next group transition"
            className={`bg-zt-surface border-2 border-zt-secondary/60 rounded-2xl p-4 space-y-3 ${tv ? 'lg:col-span-2' : ''}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Shuffle className="w-4 h-4 text-zt-secondary" aria-hidden="true" />
                <h3 className="text-xs font-black uppercase tracking-wider text-zt-text">
                  Next Group / Lifter Transition
                </h3>
              </div>
              {nextSetup && (
                <span className="text-[10px] font-black uppercase tracking-wider bg-zt-secondary text-zt-on-secondary px-2 py-0.5 rounded">
                  {nextSetup.event.id === currentEvent.id
                    ? nextSetup.division.name
                    : `Ev ${nextSetup.event.eventNumber} • ${nextSetup.division.name}`}
                </span>
              )}
            </div>

            {nextRunItem && nextRunItem.athlete.divisionId === currentDivision.id && (
              <div className="text-xs font-bold text-zt-muted bg-zt-inset border border-zt-border rounded-xl px-3 py-2">
                Next lifter:{' '}
                <span className="text-zt-text font-black">{nextRunItem.athlete.name}</span> —
                same {currentDivision.name} weight setup
                {onDeckPinHeight && onDeckPinHeight !== upNowPinHeight
                  ? ` (Pin changes: ${upNowPinHeight} → ${onDeckPinHeight})`
                  : ', no change.'}
              </div>
            )}

            {nextSetup ? (
              <ul className="space-y-2">
                {transitionRows.map((row) => (
                  <li
                    key={row.label}
                    className={`rounded-xl border px-3 py-2.5 flex flex-col gap-1 ${
                      row.changed
                        ? 'bg-zt-secondary/10 border-zt-secondary/50'
                        : 'bg-zt-inset border-zt-border'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-zt-muted">
                        {row.label}
                      </span>
                      <span
                        className={`text-xs font-black ${
                          row.changed ? 'text-zt-secondary' : 'text-zt-subtle'
                        }`}
                      >
                        {row.delta}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm font-bold text-zt-text min-w-0">
                      <span className="truncate text-zt-muted">{row.from}</span>
                      <ArrowRight
                        className="w-3.5 h-3.5 flex-shrink-0 text-zt-subtle"
                        aria-hidden="true"
                      />
                      <span className="truncate font-black">{row.to}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs font-bold text-zt-muted">
                Final group of the final event on this station — no further changeover.
              </p>
            )}
          </section>
        </div>
  );
}
