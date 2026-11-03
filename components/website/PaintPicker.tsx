'use client';
// Phase 6 (11/2): the promoter's paint, in the sheet grammar. Replaces ThemePicker. Same contract as before: `value`
// holds the raw field text (a half-typed hex survives), the parent's clean step normalises or refuses at save. What is
// new: the preview shows the three slots the colour can reach (CLIENT cell, card header band, live row) through
// resolveAccent, in daylight and on the dark board, with the ground from resolveGround; a colour that lands too close
// to the no-lift red is refused in plain words and the slots fall back to ink. No numbers, no amber warnings.
import React, { useId } from 'react';
import { PRESET_THEMES, normalizeHex, type ZtTheme } from '@/lib/website/theme';
import { describePaint, resolveGround, type Mode } from '@/lib/theme/promoter';
import { Cap, KeyButton } from './sheet';

interface PaintPickerProps {
  value: ZtTheme | null;
  onChange: (next: ZtTheme | null) => void;
  subject: 'gym' | 'show';
  previewName: string;
  inputClassName?: string; // kept for the old call sites; ignored (the picker draws its own ruled inputs)
  labelClassName?: string;
}

const INPUT = 'zt-input font-sheet !min-h-[40px] !py-1 !px-2 !border-0 !text-[14px] normal-case';

