'use client';

import { useState } from 'react';
import { ALL_POSSIBLE_PLATES } from '@/lib/constants';
import { slugify } from '@/lib/meetBuilder';

// Plain-language copies of the engine rules. Keep in step with lib/engine/runOrder.ts and lib/engine/scoring.ts.
export const RUN_ORDER_OPTIONS = [
  {
    value: 'reverse_overall',
    label: 'Reverse Overall Pts',
    explain: 'Lowest overall points lifts first and the current leader goes last. Athletes level on points go by lot number. Most promoters pick this so the podium race builds to the final attempt.',
  },
  {
    value: 'reverse_previous_event',
    label: 'Reverse Prev Event',
    explain: 'Only the last event counts. Whoever placed last in it goes first and its winner goes last, whatever the overall standings. Athletes tied in that event go lower overall points first, then by lot number.',
  },
  {
    value: 'lot_order',
    label: 'Roster Order',
    short: 'Roster',
    explain: 'Athletes go in lot order for every event, never reshuffled. Pick this when the order was published ahead of time.',
  },
];

// Short label for tight spots (judge pad strip).
export function runOrderShortLabel(method) {
  const opt = RUN_ORDER_OPTIONS.find((o) => o.value === method);
  return opt?.short ?? (method === 'reverse_overall' ? 'Rev Overall' : 'Rev Prev Ev');
}

export const TIEBREAK_OPTIONS = [
  {
    value: 'event_wins',
    label: 'Most Event Wins',
    explain: 'The athlete with more event wins places higher. If that is level too, more points in the final event wins. Still level after both: the athletes share the place.',
  },
  {
    value: 'final_event',
    label: 'Final Event Score',
    explain: 'The athlete with more points in the final event places higher. If that is level too, more event wins. Still level after both: the athletes share the place.',
  },
];

