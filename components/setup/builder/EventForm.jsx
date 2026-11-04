'use client';

import { useState } from 'react';
import { loadingTakesCollars } from '@/lib/engine/plates';
import { EQUIPMENT_RULES, IMPLEMENTS, SPEC_LIMITS, normalizeEventSpec, validateEventSpec } from '@/lib/events/spec';

const SCORING_OPTIONS = [
  { id: 'reps', label: 'Reps', help: 'Most reps in time cap; optional Heavy/Light trump bar.' },
  { id: 'max_weight', label: 'Max Weight', help: 'Heaviest good lift (Rising Bar grid or exact weight).' },
  { id: 'time_or_distance', label: 'Time or Distance (ft)', help: 'Fastest finish time; DNF scored by distance in feet.' },
  { id: 'time_or_implements', label: 'Time or Implements', help: 'Stones/Medley: fastest all-in time, or count + split.' },
];

// `defaultCollarWeightPerPair`: the meet's default, prefilled on a new event (collars are per event since 10/26).
export default function EventForm({ divisions, initialEvent, onSave, onCancel, defaultCollarWeightPerPair = 0 }) {
  const ev = initialEvent || {};
  const [name, setName] = useState(ev.name || '');
  const [scoringType, setScoringType] = useState(ev.scoringType || 'reps');
  const [timeCapSeconds, setTimeCapSeconds] = useState(ev.timeCapSeconds ?? 60);
  const [lanes, setLanes] = useState(ev.lanes ?? 1);
  const [loadingPoints, setLoadingPoints] = useState(ev.loadingPoints ?? 2);
  const [weightEntryMode, setWeightEntryMode] = useState(ev.weightEntryMode || 'total');
  const [implementEmptyWeight, setImplementEmptyWeight] = useState(ev.implementEmptyWeight ?? 0);
  const [collarWeightPerPair, setCollarWeightPerPair] = useState(ev.collarWeightPerPair ?? defaultCollarWeightPerPair ?? 0);
  // Astra PS-01: collars only on two sleeves or four sleeves per hand; a four-post total load (yoke) never deducts them.
  const takesCollars = loadingTakesCollars({ loadingPoints: Number(loadingPoints), weightEntryMode: Number(loadingPoints) === 4 ? weightEntryMode : 'total' });
  const [weightIsAddedPlatesOnly, setWeightIsAddedPlatesOnly] = useState(!!ev.weightIsAddedPlatesOnly);
  const [fixedImplementDescription, setFixedImplementDescription] = useState(ev.fixedImplementDescription || '');

  // Type-specific fields
  const [hasTrumpWeight, setHasTrumpWeight] = useState(!!ev.hasTrumpWeight);
  const [groundTouchWarning, setGroundTouchWarning] = useState(!!ev.groundTouchWarning);
  const [maxFormat, setMaxFormat] = useState(ev.maxFormat === 'rising_bar' ? 'rising_bar' : 'none');
  const [risingBarText, setRisingBarText] = useState((ev.risingBarWeights || []).join(', '));
  const [implementCount, setImplementCount] = useState(ev.implementCount ?? 5);

  // Height & Pit Crew callout fields
  const [hasHeightCallout, setHasHeightCallout] = useState(!!ev.hasHeightCallout);
  const [heightLabel, setHeightLabel] = useState(ev.heightLabel || 'Rack / Pin Height');
  const [divisionWeights, setDivisionWeights] = useState(() => ({ ...(ev.divisionWeights || {}) }));
  const [divisionLightWeights, setDivisionLightWeights] = useState(() => ({ ...(ev.divisionLightWeights || {}) }));
  const [divisionDefaultHeights, setDivisionDefaultHeights] = useState(() => ({ ...(ev.divisionDefaultHeights || {}) }));

  const [calloutTitle, setCalloutTitle] = useState(ev.pitCrewCallout?.title || '');
  const [calloutHeadlines, setCalloutHeadlines] = useState(() => {
    const map = {};
    if (ev.pitCrewCallout?.byDivision) {
      for (const [dId, entry] of Object.entries(ev.pitCrewCallout.byDivision)) {
        map[dId] = entry?.headline || '';
      }
    }
    return map;
  });

  // Event spec starter (11/4): what athletes train for. Optional; validated and normalized by lib/events/spec.
  const [spec, setSpec] = useState(() => ({
    implement: ev.spec?.implement || '',
    implementNote: ev.spec?.implementNote || '',
    courseFeet: ev.spec?.courseFeet ?? '',
    allowed: [...(ev.spec?.allowed || [])],
    notAllowed: [...(ev.spec?.notAllowed || [])],
    videoUrl: ev.spec?.videoUrl || '',
    notes: ev.spec?.notes || '',
  }));
  const setSpecField = (k, v) => setSpec((s) => ({ ...s, [k]: v }));
  // One rule is allowed, not allowed, or unsaid; clicking the same column again clears it.
  const setRule = (id, column) => setSpec((s) => {
    const allowed = s.allowed.filter((r) => r !== id);
    const notAllowed = s.notAllowed.filter((r) => r !== id);
    if (column === 'allowed' && !s.allowed.includes(id)) allowed.push(id);
    if (column === 'notAllowed' && !s.notAllowed.includes(id)) notAllowed.push(id);
    return { ...s, allowed, notAllowed };
  });

  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Event name is required.');
      return;
    }
    const cap = Number(timeCapSeconds);
    if (!(cap > 0)) {
      setError('Time cap must be greater than 0 seconds.');
      return;
    }
    const specError = validateEventSpec(spec);
    if (specError) {
      setError(specError);
      return;
    }

    let parsedRising = undefined;
    if (scoringType === 'max_weight' && maxFormat === 'rising_bar') {
      const nums = risingBarText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number);
      if (nums.length === 0 || nums.some((n) => Number.isNaN(n) || n <= 0)) {
        setError('Rising bar weights must be positive numbers separated by commas.');
        return;
      }
      for (let i = 1; i < nums.length; i++) {
        if (nums[i] <= nums[i - 1]) {
          setError('Rising bar weights must be in strictly ascending order.');
          return;
        }
      }
      parsedRising = nums;
    }

    const cleanWeights = {};
    const cleanLight = {};
    const cleanHeights = {};
    const byDivisionCallout = {};

    for (const d of divisions) {
      cleanWeights[d.id] = Number(divisionWeights[d.id]) || 0;
      if (scoringType === 'reps' && hasTrumpWeight) {
        cleanLight[d.id] = Number(divisionLightWeights[d.id]) || 0;
      }
      if (hasHeightCallout && divisionDefaultHeights[d.id]?.trim()) {
        cleanHeights[d.id] = divisionDefaultHeights[d.id].trim();
      }
      const hl = calloutHeadlines[d.id]?.trim();
      const prevStats = ev.pitCrewCallout?.byDivision?.[d.id]?.stats;
      if (hl || prevStats) {
        byDivisionCallout[d.id] = {
          ...(hl ? { headline: hl } : {}),
          ...(prevStats ? { stats: prevStats } : {}),
        };
      }
    }

    const payload = {
      name: trimmedName,
      scoringType,
      timeCapSeconds: cap,
      lanes: Number(lanes) === 2 ? 2 : 1,
      loadingPoints: Number(loadingPoints),
      weightEntryMode: Number(loadingPoints) === 4 ? weightEntryMode : 'total',
      implementEmptyWeight: Number(implementEmptyWeight) || 0,
      collarWeightPerPair: takesCollars ? Math.max(0, Number(collarWeightPerPair) || 0) : 0,
      weightIsAddedPlatesOnly,
      fixedImplementDescription: Number(loadingPoints) === 0 ? fixedImplementDescription.trim() : undefined,
      divisionWeights: cleanWeights,
      hasTrumpWeight: scoringType === 'reps' ? hasTrumpWeight : false,
      divisionLightWeights: scoringType === 'reps' && hasTrumpWeight ? cleanLight : undefined,
      groundTouchWarning: scoringType === 'reps' ? groundTouchWarning : false,
      maxFormat: scoringType === 'max_weight' && maxFormat === 'rising_bar' ? 'rising_bar' : undefined,
      risingBarWeights: parsedRising,
      implementCount: scoringType === 'time_or_implements' ? Math.max(1, Number(implementCount) || 5) : undefined,
      hasHeightCallout,
      heightLabel: hasHeightCallout ? heightLabel.trim() || 'Rack / Pin Height' : undefined,
      divisionDefaultHeights: hasHeightCallout ? cleanHeights : undefined,
      pitCrewCallout:
        calloutTitle.trim() || Object.keys(byDivisionCallout).length > 0
          ? { title: calloutTitle.trim() || 'Setup Callout', byDivision: byDivisionCallout }
          : undefined,
      spec: normalizeEventSpec(spec),
    };

    onSave(payload);
  };

  const activeScoringHelp = SCORING_OPTIONS.find((o) => o.id === scoringType)?.help;

  return (
    <form onSubmit={handleSubmit} className="bg-zt-surface border-2 border-zt-primary/60 rounded-xl p-3 space-y-3">
      <div>
        <label className="text-[10px] font-extrabold uppercase text-zt-muted">Event Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. 12&quot; Log Clean &amp; Press"
          className="w-full mt-1 bg-zt-inset border border-zt-border-strong rounded-lg px-2.5 py-1.5 text-xs font-bold text-zt-text"
        />
      </div>

      {/* Scoring Type */}
      <div>
        <label className="text-[10px] font-extrabold uppercase text-zt-muted">Scoring Type</label>
        <div className="grid grid-cols-2 gap-1.5 mt-1">
          {SCORING_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setScoringType(opt.id)}
              className={`py-2 px-2 rounded-lg text-left text-xs font-black border ${
                scoringType === opt.id
                  ? 'bg-zt-primary text-zt-on-primary border-zt-primary'
                  : 'bg-zt-inset text-zt-text-2 border-zt-border'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] font-bold text-zt-muted mt-1">{activeScoringHelp}</p>
      </div>

      {/* Time Cap, Lanes & Loading Points */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-[10px] font-extrabold uppercase text-zt-muted">Time Cap (s)</label>
          <input
            type="number"
            value={timeCapSeconds}
            onChange={(e) => setTimeCapSeconds(e.target.value)}
            className="w-full mt-1 bg-zt-inset border border-zt-border-strong rounded-lg px-2 py-1.5 text-xs font-bold"
          />
        </div>
        <div>
          <label className="text-[10px] font-extrabold uppercase text-zt-muted">Lanes</label>
          <select
            value={lanes}
            onChange={(e) => setLanes(Number(e.target.value))}
            className="w-full mt-1 bg-zt-inset border border-zt-border-strong rounded-lg px-2 py-1.5 text-xs font-bold"
          >
            <option value={1}>1 Lane</option>
            <option value={2}>2 Lanes (H2H)</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] font-extrabold uppercase text-zt-muted">Load Points</label>
          <select
            value={loadingPoints}
            onChange={(e) => setLoadingPoints(Number(e.target.value))}
            className="w-full mt-1 bg-zt-inset border border-zt-border-strong rounded-lg px-2 py-1.5 text-xs font-bold"
          >
            <option value={0}>0 (Fixed)</option>
            <option value={1}>1 (Pin)</option>
            <option value={2}>2 (Sleeves)</option>
            <option value={4}>4 (Posts/Hndl)</option>
          </select>
        </div>
      </div>

      {Number(loadingPoints) === 4 && (
        <div>
          <label className="text-[10px] font-extrabold uppercase text-zt-muted">4-Point Weight Entry Mode</label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            {[
              ['total', 'Total Weight (4-Post Yoke)'],
              ['per_hand', 'Per Hand (2-Sleeve Farmers)'],
            ].map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setWeightEntryMode(val)}
                className={`py-1.5 px-2 rounded-lg text-[11px] font-black border ${
                  weightEntryMode === val ? 'bg-zt-primary text-zt-on-primary border-zt-primary' : 'bg-zt-inset text-zt-text-2 border-zt-border'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {Number(loadingPoints) === 0 ? (
        <div>
          <label className="text-[10px] font-extrabold uppercase text-zt-muted">Fixed Implement Description</label>
          <input
            type="text"
            value={fixedImplementDescription}
            onChange={(e) => setFixedImplementDescription(e.target.value)}
            placeholder="e.g. 240, 260, 285, 310, 330 lb Stones"
            className="w-full mt-1 bg-zt-inset border border-zt-border-strong rounded-lg px-2.5 py-1.5 text-xs font-bold"
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 items-end">
          <div>
            <label className="text-[10px] font-extrabold uppercase text-zt-muted">Empty Implement Tare (lb)</label>
            <input
              type="number"
              value={implementEmptyWeight}
              onChange={(e) => setImplementEmptyWeight(e.target.value)}
              className="w-full mt-1 bg-zt-inset border border-zt-border-strong rounded-lg px-2.5 py-1.5 text-xs font-bold"
            />
          </div>
          {takesCollars && (
            <div>
              <label className="text-[10px] font-extrabold uppercase text-zt-muted">Collar Weight / Pair (lb)</label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={collarWeightPerPair}
                onChange={(e) => setCollarWeightPerPair(e.target.value)}
                className="w-full mt-1 bg-zt-inset border border-zt-border-strong rounded-lg px-2.5 py-1.5 text-xs font-bold"
              />
              <p className="text-[10px] text-zt-muted mt-0.5">Deducted once per load, per sleeve pair. 0 if this bar runs no collars.</p>
            </div>
          )}
          <label className="flex items-center gap-2 text-xs font-bold text-zt-text py-1.5">
            <input
              type="checkbox"
              checked={weightIsAddedPlatesOnly}
              onChange={(e) => setWeightIsAddedPlatesOnly(e.target.checked)}
            />
            Weights are added plates only
          </label>
        </div>
      )}

      {/* Per-Type Controls */}
      {scoringType === 'reps' && (
        <div className="flex flex-wrap gap-4 pt-1">
          <label className="flex items-center gap-1.5 text-xs font-bold text-zt-text">
            <input type="checkbox" checked={hasTrumpWeight} onChange={(e) => setHasTrumpWeight(e.target.checked)} />
            Two-Tier Trump Weight (Heavy / Light)
          </label>
          <label className="flex items-center gap-1.5 text-xs font-bold text-zt-text">
            <input type="checkbox" checked={groundTouchWarning} onChange={(e) => setGroundTouchWarning(e.target.checked)} />
            Ground-Touch Warning Button
          </label>
        </div>
      )}

      {scoringType === 'max_weight' && (
        <div className="space-y-2 pt-1">
          <div className="grid grid-cols-2 gap-2">
            {[
              ['none', 'Standard Max Attempts'],
              ['rising_bar', 'Rising Bar Weight Grid'],
            ].map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setMaxFormat(val)}
                className={`py-1.5 px-2 rounded-lg text-xs font-black border ${
                  maxFormat === val ? 'bg-zt-primary text-zt-on-primary border-zt-primary' : 'bg-zt-inset text-zt-text-2 border-zt-border'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {maxFormat === 'rising_bar' && (
            <div>
              <label className="text-[10px] font-extrabold uppercase text-zt-muted">
                Rising Bar Weights (lbs, comma-separated ascending)
              </label>
              <input
                type="text"
                value={risingBarText}
                onChange={(e) => setRisingBarText(e.target.value)}
                placeholder="225, 245, 265, 285, 305"
                className="w-full mt-1 bg-zt-inset border border-zt-border-strong rounded-lg px-2.5 py-1.5 text-xs font-bold"
              />
            </div>
          )}
        </div>
      )}

      {scoringType === 'time_or_implements' && (
        <div>
          <label className="text-[10px] font-extrabold uppercase text-zt-muted">Implement / Stone Count</label>
          <input
            type="number"
            min={1}
            value={implementCount}
            onChange={(e) => setImplementCount(e.target.value)}
            className="w-full mt-1 bg-zt-inset border border-zt-border-strong rounded-lg px-2.5 py-1.5 text-xs font-bold"
          />
        </div>
      )}

      {/* Height Callout Toggle */}
      <div className="space-y-2 pt-1 border-t border-zt-border">
        <label className="flex items-center gap-2 text-xs font-bold text-zt-text">
          <input type="checkbox" checked={hasHeightCallout} onChange={(e) => setHasHeightCallout(e.target.checked)} />
          Track Rack / Yoke Pin Height Callout
        </label>
        {hasHeightCallout && (
          <input
            type="text"
            value={heightLabel}
            onChange={(e) => setHeightLabel(e.target.value)}
            placeholder="Height label (e.g. Yoke Crossbar Pin)"
            className="w-full bg-zt-inset border border-zt-border-strong rounded-lg px-2.5 py-1.5 text-xs font-bold"
          />
        )}
      </div>

      {/* Per-Division Weights, Light Weights, Default Heights & Pit Crew Headlines */}
      {divisions.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-zt-border">
          <div className="text-[10px] font-extrabold uppercase text-zt-primary">
            Per-Division Weights &amp; Setup
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase text-zt-muted">
              Optional Pit Crew Callout Title
            </label>
            <input
              type="text"
              value={calloutTitle}
              onChange={(e) => setCalloutTitle(e.target.value)}
              placeholder="e.g. Keg / Load Callout"
              className="w-full mt-0.5 bg-zt-inset border border-zt-border-strong rounded-lg px-2.5 py-1.5 text-xs font-bold"
            />
          </div>

          {divisions.map((d) => (
            <div key={d.id} className="bg-zt-inset border border-zt-border rounded-lg p-2 space-y-1.5">
              <div className="text-xs font-black text-zt-text">{d.name}</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-zt-muted">Target Weight (lb)</label>
                  <input
                    type="number"
                    value={divisionWeights[d.id] ?? 0}
                    onChange={(e) => setDivisionWeights({ ...divisionWeights, [d.id]: e.target.value })}
                    className="w-full bg-zt-surface border border-zt-border-strong rounded px-2 py-1 text-xs font-bold"
                  />
                </div>
                {scoringType === 'reps' && hasTrumpWeight && (
                  <div>
                    <label className="text-[10px] font-bold text-zt-muted">Light Tier Wt (lb)</label>
                    <input
                      type="number"
                      value={divisionLightWeights[d.id] ?? 0}
                      onChange={(e) => setDivisionLightWeights({ ...divisionLightWeights, [d.id]: e.target.value })}
                      className="w-full bg-zt-surface border border-zt-border-strong rounded px-2 py-1 text-xs font-bold"
                    />
                  </div>
                )}
                {hasHeightCallout && (
                  <div>
                    <label className="text-[10px] font-bold text-zt-muted">Default Pin/Height</label>
                    <input
                      type="text"
                      value={divisionDefaultHeights[d.id] || ''}
                      onChange={(e) => setDivisionDefaultHeights({ ...divisionDefaultHeights, [d.id]: e.target.value })}
                      placeholder="e.g. 48&quot; Bar"
                      className="w-full bg-zt-surface border border-zt-border-strong rounded px-2 py-1 text-xs font-bold"
                    />
                  </div>
                )}
              </div>
              <input
                type="text"
                value={calloutHeadlines[d.id] || ''}
                onChange={(e) => setCalloutHeadlines({ ...calloutHeadlines, [d.id]: e.target.value })}
                placeholder={`Optional Pit Crew headline for ${d.name}...`}
                className="w-full bg-zt-surface border border-zt-border-strong rounded px-2 py-1 text-xs font-bold"
              />
            </div>
          ))}
        </div>
      )}

      {/* Event spec (athlete-facing): shows on the public show page under the event; the scorer ignores it */}
      <div className="space-y-2 pt-2 border-t border-zt-border">
        <div className="text-[10px] font-extrabold uppercase text-zt-primary">Event Spec (What Athletes Train For)</div>
        <p className="text-[10px] text-zt-muted">
          Optional. Printed on the public show page under this event, with kilograms beside every weight. Weights stay in the division table above.
        </p>
        <div className="grid grid-cols-2 gap-2 items-end">
          <div>
            <label htmlFor="ev-spec-implement" className="text-[10px] font-extrabold uppercase text-zt-muted">Implement</label>
            <select
              id="ev-spec-implement"
              value={spec.implement}
              onChange={(e) => setSpecField('implement', e.target.value)}
              className="w-full mt-1 bg-zt-inset border border-zt-border-strong rounded-lg px-2.5 py-1.5 text-xs font-bold"
            >
              <option value="">Not stated</option>
              {IMPLEMENTS.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="ev-spec-note" className="text-[10px] font-extrabold uppercase text-zt-muted">Implement Detail</label>
            <input
              id="ev-spec-note"
              type="text"
              value={spec.implementNote}
              maxLength={SPEC_LIMITS.implementNote}
              onChange={(e) => setSpecField('implementNote', e.target.value)}
              placeholder={spec.implement === 'other' ? 'Describe it (required for Other)' : 'e.g. 12 in log, 1.9 in axle'}
              className="w-full mt-1 bg-zt-inset border border-zt-border-strong rounded-lg px-2.5 py-1.5 text-xs font-bold"
            />
          </div>
          <div>
            <label htmlFor="ev-spec-course" className="text-[10px] font-extrabold uppercase text-zt-muted">Course Distance (ft)</label>
            <input
              id="ev-spec-course"
              type="number"
              min="1"
              step="0.5"
              value={spec.courseFeet}
              onChange={(e) => setSpecField('courseFeet', e.target.value)}
              placeholder="Carries, pulls, medleys"
              className="w-full mt-1 bg-zt-inset border border-zt-border-strong rounded-lg px-2.5 py-1.5 text-xs font-bold"
            />
          </div>
          <div>
            <label htmlFor="ev-spec-video" className="text-[10px] font-extrabold uppercase text-zt-muted">Video Link</label>
            <input
              id="ev-spec-video"
              type="url"
              value={spec.videoUrl}
              maxLength={SPEC_LIMITS.videoUrl}
              onChange={(e) => setSpecField('videoUrl', e.target.value)}
              placeholder="https://…"
              className="w-full mt-1 bg-zt-inset border border-zt-border-strong rounded-lg px-2.5 py-1.5 text-xs font-bold"
            />
          </div>
        </div>
        <div>
          <div className="text-[10px] font-extrabold uppercase text-zt-muted mb-1">Equipment Rules</div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-4 gap-y-1 text-xs items-center max-w-sm">
            <span className="text-[10px] text-zt-muted" aria-hidden="true" />
            <span className="text-[10px] font-bold uppercase text-zt-muted text-center">Allowed</span>
            <span className="text-[10px] font-bold uppercase text-zt-muted text-center">Not Allowed</span>
            {EQUIPMENT_RULES.map((r) => (
              <div key={r.id} className="contents">
                <span className="font-bold text-zt-text">{r.label}</span>
                <input
                  type="checkbox"
                  aria-label={`${r.label} allowed`}
                  checked={spec.allowed.includes(r.id)}
                  onChange={() => setRule(r.id, 'allowed')}
                  className="mx-auto"
                />
                <input
                  type="checkbox"
                  aria-label={`${r.label} not allowed`}
                  checked={spec.notAllowed.includes(r.id)}
                  onChange={() => setRule(r.id, 'notAllowed')}
                  className="mx-auto"
                />
              </div>
            ))}
          </div>
          <p className="text-[10px] text-zt-muted mt-1">Leave both unchecked when the rule is not stated.</p>
        </div>
        <div>
          <label htmlFor="ev-spec-notes" className="text-[10px] font-extrabold uppercase text-zt-muted">Notes For Athletes</label>
          <textarea
            id="ev-spec-notes"
            value={spec.notes}
            maxLength={SPEC_LIMITS.notes}
            onChange={(e) => setSpecField('notes', e.target.value)}
            rows={2}
            placeholder="e.g. Stones go over a 48 in bar; one drop allowed"
            className="w-full mt-1 bg-zt-inset border border-zt-border-strong rounded-lg px-2.5 py-1.5 text-xs font-bold"
          />
        </div>
      </div>

      {error && <p className="text-xs font-bold text-red-400">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          className="flex-1 py-2.5 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase"
        >
          Save Event
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2.5 rounded-xl bg-zt-surface-2 text-zt-text-2 font-bold text-xs uppercase"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}