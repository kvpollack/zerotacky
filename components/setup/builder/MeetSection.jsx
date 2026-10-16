'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { ALL_POSSIBLE_PLATES } from '@/lib/constants';
import { slugify } from '@/lib/meetBuilder';

export default function MeetSection({
  meet,
  divisions,
  updateMeetConfig,
  toggleGymPlate,
  addStation,
  updateStation,
  removeStation,
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
  const [newStationLabel, setNewStationLabel] = useState('');

  const stations =
    Array.isArray(meet.stations) && meet.stations.length > 0
      ? meet.stations
      : [
          { id: 'A', label: 'Stn 1' },
          { id: 'B', label: 'Stn 2' },
        ];

  const handleNameChange = (nextName) => {
    const patch = { name: nextName };
    if (!slugManuallyEdited) {
      patch.slug = slugify(nextName);
    }
    updateMeetConfig(patch);
  };

  const handleAddStation = (e) => {
    e.preventDefault();
    addStation({ label: newStationLabel.trim() || `Stn ${stations.length + 1}` });
    setNewStationLabel('');
  };

  return (
    <section className="bg-zt-surface border border-zt-border rounded-2xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black uppercase tracking-wider text-zt-primary">
          1. Meet Details, Stations &amp; Rules
        </h2>
        {meet.isDemo && (
          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40">
            Demo Preset
          </span>
        )}
      </div>

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

      {/* Stations List (Min 1) */}
      <div className="pt-2 border-t border-zt-border space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-extrabold uppercase text-zt-muted">
            Stations / Flights ({stations.length})
          </label>
          <span className="text-[10px] font-bold text-zt-subtle">Min 1 station</span>
        </div>

        <div className="space-y-2">
          {stations.map((st) => {
            const assignedCount = divisions.filter((d) => d.flight === st.id).length;
            return (
              <div
                key={st.id}
                className="flex items-center gap-2 bg-zt-inset border border-zt-border rounded-xl p-2"
              >
                <span className="px-2 py-1 rounded bg-zt-surface-2 text-[11px] font-black text-zt-primary font-mono">
                  {st.id}
                </span>
                <input
                  type="text"
                  value={st.label}
                  onChange={(e) => updateStation(st.id, { label: e.target.value })}
                  aria-label={`Station ${st.id} label`}
                  className="flex-1 bg-zt-surface border border-zt-border-strong rounded-lg px-2.5 py-1.5 text-xs font-bold text-zt-text"
                />
                <span className="text-[10px] font-bold text-zt-muted whitespace-nowrap">
                  {assignedCount} div{assignedCount === 1 ? '' : 's'}
                </span>
                <button
                  type="button"
                  disabled={stations.length <= 1}
                  onClick={() => removeStation(st.id)}
                  title={stations.length <= 1 ? 'At least 1 station required' : `Remove ${st.label}`}
                  className="p-1.5 rounded-lg bg-zt-surface border border-zt-border-strong text-zt-muted hover:text-red-400 disabled:opacity-30"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        <form onSubmit={handleAddStation} className="flex gap-2">
          <input
            type="text"
            placeholder={`New station label (e.g. Stn ${stations.length + 1})...`}
            value={newStationLabel}
            onChange={(e) => setNewStationLabel(e.target.value)}
            className="flex-1 bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-xs font-bold text-zt-text"
          />
          <button
            type="submit"
            className="px-3 py-2 rounded-xl bg-zt-surface-2 border border-zt-border-strong text-zt-text font-black text-xs uppercase flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Add Station
          </button>
        </form>
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
            value={meet.adminPin ?? '1050'}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
              updateMeetConfig({ adminPin: digits });
            }}
            onBlur={() => {
              const cur = String(meet.adminPin ?? '');
              if (cur.length < 4) updateMeetConfig({ adminPin: '1050' });
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

      {/* Run Order Methodology Toggle */}
      <div>
        <label className="text-xs font-extrabold uppercase text-zt-muted">
          Run Order Methodology (Events 2+)
        </label>
        <div className="grid grid-cols-2 gap-2 mt-1.5">
          {[
            ['reverse_overall', 'Reverse Overall Pts'],
            ['reverse_previous_event', 'Reverse Prev Event'],
          ].map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => updateMeetConfig({ runOrderMethod: val })}
              className={`py-2.5 px-3 rounded-xl font-black text-xs border transition ${
                meet.runOrderMethod === val
                  ? 'bg-zt-primary text-zt-on-primary border-zt-primary'
                  : 'bg-zt-inset text-zt-text-2 border-zt-border'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tiebreaker Rule Toggle */}
      <div>
        <label className="text-xs font-extrabold uppercase text-zt-muted">
          Overall Podium Tiebreaker
        </label>
        <div className="grid grid-cols-2 gap-2 mt-1.5">
          {[
            ['event_wins', 'Most Event Wins'],
            ['final_event', 'Final Event Score'],
          ].map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => updateMeetConfig({ tiebreakerRule: val })}
              className={`py-2.5 px-3 rounded-xl font-black text-xs border transition ${
                meet.tiebreakerRule === val
                  ? 'bg-zt-primary text-zt-on-primary border-zt-primary'
                  : 'bg-zt-inset text-zt-text-2 border-zt-border'
              }`}
            >
              {label}
            </button>
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