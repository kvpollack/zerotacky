'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, FilePlus2, ShieldAlert } from 'lucide-react';
import { DEFAULT_PRESET_ID, MEET_PRESETS } from '@/lib/presets';
import { validateMeet } from '@/lib/meetBuilder';

export default function MeetsSection({
  state,
  meet,
  results,
  pendingPresetId,
  setPendingPresetId,
  requestMeetPreset,
  loadMeetPreset,
  createNewBlankMeet,
}) {
  const [newMeetPromptOpen, setNewMeetPromptOpen] = useState(false);
  const [blankName, setBlankName] = useState('');
  const [blankDate, setBlankDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [validationResult, setValidationResult] = useState(null);

  const handleCreateBlank = (e) => {
    e.preventDefault();
    const trimmed = blankName.trim() || 'New Strongman Meet';
    createNewBlankMeet(trimmed, blankDate);
    setBlankName('');
    setNewMeetPromptOpen(false);
    setValidationResult(null);
  };

  const runValidation = () => {
    setValidationResult(validateMeet(state));
  };

  return (
    <section className="bg-zt-surface border border-zt-border rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-black uppercase tracking-wider text-zt-primary">
          5. Meets, Demo Presets &amp; Readiness Check
        </h2>
        <button
          type="button"
          onClick={() => setNewMeetPromptOpen((o) => !o)}
          className="px-3 py-1.5 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase flex items-center gap-1.5 active:scale-95"
        >
          <FilePlus2 className="w-3.5 h-3.5" /> New Blank Meet
        </button>
      </div>

      {newMeetPromptOpen && (
        <form
          onSubmit={handleCreateBlank}
          className="bg-zt-inset border-2 border-zt-primary rounded-xl p-3 space-y-2.5"
        >
          <div className="text-xs font-black text-zt-text">
            Start a New Blank Meet (Current state is auto-snapshotted first)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Meet Name (e.g. PA Dutch Strong 16)..."
              value={blankName}
              onChange={(e) => setBlankName(e.target.value)}
              autoFocus
              className="bg-zt-surface border border-zt-border-strong rounded-lg px-2.5 py-2 text-xs font-bold text-zt-text"
            />
            <input
              type="date"
              value={blankDate}
              onChange={(e) => setBlankDate(e.target.value)}
              className="bg-zt-surface border border-zt-border-strong rounded-lg px-2.5 py-2 text-xs font-bold text-zt-text"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 py-2 rounded-lg bg-zt-primary text-zt-on-primary font-black text-xs uppercase"
            >
              Create Blank Meet
            </button>
            <button
              type="button"
              onClick={() => setNewMeetPromptOpen(false)}
              className="px-3 py-2 rounded-lg bg-zt-surface-2 text-zt-text-2 font-bold text-xs uppercase"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Demo Presets */}
      <div>
        <label className="text-[11px] font-extrabold uppercase text-zt-muted">
          Load Pre-Built Demo Meet
        </label>
        <div
          role="radiogroup"
          aria-label="Meet preset"
          className="grid grid-cols-2 gap-2 mt-1.5"
        >
          {MEET_PRESETS.map((preset) => {
            const active = Boolean(meet.isDemo && (meet.presetId ?? DEFAULT_PRESET_ID) === preset.id);
            return (
              <button
                key={preset.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => requestMeetPreset(preset.id)}
                className={`py-2.5 px-3 rounded-xl text-left border transition ${
                  active
                    ? 'bg-zt-primary text-zt-on-primary border-zt-primary'
                    : 'bg-zt-inset text-zt-text-2 border-zt-border'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-black text-xs leading-tight truncate">{preset.label}</span>
                  <span
                    className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded flex-shrink-0 ${
                      active
                        ? 'bg-black/25 text-white'
                        : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                    }`}
                  >
                    DEMO
                  </span>
                </div>
                <span
                  className={`block text-[10px] font-bold mt-0.5 ${
                    active ? 'text-zt-on-primary/70' : 'text-zt-muted'
                  }`}
                >
                  {preset.sublabel}
                </span>
              </button>
            );
          })}
        </div>

        {pendingPresetId && (
          <div className="mt-2 p-3 rounded-xl bg-zt-danger/10 border border-zt-danger/60 space-y-2">
            <p className="text-xs font-bold text-zt-danger-text">
              Switching to this demo preset replaces your current meet ({results.length} score
              {results.length === 1 ? '' : 's'}). A recovery snapshot is saved automatically.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => loadMeetPreset(pendingPresetId)}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-black text-xs uppercase"
              >
                Load Demo Preset
              </button>
              <button
                type="button"
                onClick={() => setPendingPresetId(null)}
                className="px-4 py-2.5 rounded-xl bg-zt-surface-2 text-zt-text-2 font-bold text-xs uppercase"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Validate Meet Button & Report */}
      <div className="pt-2 border-t border-zt-border space-y-2">
        <button
          type="button"
          onClick={runValidation}
          className="w-full py-2.5 rounded-xl bg-zt-inset border border-zt-border-strong text-zt-text font-black text-xs uppercase flex items-center justify-center gap-1.5 active:scale-95"
        >
          <ShieldAlert className="w-4 h-4 text-zt-primary" />
          Validate Meet Readiness
        </button>

        {validationResult && (
          validationResult.ok ? (
            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/50 text-emerald-300 text-xs font-black flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>Ready — All divisions, events, weights, and lot numbers are valid.</span>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-zt-danger/15 border border-zt-danger/60 space-y-1.5">
              <div className="text-xs font-black text-zt-danger-text flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{validationResult.problems.length} Issue{validationResult.problems.length === 1 ? '' : 's'} Found:</span>
              </div>
              <ul className="list-disc list-inside text-xs font-bold text-zt-danger-text space-y-0.5">
                {validationResult.problems.map((prob, i) => (
                  <li key={i}>{prob}</li>
                ))}
              </ul>
            </div>
          )
        )}
      </div>
    </section>
  );
}