export default function MeetSection({
  meet,
  updateMeetConfig,
  toggleGymPlate,
  allowDemoToggle = true,   // dashboard passes false: meets saved there are always real
}) {
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  // Slug is edited as a draft: lowercase + hyphens while typing (so a trailing "-" or an emptied field survive
  // the keystroke), then fully slugified on blur. Slugifying on every keystroke made "-" impossible to type
  // and turned an empty field into "meet" (found 10/16).
  const [slugDraft, setSlugDraft] = useState(null);
  const slugShown = slugDraft ?? meet.slug ?? slugify(meet.name);
  const commitSlug = () => {
    if (slugDraft === null) return;
    const next = slugDraft.trim() ? slugify(slugDraft) : slugify(meet.name);
    setSlugManuallyEdited(slugDraft.trim().length > 0);
    updateMeetConfig({ slug: next });
    setSlugDraft(null);
  };
  const handleNameChange = (nextName) => {
    const patch = { name: nextName };
    if (!slugManuallyEdited) {
      patch.slug = slugify(nextName);
    }
    updateMeetConfig(patch);
  };

  return (
    <section className="bg-zt-surface border border-zt-border rounded-2xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black uppercase tracking-wider text-zt-primary">
          1. Meet Details &amp; Rules
        </h2>
        {meet.isDemo && (
          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40">
            Demo Preset
          </span>
        )}
      </div>

      {/* 010: a meet built from a demo preset carries isDemo until the promoter says otherwise. Demo = hidden from /shows,
          DEMO on the scoreboard and app header, registration refused. The server never flips a real meet back to demo. */}
      {allowDemoToggle && (
        <div className={`rounded-xl border p-3 flex flex-wrap items-center justify-between gap-2 ${meet.isDemo ? 'bg-amber-500/10 border-amber-500/50' : 'bg-zt-inset border-zt-border'}`}>
          <div className="min-w-0">
            <div className="text-[11px] font-extrabold uppercase text-zt-muted">{meet.isDemo ? 'This is a demo meet' : 'This is a real meet'}</div>
            <p className="text-xs font-semibold text-zt-text-2">
              {meet.isDemo
                ? 'Hidden from the public shows list, DEMO shown on the scoreboard, registration closed. Built from a preset? Flip this before you publish the real thing.'
                : 'Listed publicly when the Listing allows it, registration can open, no DEMO label.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => updateMeetConfig({ isDemo: !meet.isDemo })}
            className={`px-3 py-2 rounded-lg font-black text-xs uppercase flex-shrink-0 ${meet.isDemo ? 'bg-zt-primary text-zt-on-primary' : 'bg-zt-surface-2 border border-zt-border-strong text-zt-text'}`}
          >
            {meet.isDemo ? 'Mark as Real Meet' : 'Mark as Demo'}
          </button>
        </div>
      )}

      {/* Name, Date & Slug */}
      <div className="space-y-3">
        <div>
          <label className="text-[11px] font-extrabold uppercase text-zt-muted">
            Meet Name
          </label>
          <input
            type="text"
            value={meet.name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. Keystone State Strongman 2026"
            className="w-full mt-1 bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-sm font-bold text-zt-text"
          />
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="text-[11px] font-extrabold uppercase text-zt-muted">
              Meet Date
            </label>
            <input
              type="date"
              value={meet.date || ''}
              onChange={(e) => updateMeetConfig({ date: e.target.value })}
              className="w-full mt-1 bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-xs font-bold text-zt-text"
            />
          </div>

          <div>
            <label className="text-[11px] font-extrabold uppercase text-zt-muted">
              URL Slug (Cloud Sync)
            </label>
            <input
              type="text"
              value={slugShown}
              onChange={(e) => setSlugDraft(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 60))}
              onBlur={commitSlug}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              placeholder="meet-slug"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="w-full mt-1 bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-xs font-mono font-bold text-zt-text"
            />
          </div>
        </div>
      </div>

      {/* Admin PIN & Collar Weight */}
      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-zt-border">
        <div>
          <label className="text-[11px] font-extrabold uppercase text-zt-muted">
            Admin PIN (4–6 Digits)
          </label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={meet.adminPin ?? ''}
            placeholder="Set on the publishing phone"
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
              updateMeetConfig({ adminPin: digits });
            }}
            onBlur={() => {
              // R1: an absent PIN (phone that joined by code) stays absent; a typed PIN shorter than 4 digits resets
              const cur = String(meet.adminPin ?? '');
              if (cur.length > 0 && cur.length < 4) updateMeetConfig({ adminPin: '1050' });
            }}
            className="w-full mt-1 bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-sm font-mono font-bold text-zt-text"
          />
        </div>

        <div>
          <label className="text-[11px] font-extrabold uppercase text-zt-muted">
            Collar Weight / Pair (lbs)
          </label>
          <input
            type="number"
            value={meet.collarWeightPerPair}
            onChange={(e) =>
              updateMeetConfig({ collarWeightPerPair: Number(e.target.value) || 0 })
            }
            className="w-full mt-1 bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-sm font-bold text-zt-text"
          />
        </div>
      </div>

      {/* Athlete run order. Each option explained on screen (Kurt 10/19); text mirrors lib/engine/runOrder.ts. Astra EO-L1 (10/21):
          with per-station event order, "Ev 1" is not always first, so the copy talks about earlier events on the station. */}
      <div>
        <label className="text-xs font-extrabold uppercase text-zt-muted">
          Athlete run order
        </label>
        <p className="text-[11px] font-semibold text-zt-muted mt-0.5">The first event on a station runs by lot number. The reverse methods take over once an earlier event on that station has results.</p>
        <div className="grid grid-cols-3 gap-2 mt-1.5">
          {RUN_ORDER_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={meet.runOrderMethod === value}
              onClick={() => updateMeetConfig({ runOrderMethod: value })}
              className={`py-2.5 px-3 rounded-xl font-black text-xs border transition ${
                meet.runOrderMethod === value
                  ? 'bg-zt-primary text-zt-on-primary border-zt-primary'
                  : 'bg-zt-inset text-zt-text-2 border-zt-border'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-1.5 space-y-1">
          {RUN_ORDER_OPTIONS.map(({ value, label, explain }) => (
            <p key={value} className={`text-[11px] rounded-lg px-2.5 py-1.5 border ${meet.runOrderMethod === value ? 'bg-zt-primary/10 border-zt-primary/50 text-zt-text font-semibold' : 'bg-zt-inset border-zt-border text-zt-muted'}`}>
              <strong className="font-black">{label}:</strong> {explain}
            </p>
          ))}
        </div>
      </div>

      {/* Tiebreaker Rule Toggle, explained the same way; mirrors calculateDivisionStandings in lib/engine/scoring.ts. */}
      <div>
        <label className="text-xs font-extrabold uppercase text-zt-muted">
          Overall Podium Tiebreaker
        </label>
        <p className="text-[11px] font-semibold text-zt-muted mt-0.5">Used only when two athletes finish on the same total points.</p>
        <div className="grid grid-cols-2 gap-2 mt-1.5">
          {TIEBREAK_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={meet.tiebreakerRule === value}
              onClick={() => updateMeetConfig({ tiebreakerRule: value })}
              className={`py-2.5 px-3 rounded-xl font-black text-xs border transition ${
                meet.tiebreakerRule === value
                  ? 'bg-zt-primary text-zt-on-primary border-zt-primary'
                  : 'bg-zt-inset text-zt-text-2 border-zt-border'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-1.5 space-y-1">
          {TIEBREAK_OPTIONS.map(({ value, label, explain }) => (
            <p key={value} className={`text-[11px] rounded-lg px-2.5 py-1.5 border ${meet.tiebreakerRule === value ? 'bg-zt-primary/10 border-zt-primary/50 text-zt-text font-semibold' : 'bg-zt-inset border-zt-border text-zt-muted'}`}>
              <strong className="font-black">{label}:</strong> {explain}
            </p>
          ))}
        </div>
      </div>

      {/* Gym Plate Inventory Toggles */}
      <div>
        <label className="text-xs font-extrabold uppercase text-zt-muted">
          Available Gym Plates (Tap to Enable/Disable)
        </label>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {ALL_POSSIBLE_PLATES.map((plate) => {
            const active = meet.availablePlates.includes(plate);
            return (
              <button
                key={plate}
                type="button"
                onClick={() => toggleGymPlate(plate)}
                className={`px-3 py-2 rounded-xl text-xs font-black border ${
                  active
                    ? 'bg-emerald-500 text-emerald-950 border-emerald-400'
                    : 'bg-zt-inset text-zt-muted border-zt-border'
                }`}
              >
                {plate} lb
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}