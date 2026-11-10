'use client';
// Roster import with columns (11/5, feature gaps #6). Third add mode in the Athletes section, both hosts (scorer and
// promoter editor). Paste or upload a spreadsheet, confirm which column is which, read the preview, import. All the
// reading lives in lib/roster/import.ts; this file is the sheet around it.
import React, { useId, useMemo, useRef, useState } from 'react';
import type { Athlete, Division } from '@/lib/types';
import {
  buildRosterPlan, COLUMN_TARGETS, describePlan, guessMapping, looksLikeHeader, parseDelimited,
  ROSTER_FIELD_LABELS, ROSTER_IMPORT_MAX_ROWS, type ColumnTarget, type RosterPlan,
} from '@/lib/roster/import';
import { CAP, Field, Key, KeyGroup, Note, Select } from './parts';

const PLACEHOLDER = 'Name\tDivision\tBW\tLot\nDan Vance\tOpen Men\t231\t1\nMarcus Trent\tNovice Men\t205\t2';
const PREVIEW_ROWS = 12;

export type RosterImportProps = {
  divisions: Division[];
  athletes: Athlete[];
  defaultDivisionId: string;
  onDefaultDivisionChange: (id: string) => void;
  onImport: (plan: RosterPlan) => void;
  onCancel: () => void;
};

export default function RosterImport({ divisions, athletes, defaultDivisionId, onDefaultDivisionChange, onImport, onCancel }: RosterImportProps) {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [hasHeader, setHasHeader] = useState<boolean | null>(null); // null = not chosen, follow the guess
  const [mapping, setMapping] = useState<ColumnTarget[] | null>(null); // null = follow the guess
  const [done, setDone] = useState<string | null>(null);
  const uid = useId();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const sortedDivisions = useMemo(() => [...divisions].sort((a, b) => a.sortOrder - b.sortOrder), [divisions]);

  const rows = useMemo(() => (text.trim() ? parseDelimited(text) : []), [text]);
  const firstRow = rows[0] ?? [];
  const headerGuess = looksLikeHeader(firstRow);
  const header = hasHeader ?? headerGuess;
  const effectiveMapping = useMemo<ColumnTarget[]>(() => {
    const guess = guessMapping(firstRow, header);
    if (!mapping) return guess;
    return guess.map((g, i) => mapping[i] ?? g);
  }, [firstRow, header, mapping]);
  // A new paste resets the choices; the guesses take over again.
  const updateText = (t: string) => { setText(t); setMapping(null); setHasHeader(null); setDone(null); };

  const plan = useMemo<RosterPlan | null>(() => {
    if (rows.length === 0) return null;
    return buildRosterPlan({ rows, mapping: effectiveMapping, hasHeader: header, divisions, athletes, defaultDivisionId });
  }, [rows, effectiveMapping, header, divisions, athletes, defaultDivisionId]);

  const divisionMapped = effectiveMapping.includes('division');
  const sample = (i: number) => (header ? rows[1]?.[i] : rows[0]?.[i]) ?? '';

  const onFile = async (file: File | undefined) => {
    setFileError(null);
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setFileError('That file is over 2 MB. Paste the rows instead.'); return; }
    try {
      const t = await file.text();
      updateText(t);
      setFileName(file.name);
    } catch {
      setFileError('Could not read that file. Paste the rows instead.');
    }
  };
  const setColumn = (i: number, target: ColumnTarget) => {
    const next = [...effectiveMapping];
    // One column per field: another column holding this field goes back to Ignore.
    if (target !== 'ignore') next.forEach((t, j) => { if (j !== i && t === target) next[j] = 'ignore'; });
    next[i] = target;
    setMapping(next);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!plan || plan.problems.length || plan.adding === 0) return;
    onImport(plan);
    setText('');
    setMapping(null);
    setHasHeader(null);
    setFileName(null);
    setDone(describePlan(plan).replace(/^Add /, 'Added '));
    textRef.current?.focus();
  };

  const divOptions = sortedDivisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>);
  const canImport = Boolean(plan && !plan.problems.length && plan.adding > 0);

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" aria-labelledby={`${uid}-cap`}>
      <div className="zt-block grid-cols-2">
        <Field label={<span id={`${uid}-cap`}>Paste a spreadsheet (CSV or tab-separated)</span>} wide>
          <textarea
            ref={textRef}
            rows={5}
            placeholder={PLACEHOLDER}
            value={text}
            onChange={(e) => updateText(e.target.value)}
            spellCheck={false}
            className="zt-input font-sheet !border-0 !px-1 !py-1 !text-[13px] !min-h-[100px] whitespace-pre"
          />
        </Field>
        <label className="flex flex-col justify-center px-2 py-1.5 min-h-[44px]">
          <span className={`block text-[9px] mb-0.5 ${CAP}`}>Or upload a file</span>
          <input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} className="font-sheet text-[12px] text-ink file:font-sheet file:uppercase file:font-bold file:text-[11px] file:border-2 file:border-rule file:bg-sheet file:text-ink file:px-2 file:py-1 file:mr-2" />
          {fileName && !fileError && <span className="text-[10px] text-pen mt-0.5">{fileName}</span>}
          {fileError && <span className="text-[10px] text-redpen mt-0.5" role="alert">{fileError}</span>}
        </label>
        <Field label="First row is" group>
          <KeyGroup ariaLabel="First row is" options={[{ value: 'header', label: 'Headers' }, { value: 'data', label: 'An athlete' }]} value={header ? 'header' : 'data'} onChange={(v) => setHasHeader(v === 'header')} disabled={rows.length === 0} />
        </Field>
      </div>
      <Note className="!mt-0">
        Export the sheet as CSV from Excel or Google Sheets, or copy the cells and paste them here. Columns you can bring in: name
        (or first and last), division, bodyweight, lot number. Divisions that are not on this meet yet get created. Up to {ROSTER_IMPORT_MAX_ROWS} rows.
      </Note>

      {rows.length > 0 && (
        <>
          <div className="zt-block grid-cols-1">
            <div className={`px-1.5 min-h-[18px] flex items-center text-[9px] !bg-ground ${CAP}`}>Columns ({firstRow.length})</div>
            {firstRow.map((cell, i) => (
              <label key={i} className="grid grid-cols-[1fr_1fr] gap-px !bg-rule [&>*]:bg-sheet items-stretch">
                <span className="px-1.5 min-h-[36px] flex flex-col justify-center min-w-0">
                  <span className="text-[13px] font-bold text-ink whitespace-nowrap overflow-hidden text-ellipsis">{header ? cell || `Column ${i + 1}` : `Column ${i + 1}`}</span>
                  <span className="text-[10px] text-ink-muted whitespace-nowrap overflow-hidden text-ellipsis">{sample(i) ? `e.g. ${sample(i)}` : 'empty'}</span>
                </span>
                <span className="flex items-center px-1.5 [&>span]:w-full">
                  <Select value={effectiveMapping[i]} onChange={(e) => setColumn(i, e.target.value as ColumnTarget)} aria-label={`Column ${i + 1}${header && cell ? ` (${cell})` : ''} is`} className={`!text-[13px] ${effectiveMapping[i] === 'ignore' ? '!text-ink-muted' : '!text-pen'}`}>
                    {COLUMN_TARGETS.map((t) => <option key={t} value={t}>{ROSTER_FIELD_LABELS[t]}</option>)}
                  </Select>
                </span>
              </label>
            ))}
          </div>

          {!divisionMapped && (
            <div className="zt-block grid-cols-1">
              <Field label="Every athlete goes to">
                <Select value={defaultDivisionId} onChange={(e) => onDefaultDivisionChange(e.target.value)} aria-label="Division for every imported athlete">{divOptions}</Select>
              </Field>
            </div>
          )}

          {plan && <Preview plan={plan} />}
        </>
      )}

      {done && <div role="status" className="border-2 border-rule px-2 min-h-[30px] flex items-center text-[11px] font-bold text-pen">{done}</div>}

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Key variant="pen" type="submit" disabled={!canImport}>{plan && canImport ? `Import ${plan.adding} Athlete${plan.adding === 1 ? '' : 's'}` : 'Import'}</Key>
        <Key onClick={onCancel}>Cancel</Key>
      </div>
    </form>
  );
}

