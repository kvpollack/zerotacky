'use client';

import React, { useId } from 'react';
import { Palette, X } from 'lucide-react';
import {
  PRESET_THEMES, cleanTheme, normalizeHex, themeBaseId, themeCssVars, themeWarnings, type ZtTheme,
} from '@/lib/website/theme';

// Colour ways (030): the owner of a gym listing or a show picks a main colour, a background and an optional second
// accent. `value` holds the raw field text (so a half-typed hex is not lost); the parent's clean step (cleanGymPatch /
// validateListingPatch) normalises or refuses it at save time. Contrast problems are plain words under the preview and
// never block the save (Kurt 10/27).
interface ThemePickerProps {
  value: ZtTheme | null;
  onChange: (next: ZtTheme | null) => void;
  subject: 'gym' | 'show';
  previewName: string;
  inputClassName?: string;
  labelClassName?: string;
}

const SWATCH = 'w-7 h-7 rounded-md border border-zt-border-strong shrink-0';

export default function ThemePicker({ value, onChange, subject, previewName, inputClassName, labelClassName }: ThemePickerProps) {
  const uid = useId();
  const inputCls = inputClassName ?? 'w-full bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-xs font-bold text-zt-text';
  const labelCls = labelClassName ?? 'block text-[11px] font-bold uppercase text-zt-muted mb-1';
  const draft: ZtTheme = value ?? { primary: '', background: '', secondary: '' };
  const clean = cleanTheme(draft);
  const preview = clean.theme;
  const warnings = preview ? themeWarnings(preview) : [];
  const where = subject === 'gym' ? 'your gym page' : 'the show page and the live board';

  const setField = (k: keyof ZtTheme, v: string) => onChange({ ...draft, [k]: v });
  const fields: Array<{ k: keyof ZtTheme; label: string; hint: string }> = [
    { k: 'primary', label: 'Main colour', hint: 'Headings, scores, buttons' },
    { k: 'background', label: 'Background', hint: 'The page behind everything' },
    { k: 'secondary', label: 'Second accent (optional)', hint: 'Chips and secondary buttons' },
  ];

  if (!value) {
    return (
      <div className="space-y-2">
        <div className="text-xs text-zt-text-2">
          {subject === 'gym' ? 'Your gym page' : 'The show page and the live board'} use the viewer&rsquo;s ZeroTacky theme. Pick your own colours and they show in yours instead.
        </div>
        <button
          type="button"
          onClick={() => onChange(PRESET_THEMES[0].theme)}
          className={"inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zt-surface-2 border border-zt-border text-xs font-extrabold uppercase text-zt-text hover:border-zt-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zt-primary focus-visible:ring-offset-2 focus-visible:ring-offset-zt-surface"}
        >
          <Palette className="w-3.5 h-3.5 text-zt-primary" aria-hidden="true" /> Use my own colours
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-zt-text-2">
        These colours paint {where}. Start from a preset, then adjust. Hex values like <span className="font-mono">#e11d48</span>.
      </div>

      <div>
        <div className={labelCls}>Start from a preset</div>
        <div className="flex flex-wrap gap-1.5">
          {PRESET_THEMES.map((p) => (
            <button
              key={p.id}
              type="button"
              title={p.name}
              aria-label={`Preset ${p.name}`}
              onClick={() => onChange({ ...p.theme })}
              className={"w-9 h-7 rounded-md border border-zt-border-strong overflow-hidden flex hover:ring-2 hover:ring-zt-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zt-primary focus-visible:ring-offset-2 focus-visible:ring-offset-zt-surface"}
              style={{ background: p.theme.background }}
            >
              <span className="block w-1/2 h-full" style={{ background: p.theme.primary }} />
              <span className="block w-1/4 h-full ml-auto" style={{ background: p.theme.secondary }} />
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {fields.map((f) => {
          const raw = String(draft[f.k] ?? '');
          const hex = normalizeHex(raw);
          const id = `${uid}-${f.k}`;
          return (
            <div key={f.k}>
              <label htmlFor={id} className={labelCls}>{f.label}</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label={`${f.label} picker`}
                  value={hex ?? '#000000'}
                  onChange={(e) => setField(f.k, e.target.value)}
                  className={`${SWATCH} p-0 cursor-pointer bg-transparent`}
                />
                <input
                  id={id}
                  type="text"
                  value={raw}
                  onChange={(e) => setField(f.k, e.target.value)}
                  placeholder="#rrggbb"
                  spellCheck={false}
                  autoComplete="off"
                  maxLength={7}
                  className={`${inputCls} font-mono`}
                />
              </div>
              <div className="text-[11px] text-zt-muted mt-1">{f.hint}</div>
            </div>
          );
        })}
      </div>

      {preview ? (
        <div
          data-zt-theme={themeBaseId(preview)}
          style={themeCssVars(preview) as React.CSSProperties}
          className="rounded-xl border border-zt-border-strong bg-zt-bg text-zt-text p-3 space-y-2"
          aria-label="Colour preview"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-black uppercase tracking-wide text-zt-primary truncate">{previewName || (subject === 'gym' ? 'Your Gym' : 'Your Show')}</div>
            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-zt-secondary text-zt-on-secondary">Preview</span>
          </div>
          <div className="bg-zt-surface border border-zt-border rounded-lg p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-black truncate">Open Men 231+</div>
              <div className="text-[11px] text-zt-muted">Event 3 of 5 · Log Press for Reps</div>
            </div>
            <div className="text-right">
              <div className="text-xl font-black text-zt-primary">12</div>
              <div className="text-[10px] font-bold uppercase text-zt-muted">reps</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="px-3 py-1.5 rounded-lg bg-zt-primary text-zt-on-primary text-xs font-extrabold uppercase">Register</span>
            <span className="px-3 py-1.5 rounded-lg bg-zt-surface-2 border border-zt-border text-zt-text-2 text-xs font-extrabold uppercase">Live Scoreboard</span>
          </div>
        </div>
      ) : (
        <div className="text-xs text-zt-muted">Enter a main colour and a background as six-digit hex to see a preview.</div>
      )}

      {warnings.length > 0 && (
        <ul className="space-y-1" aria-live="polite">
          {warnings.map((w) => (
            <li key={w} className="text-xs font-bold text-amber-300">{w}</li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => onChange(null)}
        className={"inline-flex items-center gap-1 text-[11px] font-extrabold uppercase text-zt-muted hover:text-zt-text rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zt-primary focus-visible:ring-offset-2 focus-visible:ring-offset-zt-surface"}
      >
        <X className="w-3 h-3" aria-hidden="true" /> Use the ZeroTacky default instead
      </button>
    </div>
  );
}