export default function PaintPicker({ value, onChange, subject, previewName }: PaintPickerProps) {
  const uid = useId();
  const draft: ZtTheme = value ?? { primary: '', background: '', secondary: '' };
  const where = subject === 'gym' ? 'your gym page' : 'the show page and the live board';
  const setField = (k: keyof ZtTheme, v: string) => onChange({ ...draft, [k]: v });

  if (!value) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink-muted">
          {subject === 'gym' ? 'Your gym page' : 'The show page and the live board'} are set in ink. Pick a colour and it fills three slots: the name cell, the card&rsquo;s header band and the live athlete row.
        </p>
        <KeyButton variant="line" onClick={() => onChange({ ...PRESET_THEMES[0].theme })}>Use my own colour</KeyButton>
      </div>
    );
  }

  const primary = normalizeHex(String(draft.primary ?? ''));
  const background = normalizeHex(String(draft.background ?? ''));
  const fields: Array<{ k: keyof ZtTheme; label: string; hint: string }> = [
    { k: 'primary', label: 'Your colour', hint: 'The three slots' },
    { k: 'background', label: 'Ground', hint: 'Around the board, toned to a light or dark grey' },
  ];

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-muted">
        This colour paints {where}. Start from a preset or type a hex like <span className="font-sheet">#1d3aa8</span>. We tone it so the label on it reads, and we refuse anything that could pass for the no-lift red.
      </p>

      <div>
        <Cap className="mb-1.5">Start from a preset</Cap>
        <div role="group" aria-label="Preset colours" className="zt-block grid-flow-col auto-cols-fr">
          {PRESET_THEMES.map((p) => {
            const on = normalizeHex(p.theme.primary) === primary;
            return (
              <button
                key={p.id}
                type="button"
                title={p.name}
                aria-label={`Preset ${p.name}`}
                aria-pressed={on}
                onClick={() => onChange({ ...p.theme })}
                className={`min-h-[40px] flex items-center justify-center gap-2 px-1 text-[11px] font-bold uppercase ${on ? '!bg-ink text-sheet' : 'text-ink'}`}
              >
                <span aria-hidden="true" className="w-4 h-4 shrink-0 border border-rule" style={{ background: p.theme.primary }} />
                <span className="hidden sm:inline truncate">{p.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="zt-block grid-cols-2">
        {fields.map((f) => {
          const raw = String(draft[f.k] ?? '');
          const hex = normalizeHex(raw);
          const id = `${uid}-${f.k}`;
          return (
            <div key={f.k} className="px-3 py-2 flex flex-col gap-1">
              <label htmlFor={id} className="text-xs tracking-[0.06em] uppercase text-ink-muted">{f.label}</label>
              <div className="flex items-center gap-2">
                <input type="color" aria-label={`${f.label} picker`} value={hex ?? '#000000'} onChange={(e) => setField(f.k, e.target.value)} className="w-9 h-9 shrink-0 p-0 border-2 border-rule bg-transparent cursor-pointer" />
                <input id={id} type="text" value={raw} onChange={(e) => setField(f.k, e.target.value)} placeholder="#rrggbb" spellCheck={false} autoComplete="off" maxLength={7} className={INPUT} />
              </div>
              <span className="text-[11px] text-ink-muted">{f.hint}</span>
            </div>
          );
        })}
      </div>

      {primary ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SlotPreview mode="home" primary={primary} background={background} name={previewName || (subject === 'gym' ? 'Your Gym' : 'Your Show')} />
          <SlotPreview mode="dark" primary={primary} background={background} name={previewName || (subject === 'gym' ? 'Your Gym' : 'Your Show')} />
        </div>
      ) : (
        <p className="text-sm text-ink-muted">Enter your colour as six-digit hex to see where it lands.</p>
      )}

      <KeyButton variant="line" onClick={() => onChange(null)} className="!min-h-10 !text-xs">Use ink instead</KeyButton>
    </div>
  );
}

/** One mode of the preview: a mini sheet with the three slots painted, and the plain-English note underneath. */
function SlotPreview({ mode, primary, background, name }: { mode: Mode; primary: string; background: string | null; name: string }) {
  const { result, note, tone } = describePaint(primary, mode);
  const ground = resolveGround(background, mode);
  const sheet = mode === 'home' ? '#ffffff' : '#000000';
  const ink = mode === 'home' ? '#111111' : '#f2f2f2';
  const rule = mode === 'home' ? '#111111' : '#f2f2f2';
  const muted = mode === 'home' ? '#6b6b6b' : '#9a9a9a';
  const slot: React.CSSProperties = { background: result.accent, color: result.label };
  return (
    <figure className="m-0" aria-label={`${mode === 'home' ? 'Daylight' : 'Dark board'} preview`}>
      <div className="p-3 font-sheet" style={{ background: ground }}>
        <div style={{ background: sheet, color: ink, border: `2px solid ${rule}` }}>
          <div className="grid grid-cols-[1fr_auto] text-[10px]" style={{ borderBottom: `1px solid ${rule}` }}>
            <div className="px-2 py-1.5" style={{ borderRight: `1px solid ${rule}` }}>
              <div className="uppercase tracking-[0.06em]" style={{ color: muted }}>Client</div>
              <div className="font-bold text-[12px] truncate px-1 -mx-1" style={slot}>{name}</div>
            </div>
            <div className="px-2 py-1.5"><div className="uppercase tracking-[0.06em]" style={{ color: muted }}>Sheet</div><div className="font-bold text-[12px]">A</div></div>
          </div>
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-[0.04em]" style={slot}>Open Men 231+ · Event 3 of 5</div>
          <div className="text-[11px]">
            <div className="grid grid-cols-[1fr_auto] px-2 py-1" style={{ borderBottom: `1px solid ${rule}` }}><span>Marcus Bell</span><span style={{ color: muted }}>12</span></div>
            <div className="grid grid-cols-[1fr_auto] px-2 py-1 font-bold" style={slot}><span>Daniel Reyes</span><span>Now</span></div>
            <div className="grid grid-cols-[1fr_auto] px-2 py-1"><span>Tom Okafor</span><span style={{ color: muted }}>On deck</span></div>
          </div>
        </div>
      </div>
      <figcaption className={`mt-1.5 text-[12px] leading-snug ${tone === 'red' ? 'text-redpen font-bold' : 'text-ink-muted'}`} aria-live="polite">
        <span className="uppercase tracking-[0.06em] text-ink-muted font-normal">{mode === 'home' ? 'Daylight' : 'Dark board'}</span>
        {note ? <> · {note}</> : <> · Your colour as typed.</>}
      </figcaption>
    </figure>
  );
}
