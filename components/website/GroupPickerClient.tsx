'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth/useAuth';
import type { Division, EventDef, MeetUnits } from '@/lib/types';
import {
  FIT_LABELS, LANE_LABELS, VERDICT_LABELS, divisionGenderTag, lbToDisplay, numbersFromPRs, parseLiftInput, pickGroups,
  type DivisionFit, type PickerNumbers, type Unit,
} from '@/lib/website/groupPicker';
import { Cap, Key, KeyButton, WebCell } from './sheet';

interface Props {
  slug: string;
  divisions: Division[];
  events: EventDef[];
  canRegister: boolean;
  isDemoFixture: boolean;
  /** 059: the show's unit system. Division weights are converted for the ratio; the toggle starts in this unit. */
  units?: MeetUnits;
}

// "Which group fits me?" (gaps #13, 11/10). Three gym numbers, no strongman history needed; the divisions are ranked
// against the published weights by lib/website/groupPicker.ts. Signed in, the inputs seed from profile PRs. The result
// is a suggestion with the promoter named as the authority; the Register key carries the pick into step 1.
export default function GroupPickerClient({ slug, divisions, events, canRegister, isDemoFixture, units = 'imperial' }: Props) {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [unit, setUnit] = useState<Unit>(units === 'metric' ? 'kg' : 'lb');
  const [text, setText] = useState({ deadlift: '', overhead: '', carry: '' });
  // KM-06: the ratio runs on unrounded canonical pounds kept here; `text` is only what the inputs show. Typing parses
  // into `lb`, the toggle re-renders `text` from `lb`, so lb -> kg -> lb never moves the number under the ranking.
  const [lb, setLb] = useState<PickerNumbers>({ deadlift: null, overhead: null, carry: null });
  const [seeded, setSeeded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [gender, setGender] = useState<'all' | 'women' | 'men'>('all');
  const gendered = useMemo(() => divisions.some((d) => divisionGenderTag(d.name) !== null), [divisions]);
  const scoped = useMemo(() => gender === 'all' || !gendered ? divisions : divisions.filter((d) => { const t = divisionGenderTag(d.name); return t === null || t === gender; }), [divisions, gender, gendered]);

  // Astra GP-09: PR seeds are pounds; they are shown in whatever unit the toggle holds when they arrive.
  useEffect(() => {
    if (seeded || !auth.profile?.prs?.length) return;
    const n = numbersFromPRs(auth.profile.prs);
    setLb((cur) => ({ deadlift: cur.deadlift ?? n.deadlift, overhead: cur.overhead ?? n.overhead, carry: cur.carry ?? n.carry }));
    setText((cur) => ({
      deadlift: cur.deadlift || lbToDisplay(n.deadlift, unit),
      overhead: cur.overhead || lbToDisplay(n.overhead, unit),
      carry: cur.carry || lbToDisplay(n.carry, unit),
    }));
    setSeeded(true);
  }, [auth.profile, seeded, unit]);

  // One grammar (KM-05): what the athlete types is parsed once, in the toggle's unit, into canonical pounds.
  const edit = (lane: 'deadlift' | 'overhead' | 'carry', v: string) => {
    setText((c) => ({ ...c, [lane]: v }));
    setLb((c) => ({ ...c, [lane]: parseLiftInput(v, unit) }));
  };

  // Astra GP-08: switching lb / kg re-renders the parsed lifts in the new unit; the canonical pounds do not move.
  // Text the grammar could not read stays as typed.
  const switchUnit = (next: Unit) => {
    if (next === unit) return;
    setText((cur) => ({
      deadlift: lb.deadlift === null ? cur.deadlift : lbToDisplay(lb.deadlift, next),
      overhead: lb.overhead === null ? cur.overhead : lbToDisplay(lb.overhead, next),
      carry: lb.carry === null ? cur.carry : lbToDisplay(lb.carry, next),
    }));
    setUnit(next);
  };

  const numbers = lb;
  const result = useMemo(() => pickGroups(scoped, events, numbers, units), [scoped, events, numbers, units]);
  const hasNumbers = !!(numbers.deadlift || numbers.overhead || numbers.carry);
  const shown = showAll || !result.recommendedId ? result.divisions : result.divisions.slice(0, 3);

  if (divisions.length < 2) return null;

  return (
    <section aria-labelledby="group-picker-heading" id="which-group" className="mb-6" data-testid="group-picker">
      <WebCell pad="md" className="border-2 border-rule">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 max-w-2xl">
            <Cap>First show? Not sure which group</Cap>
            <h2 id="group-picker-heading" className="text-[22px] font-bold leading-tight text-ink mt-1">Which group fits me?</h2>
            <p className="text-[13px] text-ink-muted mt-1">
              Three numbers from your gym, no strongman history needed. The groups are ranked against the weights the
              promoter published. It is a suggestion: promoters move athletes to a better group before and on the day.
            </p>
          </div>
          <KeyButton variant={open ? 'ink' : 'line'} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="group-picker-body" className="!min-h-10 !px-4 !text-[12px]">
            {open ? 'Close' : 'Try it'}
          </KeyButton>
        </div>

        {open && (
          <div id="group-picker-body" className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
            <form className="flex flex-col gap-3" onSubmit={(e) => e.preventDefault()} aria-label="Your numbers">
              <div className="flex items-center justify-between">
                <Cap as="span">Your numbers</Cap>
                <SegmentedRadio ariaLabel="Unit" options={[['lb', 'lb'], ['kg', 'kg']]} value={unit} onChange={(v) => switchUnit(v as Unit)} uppercase />
              </div>
              <NumberField id="gp-deadlift" label="Deadlift" hint="Any bar, a single heavy rep" value={text.deadlift} unit={unit} onChange={(v) => edit('deadlift', v)} />
              <NumberField id="gp-overhead" label="Overhead press" hint="Barbell, dumbbell or log, one rep" value={text.overhead} unit={unit} onChange={(v) => edit('overhead', v)} />
              <NumberField id="gp-carry" label="Pick up and walk" hint="Heaviest thing you can lift to your chest or hands and walk 20 steps with (both hands together)" value={text.carry} unit={unit} onChange={(v) => edit('carry', v)} />
              {gendered && (
                <div className="flex flex-col gap-1">
                  <Cap as="span" id="gp-gender-label">Groups to rank</Cap>
                  <SegmentedRadio labelledBy="gp-gender-label" options={[['all', 'All'], ['women', "Women's"], ['men', "Men's"]]} value={gender} onChange={(v) => setGender(v as 'all' | 'women' | 'men')} />
                  <span className="text-[12px] text-ink-muted">Groups that do not name a gender stay in every view.</span>
                </div>
              )}
              {auth.profile?.prs?.length ? <p className="text-[12px] text-ink-muted">Started from the PRs on your profile; edit freely.</p> : null}
            </form>

            <div className="min-w-0">
              <p className="text-[14px] font-bold text-ink" data-testid="group-picker-note">{result.note}</p>
              <ol className="mt-3 flex flex-col gap-2.5" aria-label="Groups ranked for you">
                {shown.map((d) => (
                  <GroupCard key={d.divisionId} fit={d} recommended={d.divisionId === result.recommendedId} slug={slug} canRegister={canRegister && !isDemoFixture} hasNumbers={hasNumbers} />
                ))}
              </ol>
              {!showAll && result.recommendedId && result.divisions.length > 3 && (
                <button type="button" onClick={() => setShowAll(true)} className="mt-3 text-[13px] font-bold underline underline-offset-4 decoration-1 text-ink hover:text-pen">
                  Show all {result.divisions.length} groups
                </button>
              )}
              <p className="mt-4 text-[12px] text-ink-muted">
                Each published weight is compared to your number for that kind of lift. Comfortable means it is well
                under (roughly three quarters or less); Within reach means it is closer to your number; Above band means
                it is near or past it, and the group is a stretch or heavy for now. Events that are timed or measured
                for distance are compared by their published implement weight, not by the time. Pulls and drags, holds,
                throws, bench presses and anything the promoter left without a weight are not compared.
              </p>
            </div>
          </div>
        )}
      </WebCell>
    </section>
  );
}

// Astra GP-12: a segmented control that behaves like a native radio group: one tab stop (the checked option), arrow keys
// and Home / End move the selection, Space selects the focused option.
function SegmentedRadio({ options, value, onChange, ariaLabel, labelledBy, uppercase }: {
  options: ReadonlyArray<readonly [string, string]>; value: string; onChange: (v: string) => void; ariaLabel?: string; labelledBy?: string; uppercase?: boolean;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const select = (i: number) => { onChange(options[i][0]); refs.current[i]?.focus(); };
  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    const n = options.length;
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % n;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + n) % n;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = n - 1;
    if (e.key === ' ') next = i;
    if (next === null) return;
    e.preventDefault();
    select(next);
  };
  return (
    <div role="radiogroup" aria-label={ariaLabel} aria-labelledby={labelledBy} className="flex border-2 border-rule w-fit">
      {options.map(([v, label], i) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} tabIndex={value === v ? 0 : -1}
          ref={(el) => { refs.current[i] = el; }} onClick={() => onChange(v)} onKeyDown={(e) => onKeyDown(e, i)}
          className={`px-3 min-h-8 text-[12px] font-bold ${uppercase ? 'uppercase' : ''} ${value === v ? 'bg-ink text-sheet' : 'text-ink hover:bg-ground'}`}>{label}</button>
      ))}
    </div>
  );
}