function Preview({ plan }: { plan: RosterPlan }) {
  const shown = plan.rows.slice(0, PREVIEW_ROWS);
  const more = plan.rows.length - shown.length;
  const problem = plan.problems.length > 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div role="status" className={`border-2 px-2 min-h-[30px] flex items-center text-[11px] font-bold ${problem ? 'border-redpen text-redpen' : 'border-rule text-pen'}`}>
        {describePlan(plan)}
      </div>
      <div className="zt-block grid-cols-1">
        <div className="grid grid-cols-[40px_1fr_1fr_60px] gap-px !bg-rule [&>*]:!bg-ground">
          <span className={`px-1.5 min-h-[18px] flex items-center justify-center text-[9px] ${CAP}`}>Lot</span>
          <span className={`px-1.5 min-h-[18px] flex items-center text-[9px] ${CAP}`}>Athlete</span>
          <span className={`px-1.5 min-h-[18px] flex items-center text-[9px] ${CAP}`}>Division</span>
          <span className={`px-1.5 min-h-[18px] flex items-center justify-center text-[9px] ${CAP}`}>BW</span>
        </div>
        {shown.map((r) => {
          const skipped = r.skip !== null;
          const tone = skipped ? 'text-ink-muted' : 'text-ink';
          const strike = skipped ? 'line-through' : '';
          return (
            <div key={r.line} className="grid grid-cols-[40px_1fr_1fr_60px] gap-px !bg-rule [&>*]:bg-sheet [&>*]:min-w-0">
              <span className={`px-1.5 min-h-[30px] flex items-center justify-center text-[12px] ${tone}`}>{skipped ? '' : r.lotNumber ?? <span className="text-ink-muted" aria-label="next free lot">&#x2013;</span>}</span>
              <span className={`px-1.5 min-h-[30px] flex flex-col justify-center text-[13px] font-bold ${tone}`}>
                {r.name ? <span className={`whitespace-nowrap overflow-hidden text-ellipsis ${strike}`}>{r.name}</span> : <span className="font-normal text-ink-muted">(no name, line {r.line})</span>}
                {r.notes.length > 0 && <span className={`text-[10px] font-normal leading-snug whitespace-normal ${skipped ? 'text-redpen' : 'text-ink-muted'}`}>{r.notes.join(' ')}</span>}
              </span>
              <span className={`px-1.5 min-h-[30px] flex items-center gap-1 text-[12px] ${tone}`}>
                <span className={`whitespace-nowrap overflow-hidden text-ellipsis ${strike}`}>{r.divisionName || '\u2014'}</span>
                {r.divisionId === null && r.divisionName && !skipped && <span className={`shrink-0 text-[9px] font-bold text-pen ${CAP}`}>new</span>}
              </span>
              <span className={`px-1.5 min-h-[30px] flex items-center justify-center text-[12px] ${tone} ${strike}`}>{r.bodyweight !== undefined ? r.bodyweight : ''}</span>
            </div>
          );
        })}
        {more > 0 && <div className="px-1.5 min-h-[26px] flex items-center text-[11px] text-ink-muted">and {more} more row{more === 1 ? '' : 's'}</div>}
      </div>
    </div>
  );
}