function NumberField({ id, label, hint, value, unit, onChange }: { id: string; label: string; hint: string; value: string; unit: Unit; onChange: (v: string) => void }) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1">
      <span className="text-[13px] font-bold text-ink">{label} <span className="font-normal text-ink-muted">({unit})</span></span>
      <input id={id} type="text" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder={unit === 'lb' ? 'e.g. 225' : 'e.g. 100'}
        className="min-h-10 border-2 border-rule bg-sheet px-3 text-[14px] text-ink focus:outline-none focus:border-pen" />
      <span className="text-[12px] text-ink-muted">{hint}</span>
    </label>
  );
}

const FIT_TONE: Record<DivisionFit['fit'], string> = {
  fits: 'bg-ink text-sheet',
  stretch: 'border-2 border-ink text-ink',
  heavy: 'border-2 border-rule text-ink-muted',
  unrated: 'border-2 border-rule text-ink-muted',
};

function GroupCard({ fit, recommended, slug, canRegister, hasNumbers }: { fit: DivisionFit; recommended: boolean; slug: string; canRegister: boolean; hasNumbers: boolean }) {
  const compared = fit.events.filter((e) => e.verdict !== 'unrated');
  return (
    <li className={`border-2 ${recommended ? 'border-pen' : 'border-rule'} p-3`} data-testid="group-card" data-fit={fit.fit} data-recommended={recommended || undefined}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.04em] ${FIT_TONE[fit.fit]}`}>{recommended ? 'Suggested' : FIT_LABELS[fit.fit]}</span>
          <h3 className="text-[16px] font-bold text-ink truncate">{fit.name}</h3>
        </div>
        {canRegister && (
          <Key href={`/register/${slug}?division=${encodeURIComponent(fit.divisionId)}`} variant={recommended ? 'pen' : 'line'} className="!min-h-9 !px-3 !text-[12px]">
            Register in {fit.name}
          </Key>
        )}
      </div>
      <p className="mt-1.5 text-[13px] text-ink">{fit.line}</p>
      {hasNumbers && compared.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={`${fit.name} events compared`}>
          {fit.events.map((e) => (
            <li key={e.eventId} className={`text-[11px] px-2 py-0.5 border ${e.verdict === 'heavy' ? 'border-ink text-ink font-bold' : e.verdict === 'unrated' ? 'border-rule text-ink-muted' : 'border-rule text-ink'}`}>
              {e.name}{e.weightText ? ` · ${e.weightText}` : ''} · {VERDICT_LABELS[e.verdict]}{e.verdict !== 'unrated' ? ` (${LANE_LABELS[e.lane]})` : ''}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

