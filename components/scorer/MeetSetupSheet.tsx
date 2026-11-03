'use client';
// Phase 5 (11/2): Meet Setup as a sheet (approved mockup scorer_setup.html). Six sections behind an index strip, one
// shown at a time; every handler and every string is carried over from components/setup/builder/* unchanged. The old
// builder files stay because the promoter editor still uses them. EventForm is reused as-is inside the events list.
import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, GripVertical } from 'lucide-react';
import type { Athlete, Division, EventDef, Meet, Result, Station } from '@/lib/types';
import { ALL_POSSIBLE_PLATES, THEMES } from '@/lib/constants';
import { slugify, validateMeet } from '@/lib/meetBuilder';
import { DEFAULT_PRESET_ID, MEET_PRESETS } from '@/lib/presets';
import { hasCustomEventOrder, moveEventInOrder, stationEvents } from '@/lib/engine';
import { RUN_ORDER_OPTIONS, TIEBREAK_OPTIONS } from '@/components/setup/builder/MeetSection';
import EventForm from '@/components/setup/builder/EventForm';
import CloudSync, { type PanelSync } from './CloudSync';
import { CAP, Field, Key, KeyGroup, Note, NumInput, Sec, Select, TextInput, Toast } from './parts';
import { SETUP_SECTIONS, type SetupSectionId } from './scorerModel';

const TYPE_LABELS: Record<string, string> = {
  reps: 'Reps',
  max_weight: 'Max Wt',
  time_or_distance: 'Time / Dist',
  time_or_implements: 'Stones / Impl',
};

const DEFAULT_STATIONS = [
  { id: 'A', label: 'Station 1' },
  { id: 'B', label: 'Station 2' },
] as Station[];
const stationsOf = (meet: Meet): Station[] => (Array.isArray(meet.stations) && meet.stations.length > 0 ? meet.stations : DEFAULT_STATIONS);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A list row: a real box (not display:contents) so drag code can measure it. Children get the sheet background. */
function Line({ cols, className = '', children, style, ...rest }: React.HTMLAttributes<HTMLDivElement> & { cols: string }) {
  return (
    <div {...rest} className={`grid gap-px !bg-rule [&>*]:bg-sheet [&>*]:min-w-0 ${className}`} style={{ gridTemplateColumns: cols, ...(style ?? {}) }}>
      {children}
    </div>
  );
}
/** A cell in a Line. */
function C({ className = '', children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={`px-1.5 min-h-[36px] flex items-center text-[13px] ${className}`}>{children}</div>;
}
/** A full-width row of keys inside a list (confirmations). */
function ConfirmLine({ children, text }: { children: React.ReactNode; text: React.ReactNode }) {
  return (
    <Line cols="1fr">
      <div className="px-2 py-1.5 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-redpen min-w-0">{text}</span>
        <span className="flex gap-1.5 shrink-0">{children}</span>
      </div>
    </Line>
  );
}
/** A small square icon key for list rows. */
function IconKey({ className = '', red, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { red?: boolean }) {
  return <button type="button" {...rest} className={`min-h-[36px] w-full flex items-center justify-center text-[13px] font-bold disabled:text-ink-muted/40 ${red ? '!bg-redpen text-sheet' : 'text-ink-muted'} ${className}`} />;
}
const X = () => <span aria-hidden="true">&#x2715;</span>;
const Form = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => <div className={`zt-block grid-cols-2 ${className}`}>{children}</div>;
const Empty = ({ children }: { children: React.ReactNode }) => <div className="border-2 border-rule px-2 py-2 text-[12px] text-ink-muted">{children}</div>;

export type MeetSetupSheetProps = {
  state: unknown;
  meet: Meet;
  divisions: Division[];
  events: EventDef[];
  athletes: Athlete[];
  results: Result[];
  themeId: string;
  selectTheme: (id: string) => void;
  updateMeetConfig: (patch: Partial<Meet>) => void;
  toggleGymPlate: (plate: number) => void;
  addStation: (s: { label: string }) => void;
  updateStation: (id: string, patch: { label?: string; eventOrder?: string[] | null }) => void;
  removeStation: (id: string) => void;
  addDivision: (d: { name: string; flight: string }) => void;
  updateDivision: (id: string, patch: { name?: string; flight?: string }) => void;
  removeDivision: (id: string) => void;
  reorderDivisions: (ids: string[]) => void;
  addEvent: (payload: unknown) => void;
  updateEvent: (id: string, patch: unknown) => void;
  removeEvent: (id: string) => void;
  reorderEvents: (ids: string[]) => void;
  addAthlete: (a: { divisionId: string; name: string }) => void;
  bulkAddAthletes: (divisionId: string, text: string) => void;
  updateAthlete: (id: string, patch: { lotNumber?: number; name?: string }) => void;
  removeAthlete: (id: string) => void;
  moveAthlete: (id: string, divisionId: string) => void;
  shuffleLots: (divisionId: string) => void;
  moveLot?: (divisionId: string, athleteId: string, toIndex: number) => void;
  toggleAthleteWithdrawn: (a: Athlete) => void;
  createNewBlankMeet: (name: string, date: string) => void;
  pendingPresetId: string | null;
  setPendingPresetId: (id: string | null) => void;
  requestMeetPreset: (id: string) => void;
  loadMeetPreset: (id: string) => void;
  clearResults: () => void;
  resetConfirmOpen: boolean;
  setResetConfirmOpen: (open: boolean) => void;
  sync: PanelSync | null | undefined;
  section: SetupSectionId;
  setSection: (id: SetupSectionId) => void;
  // Promoter editor host (meet-editor swap, 11/3): the website's PromoterMeetDetailClient renders the five sections
  // below one per tab. 'promoter' hides the scorer-only parts of Meet Details (demo toggle, cloud sync, theme, reset:
  // the Listing tab and the dashboard own those), onEditingChange / closeFormSignal let its dirty bar track an open
  // EventForm draft, and sectionNumbers overrides the step numbers in the headers (its Athletes tab is 7, not 5).
  host?: 'scorer' | 'promoter';
  onEditingChange?: (open: boolean) => void;
  closeFormSignal?: number;
  sectionNumbers?: Partial<Record<SetupSectionId, number>>;
};

const stepNo = (p: MeetSetupSheetProps, id: SetupSectionId) => p.sectionNumbers?.[id] ?? SETUP_SECTIONS.find((s) => s.id === id)!.n;

// The five build sections, for the promoter editor (host='promoter'). The scorer keeps rendering them through the default export.
export { MeetDetails as SheetMeetDetails, Divisions as SheetDivisions, Events as SheetEvents, Stations as SheetStations, Athletes as SheetAthletes };

export default function MeetSetupSheet(props: MeetSetupSheetProps) {
  const { section, setSection } = props;
  return (
    <div className="flex flex-col gap-2">
      <SectionStrip section={section} setSection={setSection} />
      {section === 'meet' && <MeetDetails {...props} />}
      {section === 'divisions' && <Divisions {...props} />}
      {section === 'events' && <Events {...props} />}
      {section === 'stations' && <Stations {...props} />}
      {section === 'athletes' && <Athletes {...props} />}
      {section === 'meets' && <Meets {...props} />}
    </div>
  );
}

/** Index strip: the open section spells its name, the others show their number. */
function SectionStrip({ section, setSection }: { section: SetupSectionId; setSection: (id: SetupSectionId) => void }) {
  const idx = Math.max(0, SETUP_SECTIONS.findIndex((s) => s.id === section));
  const cols = SETUP_SECTIONS.map((_, i) => (i === idx ? '1fr' : '36px')).join(' ');
  return (
    <div role="tablist" aria-label="Setup section" className="zt-block" style={{ gridTemplateColumns: cols }}>
      {SETUP_SECTIONS.map((s) => {
        const on = s.id === section;
        return (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => setSection(s.id)}
            className={`min-h-[40px] px-2 flex items-center justify-center gap-2 font-sheet uppercase font-bold text-[12px] ${on ? '!bg-ink text-sheet' : 'text-ink'}`}
          >
            <span className="text-[14px]">{s.n}</span>
            {on && <span className="min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">{s.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

// 1. Meet Details & Rules (MeetSection + the reset keys and theme pick that used to sit under Advanced Settings)
function MeetDetails(props: MeetSetupSheetProps) {
  const { meet, updateMeetConfig, toggleGymPlate, sync, clearResults, loadMeetPreset, resetConfirmOpen, setResetConfirmOpen, themeId, selectTheme, host = 'scorer' } = props;
  const isDemo = Boolean(meet.isDemo);
  // promoter host: a published meet's slug is its public URL (QR codes, the federation results link), so typing in the
  // name never rewrites it there; the slug field itself stays editable. The scorer keeps deriving it from the name.
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(host === 'promoter');
  // Slug is edited as a draft: lowercase + hyphens while typing (so a trailing "-" or an emptied field survive
  // the keystroke), then fully slugified on blur. Slugifying on every keystroke made "-" impossible to type
  // and turned an empty field into "meet" (found 10/16).
  const [slugDraft, setSlugDraft] = useState<string | null>(null);
  const slugShown = slugDraft ?? meet.slug ?? slugify(meet.name);
  const commitSlug = () => {
    if (slugDraft === null) return;
    const next = slugDraft.trim() ? slugify(slugDraft) : slugify(meet.name);
    setSlugManuallyEdited(slugDraft.trim().length > 0);
    updateMeetConfig({ slug: next });
    setSlugDraft(null);
  };
  const handleNameChange = (nextName: string) => {
    const patch: Partial<Meet> = { name: nextName };
    if (!slugManuallyEdited) patch.slug = slugify(nextName);
    updateMeetConfig(patch);
  };

  return (
    <>
      <Sec right={isDemo ? 'This is a demo meet' : 'This is a real meet'}>{stepNo(props, 'meet')}. Meet Details &amp; Rules</Sec>
      <Form>
        <Field label="Meet Name" wide>
          <TextInput type="text" value={meet.name} onChange={(e) => handleNameChange(e.target.value)} placeholder="e.g. Keystone State Strongman 2026" />
        </Field>
        <Field label="Meet Date">
          <TextInput type="date" value={meet.date || ''} onChange={(e) => updateMeetConfig({ date: e.target.value })} />
        </Field>
        <Field label="Admin PIN (4–6 Digits)">
          <TextInput
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={meet.adminPin ?? ''}
            placeholder="Set on the publishing phone"
            onChange={(e) => updateMeetConfig({ adminPin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
            onBlur={() => {
              // R1: an absent PIN (phone that joined by code) stays absent; a typed PIN shorter than 4 digits resets
              const cur = String(meet.adminPin ?? '');
              if (cur.length > 0 && cur.length < 4) updateMeetConfig({ adminPin: '1050' });
            }}
          />
        </Field>
        <Field label="URL Slug (Cloud Sync)" wide>
          <TextInput
            type="text"
            value={slugShown}
            onChange={(e) => setSlugDraft(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 60))}
            onBlur={commitSlug}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            placeholder="meet-slug"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="normal-case"
          />
        </Field>
        <Field label="Default Collar Weight / Pair (lbs)" wide note="Prefilled on new events. Each event sets its own collar weight in the event form.">
          <NumInput min={0} step={0.5} value={meet.collarWeightPerPair} onChange={(v) => updateMeetConfig({ collarWeightPerPair: Number(v) || 0 })} />
        </Field>
        <div className="col-span-full px-2 py-1.5">
          <span className={`block text-[9px] mb-1 ${CAP}`}>Athlete run order</span>
          <KeyGroup ariaLabel="Athlete run order" options={RUN_ORDER_OPTIONS} value={meet.runOrderMethod} onChange={(v) => updateMeetConfig({ runOrderMethod: v as Meet['runOrderMethod'] })} />
          <Note>The first event on a station runs by lot number. The reverse methods take over once an earlier event on that station has results.</Note>
          {RUN_ORDER_OPTIONS.map(({ value, label, explain }: { value: string; label: string; explain: string }) => (
            <Note key={value} className={meet.runOrderMethod === value ? 'text-ink' : ''}><strong>{label}:</strong> {explain}</Note>
          ))}
        </div>
        <div className="col-span-full px-2 py-1.5">
          <span className={`block text-[9px] mb-1 ${CAP}`}>Overall Podium Tiebreaker</span>
          <KeyGroup ariaLabel="Overall Podium Tiebreaker" options={TIEBREAK_OPTIONS} value={meet.tiebreakerRule} onChange={(v) => updateMeetConfig({ tiebreakerRule: v as Meet['tiebreakerRule'] })} />
          <Note>Used only when two athletes finish on the same total points.</Note>
          {TIEBREAK_OPTIONS.map(({ value, label, explain }: { value: string; label: string; explain: string }) => (
            <Note key={value} className={meet.tiebreakerRule === value ? 'text-ink' : ''}><strong>{label}:</strong> {explain}</Note>
          ))}
        </div>
        <div className="col-span-full px-2 py-1.5">
          <span className={`block text-[9px] mb-1 ${CAP}`}>Available Gym Plates (Tap to Enable/Disable)</span>
          <div role="group" aria-label="Available Gym Plates" className="zt-block grid-cols-5">
            {ALL_POSSIBLE_PLATES.map((plate) => {
              const active = meet.availablePlates.includes(plate);
              return (
                <button key={plate} type="button" aria-pressed={active} onClick={() => toggleGymPlate(plate)} className={`min-h-[36px] font-sheet font-bold text-[12px] ${active ? '!bg-ink text-sheet' : 'text-ink-muted'}`}>
                  {plate} lb
                </button>
              );
            })}
          </div>
        </div>
      </Form>

      {host === 'promoter' ? null : (<>
      {/* 010: a meet built from a demo preset carries isDemo until the promoter says otherwise. Demo = hidden from /shows,
          DEMO on the scoreboard and app header, registration refused. The server never flips a real meet back to demo. */}
      <Note className="!mt-0">
        {isDemo
          ? 'Hidden from the public shows list, DEMO shown on the scoreboard, registration closed. Built from a preset? Flip this before you publish the real thing.'
          : 'Listed publicly when the Listing allows it, registration can open, no DEMO label.'}
      </Note>
      <Key variant={isDemo ? 'pen' : 'line'} onClick={() => updateMeetConfig({ isDemo: !meet.isDemo })}>{isDemo ? 'Mark as Real Meet' : 'Mark as Demo'}</Key>

      <CloudSync sync={sync} meet={meet} />

      <Sec>Promoter Theme</Sec>
      <Form>
        <Field label="Theme" wide note="Colours the TV board and public pages. The scorer keeps its sheet.">
          <Select value={themeId} onChange={(e) => selectTheme(e.target.value)} aria-label="Promoter Theme">
            {THEMES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
      </Form>

      <Sec>Reset</Sec>
      {!resetConfirmOpen ? (
        <Key variant="red" onClick={() => setResetConfirmOpen(true)}>{isDemo ? 'Reset this meet to its preset' : 'Clear all scores'}</Key>
      ) : (
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Key
            variant="red"
            onClick={() => {
              if (isDemo) {
                loadMeetPreset(meet.presetId ?? DEFAULT_PRESET_ID);
              } else {
                clearResults();
                setResetConfirmOpen(false);
              }
            }}
          >
            {isDemo ? 'Confirm Preset Reset' : 'Confirm Clear All Scores'}
          </Key>
          <Key onClick={() => setResetConfirmOpen(false)}>Cancel</Key>
        </div>
      )}
      </>)}
    </>
  );
}

// 2. Divisions
function Divisions(props: MeetSetupSheetProps) {
  const { meet, divisions, athletes, results, addDivision, updateDivision, removeDivision, reorderDivisions } = props;
  const stations = stationsOf(meet);
  const stationIds = new Set(stations.map((s) => s.id));
  const [newDivName, setNewDivName] = useState('');
  // New divisions land on the first station; the promoter spreads them across stations in step 4 (after events, 10/26).
  const newDivFlight = stations[0]?.id ?? 'A';
  const stationLabel = (id: string) => stations.find((s) => s.id === id)?.label ?? `Missing (${id})`;
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);
  const sortedDivisions = [...divisions].sort((a, b) => a.sortOrder - b.sortOrder);

  const handleAddDivision = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDivName.trim()) return;
    const validFlight = stationIds.has(newDivFlight) ? newDivFlight : stations[0]?.id ?? 'A';
    addDivision({ name: newDivName.trim(), flight: validFlight });
    setNewDivName('');
  };
  const moveDivision = (index: number, direction: number) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= sortedDivisions.length) return;
    const ids = sortedDivisions.map((d) => d.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(targetIndex, 0, moved);
    reorderDivisions(ids);
  };

  return (
    <>
      <Sec right={`Stations are assigned in step ${stepNo(props, 'stations')}`}>{stepNo(props, 'divisions')}. Divisions ({sortedDivisions.length})</Sec>
      {sortedDivisions.length === 0 ? (
        <Empty>No divisions yet. Add your first division or weight class below.</Empty>
      ) : (
        <div className="zt-block grid-cols-1">
          {sortedDivisions.map((div, idx) => {
            const divAthletes = athletes.filter((a) => a.divisionId === div.id);
            const divAthIds = new Set(divAthletes.map((a) => a.id));
            const divResultCount = results.filter((r) => divAthIds.has(r.athleteId)).length;
            const invalidStation = !stationIds.has(div.flight);
            const isArmed = armedDeleteId === div.id;
            return (
              <React.Fragment key={div.id}>
                <Line cols="28px 28px 1fr auto 36px">
                  <IconKey disabled={idx === 0} onClick={() => moveDivision(idx, -1)} aria-label={`Move ${div.name} up`}><ArrowUp className="w-3.5 h-3.5" /></IconKey>
                  <IconKey disabled={idx === sortedDivisions.length - 1} onClick={() => moveDivision(idx, 1)} aria-label={`Move ${div.name} down`}><ArrowDown className="w-3.5 h-3.5" /></IconKey>
                  <C><TextInput type="text" value={div.name} onChange={(e) => updateDivision(div.id, { name: e.target.value })} aria-label="Division name" className="!text-[13px]" /></C>
                  <C className="text-[10px] whitespace-nowrap flex-col !items-end justify-center leading-tight" title="Station (set in step 4)">
                    <span className={invalidStation ? 'text-redpen font-bold' : CAP}>{stationLabel(div.flight)}</span>
                    <span className={CAP}>{divAthletes.length} ath</span>
                  </C>
                  <IconKey red={isArmed} onClick={() => setArmedDeleteId(isArmed ? null : div.id)} aria-label={`Remove ${div.name}`}><X /></IconKey>
                </Line>
                {invalidStation && (
                  <Line cols="1fr"><div className="px-2 py-1 text-[11px] font-bold text-redpen">Station &ldquo;{div.flight}&rdquo; was removed; pick a station in step 4 or this division shows under &ldquo;All&rdquo; only.</div></Line>
                )}
                {isArmed && (
                  <ConfirmLine text={<>Remove <strong>{div.name}</strong> ({plural(divAthletes.length, 'athlete')}, {plural(divResultCount, 'score')})?</>}>
                    <Key size="sm" variant="red" onClick={() => { removeDivision(div.id); setArmedDeleteId(null); }}>Tap to Confirm</Key>
                    <Key size="sm" onClick={() => setArmedDeleteId(null)}>Cancel</Key>
                  </ConfirmLine>
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}
      <form onSubmit={handleAddDivision} className="grid grid-cols-[1fr_auto] gap-2">
        <TextInput type="text" placeholder="New division name (e.g. Men's Open 105kg)..." value={newDivName} onChange={(e) => setNewDivName(e.target.value)} className="!border-2 !border-rule !min-h-[40px]" />
        <Key variant="pen" type="submit">+ Add</Key>
      </form>
    </>
  );
}

// 3. Events (EventForm reused as-is)
function Events(props: MeetSetupSheetProps) {
  const { meet, divisions, events, results, addEvent, updateEvent, removeEvent, reorderEvents, onEditingChange, closeFormSignal } = props;
  const defaultCollarWeightPerPair = meet.collarWeightPerPair;
  const [editingId, setEditingId] = useState<string | null>(null); // 'NEW' | event.id | null
  // promoter host: report an open form (its Save bar warns that a draft is not included) and close on its signal
  useEffect(() => { onEditingChange?.(editingId !== null); }, [editingId, onEditingChange]);
  const firstSignal = useRef(closeFormSignal);
  useEffect(() => { if (closeFormSignal !== firstSignal.current) { firstSignal.current = closeFormSignal; setEditingId(null); } }, [closeFormSignal]);
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);
  const sortedEvents = [...events].sort((a, b) => a.eventNumber - b.eventNumber);
  const sortedDivisions = [...divisions].sort((a, b) => a.sortOrder - b.sortOrder);

  const moveEvent = (index: number, direction: number) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= sortedEvents.length) return;
    const ids = sortedEvents.map((e) => e.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(targetIndex, 0, moved);
    reorderEvents(ids);
  };

  return (
    <>
      <Sec>{stepNo(props, 'events')}. Events ({sortedEvents.length})</Sec>
      <Key variant={editingId === 'NEW' ? 'ink' : 'pen'} onClick={() => setEditingId(editingId === 'NEW' ? null : 'NEW')}>+ Add Event</Key>
      {editingId === 'NEW' && (
        <div className="border-2 border-rule p-2">
          <EventForm
            divisions={sortedDivisions}
            defaultCollarWeightPerPair={defaultCollarWeightPerPair}
            initialEvent={null}
            onSave={(payload: unknown) => { addEvent(payload); setEditingId(null); }}
            onCancel={() => setEditingId(null)}
          />
        </div>
      )}
      {sortedEvents.length === 0 ? (
        <Empty>No events yet. Tap &ldquo;Add Event&rdquo; above to configure Event 1.</Empty>
      ) : (
        <div className="zt-block grid-cols-1">
          {sortedEvents.map((ev, idx) => {
            const evResultsCount = results.filter((r) => r.eventId === ev.id).length;
            const isEditing = editingId === ev.id;
            const isArmed = armedDeleteId === ev.id;
            return (
              <React.Fragment key={ev.id}>
                <Line cols="28px 28px 1fr 36px">
                  <IconKey disabled={idx === 0} onClick={() => moveEvent(idx, -1)} aria-label={`Move ${ev.name} up`}><ArrowUp className="w-3.5 h-3.5" /></IconKey>
                  <IconKey disabled={idx === sortedEvents.length - 1} onClick={() => moveEvent(idx, 1)} aria-label={`Move ${ev.name} down`}><ArrowDown className="w-3.5 h-3.5" /></IconKey>
                  <button type="button" onClick={() => setEditingId(isEditing ? null : ev.id)} aria-label={`Edit ${ev.name}`} className={`text-left px-2 py-1 min-h-[44px] flex flex-col justify-center ${isEditing ? '!bg-ink text-sheet' : ''}`}>
                    <span className={`block text-[9px] whitespace-nowrap overflow-hidden text-ellipsis ${isEditing ? 'text-sheet/80' : CAP}`}>
                      Ev {ev.eventNumber} · {TYPE_LABELS[ev.scoringType] || ev.scoringType} · {ev.timeCapSeconds}s • {ev.lanes === 2 ? '2 Lanes' : '1 Lane'} • {ev.loadingPoints}pt
                    </span>
                    <span className={`block text-[14px] font-bold whitespace-nowrap overflow-hidden text-ellipsis ${isEditing ? '' : 'text-pen'}`}>{ev.name}</span>
                  </button>
                  <IconKey red={isArmed} onClick={() => setArmedDeleteId(isArmed ? null : ev.id)} aria-label={`Remove ${ev.name}`}><X /></IconKey>
                </Line>
                {isArmed && (
                  <ConfirmLine text={<>Remove <strong>Ev {ev.eventNumber}: {ev.name}</strong> ({plural(evResultsCount, 'score')})?</>}>
                    <Key size="sm" variant="red" onClick={() => { removeEvent(ev.id); setArmedDeleteId(null); if (editingId === ev.id) setEditingId(null); }}>Tap to Confirm</Key>
                    <Key size="sm" onClick={() => setArmedDeleteId(null)}>Cancel</Key>
                  </ConfirmLine>
                )}
                {isEditing && (
                  <Line cols="1fr">
                    <div className="p-2">
                      <EventForm
                        divisions={sortedDivisions}
                        defaultCollarWeightPerPair={defaultCollarWeightPerPair}
                        initialEvent={ev}
                        onSave={(patch: unknown) => { updateEvent(ev.id, patch); setEditingId(null); }}
                        onCancel={() => setEditingId(null)}
                      />
                    </div>
                  </Line>
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </>
  );
}

// 4. Stations & Floor Plan
function Stations(props: MeetSetupSheetProps) {
  const { meet, divisions, athletes, events, addStation, updateStation, removeStation, updateDivision } = props;
  const [newStationLabel, setNewStationLabel] = useState('');
  const eventList = Array.isArray(events) ? events : [];
  const stations = stationsOf(meet);
  const stationIds = new Set(stations.map((s) => s.id));
  const sortedDivisions = [...divisions].sort((a, b) => a.sortOrder - b.sortOrder);
  const athleteCount = (divId: string) => athletes.filter((a) => a.divisionId === divId && a.status === 'active').length;
  const unassigned = sortedDivisions.filter((d) => !stationIds.has(d.flight));

  const handleAddStation = (e: React.FormEvent) => {
    e.preventDefault();
    addStation({ label: newStationLabel.trim() || `Station ${stations.length + 1}` });
    setNewStationLabel('');
  };

  return (
    <>
      <Sec right="Min 1 station">{stepNo(props, 'stations')}. Stations &amp; Floor Plan ({stations.length})</Sec>
      <Note className="!mt-0">
        A station is one set of implements running its own order. Divisions on the same station run back to back; two
        stations run at the same time in different parts of the gym. Most promoters decide this after sign-ups close, and a small meet is fine on one station.
      </Note>
      <div className="zt-block grid-cols-1">
        {stations.map((st) => {
          const assigned = sortedDivisions.filter((d) => d.flight === st.id);
          const ath = assigned.reduce((n, d) => n + athleteCount(d.id), 0);
          return (
            <React.Fragment key={st.id}>
              <Line cols="36px 1fr auto 36px">
                <C className="justify-center font-bold text-pen">{st.id}</C>
                <C><TextInput type="text" value={st.label} onChange={(e) => updateStation(st.id, { label: e.target.value })} aria-label={`Station ${st.id} label`} className="!text-[13px]" /></C>
                <C className={`text-[10px] whitespace-nowrap ${CAP}`}>{assigned.length} div{assigned.length === 1 ? '' : 's'} · {ath} ath</C>
                <IconKey disabled={stations.length <= 1} onClick={() => removeStation(st.id)} title={stations.length <= 1 ? 'At least 1 station required' : `Remove ${st.label}`} aria-label={`Remove ${st.label}`}><X /></IconKey>
              </Line>
              {assigned.length > 0 && (
                <Line cols="1fr"><div className="px-2 py-1 flex flex-wrap gap-1">{assigned.map((d) => <span key={d.id} className="text-[10px] font-bold px-1.5 py-0.5 bg-ink text-sheet">{d.name}</span>)}</div></Line>
              )}
              {eventList.length > 1 && <StationEventOrder station={st} events={eventList} updateStation={updateStation} />}
            </React.Fragment>
          );
        })}
      </div>
      <form onSubmit={handleAddStation} className="grid grid-cols-[1fr_auto] gap-2">
        <TextInput type="text" placeholder={`New station label (e.g. Station ${stations.length + 1})...`} value={newStationLabel} onChange={(e) => setNewStationLabel(e.target.value)} className="!border-2 !border-rule !min-h-[40px]" />
        <Key type="submit">+ Add Station</Key>
      </form>

      <Sec right={unassigned.length > 0 ? <span className="text-redpen font-bold">{unassigned.length} unassigned</span> : undefined}>Assign divisions to stations</Sec>
      {sortedDivisions.length === 0 ? (
        <Empty>Add your divisions in step 2 first. Each one gets a station here.</Empty>
      ) : (
        <div className="zt-block grid-cols-1">
          {sortedDivisions.map((div) => {
            const invalid = !stationIds.has(div.flight);
            return (
              <div key={div.id} className="px-2 py-1.5">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[13px] font-bold text-pen min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">{div.name}</span>
                  <span className={`text-[10px] whitespace-nowrap ${CAP}`}>{athleteCount(div.id)} ath</span>
                </div>
                <KeyGroup ariaLabel={`Station for ${div.name}`} options={stations.map((s) => ({ value: s.id, label: s.label }))} value={div.flight} onChange={(v) => updateDivision(div.id, { flight: v })} />
                {invalid && <Note className="text-redpen font-bold">Station &ldquo;{div.flight}&rdquo; was removed; pick a station or this division shows under &ldquo;All&rdquo; only.</Note>}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// Per-station event order (10/21). Each station can run the meet's events in its own sequence; the leaderboard and
// results still show events by their meet number. Arrows swap neighbours; "Meet order" clears the override.
function StationEventOrder({ station, events, updateStation }: { station: Station; events: EventDef[]; updateStation: MeetSetupSheetProps['updateStation'] }) {
  const ordered = stationEvents(station, events);
  const custom = hasCustomEventOrder(station, events);
  const move = (eventId: string, dir: 1 | -1) => updateStation(station.id, { eventOrder: moveEventInOrder(station, events, eventId, dir) ?? null });
  return (
    <Line cols="1fr">
      <div className="px-2 py-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-[9px] ${CAP}`}>Event order on this station{custom ? '' : ' (meet order)'}</span>
          {custom && <button type="button" onClick={() => updateStation(station.id, { eventOrder: null })} className="text-[10px] font-bold uppercase text-pen">Reset to meet order</button>}
        </div>
        <ol className="mt-1 border-2 border-rule">
          {ordered.map((ev, idx) => (
            <li key={ev.id} className="grid grid-cols-[22px_1fr_28px_28px] items-center min-h-[30px] border-b border-rule last:border-b-0">
              <span className="text-[11px] font-bold text-pen text-center">{idx + 1}.</span>
              <span className="min-w-0 truncate text-[12px] font-bold"><span className={CAP}>Ev {ev.eventNumber}</span> {ev.name}</span>
              <IconKey disabled={idx === 0} onClick={() => move(ev.id, -1)} aria-label={`Run ${ev.name} earlier on ${station.label}`} className="!min-h-[30px]"><ChevronUp className="w-3.5 h-3.5" /></IconKey>
              <IconKey disabled={idx === ordered.length - 1} onClick={() => move(ev.id, 1)} aria-label={`Run ${ev.name} later on ${station.label}`} className="!min-h-[30px]"><ChevronDown className="w-3.5 h-3.5" /></IconKey>
            </li>
          ))}
        </ol>
        {custom && <Note>Divisions here run events in this order. The leaderboard still shows Ev 1, 2, 3 by meet number.</Note>}
      </div>
    </Line>
  );
}

// 5. Athletes (pointer + keyboard lot reorder carried over unchanged)
type Drag = { divId: string; athleteId: string; fromIndex: number; overIndex: number };
function Athletes(props: MeetSetupSheetProps) {
  const { divisions, athletes, results, addAthlete, bulkAddAthletes, updateAthlete, removeAthlete, moveAthlete, shuffleLots, moveLot, toggleAthleteWithdrawn } = props;
  const sortedDivisions = [...divisions].sort((a, b) => a.sortOrder - b.sortOrder);
  const [targetDivId, setTargetDivId] = useState(sortedDivisions[0]?.id || '');
  const [newName, setNewName] = useState('');
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);
  const [armedDrawDivId, setArmedDrawDivId] = useState<string | null>(null);
  const [moveOpenId, setMoveOpenId] = useState<string | null>(null); // athlete whose "Move to division" row is open
  // Drag state for the lot handles: which athlete is lifted and where it would land (0-based index in its division).
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [liveMsg, setLiveMsg] = useState('');

  // Pointer events (not HTML5 drag) so the same code works for a mouse and a finger; the handle has touch-action: none
  // so the page does not scroll while a row is lifted.
  const rowIndexAt = (divId: string, clientY: number) => {
    const rows = Array.from(document.querySelectorAll(`[data-lot-row][data-div-id="${divId}"]`));
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      if (clientY < r.top + r.height / 2) return i;
    }
    return Math.max(0, rows.length - 1);
  };
  const startDrag = (e: React.PointerEvent<HTMLButtonElement>, divId: string, athleteId: string, fromIndex: number) => {
    if (!moveLot) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const next = { divId, athleteId, fromIndex, overIndex: fromIndex };
    dragRef.current = next;
    setDrag(next);
  };
  const onDragMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const overIndex = rowIndexAt(d.divId, e.clientY);
    if (overIndex !== d.overIndex) {
      dragRef.current = { ...d, overIndex };
      setDrag(dragRef.current);
    }
  };
  const endDrag = (e: React.PointerEvent<HTMLButtonElement>, cancelled = false) => {
    const d = dragRef.current;
    if (!d) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    dragRef.current = null;
    setDrag(null);
    if (!cancelled && d.overIndex !== d.fromIndex && moveLot) {
      moveLot(d.divId, d.athleteId, d.overIndex);
      setLiveMsg(`Moved to lot ${d.overIndex + 1}.`);
    }
  };
  // Keyboard on the handle: arrows move one lot; Home/End to the ends.
  const onHandleKey = (e: React.KeyboardEvent<HTMLButtonElement>, divId: string, athleteId: string, index: number, count: number) => {
    if (!moveLot) return;
    let to: number | null = null;
    if (e.key === 'ArrowUp') to = index - 1;
    else if (e.key === 'ArrowDown') to = index + 1;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = count - 1;
    if (to === null) return;
    e.preventDefault();
    if (to < 0 || to >= count || to === index) return;
    moveLot(divId, athleteId, to);
    setLiveMsg(`Moved to lot ${to + 1} of ${count}.`);
  };

  const activeDivId = sortedDivisions.some((d) => d.id === targetDivId) ? targetDivId : sortedDivisions[0]?.id || '';

  const handleSingleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !activeDivId) return;
    addAthlete({ divisionId: activeDivId, name: newName.trim() });
    setNewName('');
  };
  const handleBulkAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkText.trim() || !activeDivId) return;
    bulkAddAthletes(activeDivId, bulkText);
    setBulkText('');
    setBulkMode(false);
  };
  const handleDrawLots = (divId: string, hasResults: boolean) => {
    if (hasResults && armedDrawDivId !== divId) {
      setArmedDrawDivId(divId);
      return;
    }
    shuffleLots(divId);
    setArmedDrawDivId(null);
  };
  const divOptions = sortedDivisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>);
  const multiDiv = sortedDivisions.length > 1;

  return (
    <>
      <Sec>{stepNo(props, 'athletes')}. Athletes ({athletes.length})</Sec>
      {sortedDivisions.length === 0 ? (
        <Empty>Add at least one division above before adding athletes.</Empty>
      ) : (
        <>
          <KeyGroup ariaLabel="Add mode" options={[{ value: 'single', label: 'Single Add' }, { value: 'bulk', label: 'Bulk Add' }]} value={bulkMode ? 'bulk' : 'single'} onChange={(v) => setBulkMode(v === 'bulk')} />
          {!bulkMode ? (
            <form onSubmit={handleSingleAdd} className="flex flex-col gap-2">
              <Form>
                <Field label="Division">
                  <Select value={activeDivId} onChange={(e) => setTargetDivId(e.target.value)} aria-label="Select division for new athlete">{divOptions}</Select>
                </Field>
                <Field label="Athlete">
                  <TextInput type="text" placeholder="Athlete full name..." value={newName} onChange={(e) => setNewName(e.target.value)} />
                </Field>
              </Form>
              <Key variant="pen" type="submit">+ Add</Key>
            </form>
          ) : (
            <form onSubmit={handleBulkAdd} className="flex flex-col gap-2">
              <Form>
                <Field label="Bulk Add (One Name Per Line)" wide>
                  <Select value={activeDivId} onChange={(e) => setTargetDivId(e.target.value)} aria-label="Select division for bulk add">{divOptions}</Select>
                </Field>
                <div className="col-span-full px-2 py-1.5">
                  <textarea rows={4} placeholder={'Kurt Pollack\nDan Vance\nMarcus Trent'} value={bulkText} onChange={(e) => setBulkText(e.target.value)} className="zt-input font-sheet !border-0 !px-1 !py-1 !text-[14px] !min-h-[80px]" />
                </div>
              </Form>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Key variant="pen" type="submit">Add All to Division</Key>
                <Key onClick={() => setBulkMode(false)}>Cancel</Key>
              </div>
            </form>
          )}

          {moveLot && athletes.length > 1 && (
            <Note className="!mt-0">
              Lot order is the Event 1 run order (and every event&apos;s order when Run Order is Roster Order). Drag the grip
              to reorder, or type a lot number.
            </Note>
          )}
          <div className="sr-only" role="status" aria-live="polite">{liveMsg}</div>

          {sortedDivisions.map((div) => {
            const divAthletes = athletes.filter((a) => a.divisionId === div.id).sort((a, b) => a.lotNumber - b.lotNumber);
            const divAthIds = new Set(divAthletes.map((a) => a.id));
            const divHasResults = results.some((r) => divAthIds.has(r.athleteId));
            const drawArmed = armedDrawDivId === div.id;
            const withHandle = Boolean(moveLot) && divAthletes.length > 1;
            const cols = `${withHandle ? '28px ' : ''}40px 1fr ${multiDiv ? '36px ' : ''}36px 36px`;
            return (
              <div key={div.id} className="flex flex-col gap-1.5">
                <Sec right={`(${plural(divAthletes.length, 'athlete')})`}>{div.name}</Sec>
                {divAthletes.length > 1 && (
                  <div className={`grid gap-2 ${drawArmed ? 'grid-cols-[1fr_auto]' : 'grid-cols-1'}`}>
                    <Key size="sm" variant={drawArmed ? 'red' : 'line'} onClick={() => handleDrawLots(div.id, divHasResults)}>{drawArmed ? 'Scores Exist — Tap to Shuffle' : 'Draw Lots'}</Key>
                    {drawArmed && <Key size="sm" onClick={() => setArmedDrawDivId(null)}>Cancel</Key>}
                  </div>
                )}
                {divAthletes.length === 0 ? (
                  <Empty>No athletes in {div.name}.</Empty>
                ) : (
                  <div className="zt-block grid-cols-1" style={drag?.divId === div.id ? { touchAction: 'none' } : undefined}>
                    <Line cols={cols} className="[&>*]:!bg-ground">
                      {withHandle && <span />}
                      <span className={`px-1.5 text-[9px] flex items-center justify-center ${CAP}`}>Lot</span>
                      <span className={`px-1.5 text-[9px] flex items-center ${CAP}`}>Athlete</span>
                      {multiDiv && <span className={`px-1.5 text-[9px] flex items-center justify-center ${CAP}`}>Div</span>}
                      <span className={`px-1.5 text-[9px] flex items-center justify-center ${CAP}`}>Scr</span>
                      <span />
                    </Line>
                    {divAthletes.map((ath, rowIndex) => {
                      const isWithdrawn = ath.status === 'withdrawn';
                      const isArmed = armedDeleteId === ath.id;
                      const athResults = results.filter((r) => r.athleteId === ath.id).length;
                      const lifting = drag?.divId === div.id;
                      const isLifted = Boolean(lifting && drag && drag.athleteId === ath.id);
                      const isTarget = Boolean(lifting && drag && !isLifted && drag.overIndex === rowIndex);
                      const dropAbove = Boolean(isTarget && drag && drag.overIndex < drag.fromIndex);
                      return (
                        <React.Fragment key={ath.id}>
                          <Line
                            cols={cols}
                            data-lot-row=""
                            data-div-id={div.id}
                            data-athlete-id={ath.id}
                            className={isLifted ? 'opacity-60' : ''}
                            style={isTarget ? { boxShadow: dropAbove ? '0 -3px 0 0 var(--pen)' : '0 3px 0 0 var(--pen)', position: 'relative', zIndex: 1 } : undefined}
                          >
                            {withHandle && (
                              <button
                                type="button"
                                aria-label={`Lot ${ath.lotNumber}, ${ath.name}. Drag, or use arrow keys, to change the run order`}
                                title="Drag to reorder (arrow keys also work)"
                                onPointerDown={(e) => startDrag(e, div.id, ath.id, rowIndex)}
                                onPointerMove={onDragMove}
                                onPointerUp={(e) => endDrag(e)}
                                onPointerCancel={(e) => endDrag(e, true)}
                                onKeyDown={(e) => onHandleKey(e, div.id, ath.id, rowIndex, divAthletes.length)}
                                className="min-h-[36px] flex items-center justify-center text-ink-muted cursor-grab active:cursor-grabbing select-none"
                                style={{ touchAction: 'none' }}
                              >
                                <GripVertical className="w-4 h-4" aria-hidden="true" />
                              </button>
                            )}
                            <C className="justify-center">
                              <NumInput min={1} value={ath.lotNumber} onChange={(v) => updateAthlete(ath.id, { lotNumber: Number(v) || 1 })} title="Lot Number" aria-label={`Lot number for ${ath.name}`} className="!text-center !text-[13px] !px-0" />
                            </C>
                            <C>
                              <TextInput type="text" value={ath.name} onChange={(e) => updateAthlete(ath.id, { name: e.target.value })} aria-label="Athlete name" className={`!text-[13px] ${isWithdrawn ? 'line-through !text-redpen' : '!text-ink'}`} />
                            </C>
                            {multiDiv && (
                              <IconKey onClick={() => setMoveOpenId(moveOpenId === ath.id ? null : ath.id)} title={`Move ${ath.name} to division`} aria-label={`Move ${ath.name} to division`} aria-expanded={moveOpenId === ath.id} className={moveOpenId === ath.id ? '!bg-ink text-sheet' : ''}>
                                <span aria-hidden="true">&#x21C4;</span>
                              </IconKey>
                            )}
                            <IconKey onClick={() => toggleAthleteWithdrawn(ath)} title={isWithdrawn ? 'Reinstate Athlete' : 'Scratch Athlete'} aria-label={isWithdrawn ? 'Reinstate Athlete' : 'Scratch Athlete'} className={isWithdrawn ? '!text-redpen' : ''}>
                              {isWithdrawn ? <span aria-hidden="true">&#x21A9;</span> : <span aria-hidden="true" className="text-[11px]">SCR</span>}
                            </IconKey>
                            <IconKey red={isArmed} onClick={() => setArmedDeleteId(isArmed ? null : ath.id)} title={`Remove ${ath.name}`} aria-label={`Remove ${ath.name}`}><X /></IconKey>
                          </Line>
                          {multiDiv && moveOpenId === ath.id && (
                            <Line cols="1fr">
                              <div className="px-2 py-1.5 grid grid-cols-[1fr_auto] gap-2 items-center">
                                <label className="flex flex-col">
                                  <span className={`block text-[9px] mb-0.5 ${CAP}`}>Move {ath.name} to division</span>
                                  <Select value={ath.divisionId} onChange={(e) => { moveAthlete(ath.id, e.target.value); setMoveOpenId(null); }} aria-label={`Move ${ath.name} to division`} className="!text-[13px] !text-ink">{divOptions}</Select>
                                </label>
                                <Key size="sm" onClick={() => setMoveOpenId(null)}>Cancel</Key>
                              </div>
                            </Line>
                          )}
                          {isArmed && (
                            <ConfirmLine text={<>Delete <strong>{ath.name}</strong> ({plural(athResults, 'score')})?</>}>
                              <Key size="sm" variant="red" onClick={() => { removeAthlete(ath.id); setArmedDeleteId(null); }}>Confirm</Key>
                              <Key size="sm" onClick={() => setArmedDeleteId(null)}>Cancel</Key>
                            </ConfirmLine>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </>
  );
}

// 6. Meets, Demo Presets & Readiness Check
function Meets({ state, meet, results, pendingPresetId, setPendingPresetId, requestMeetPreset, loadMeetPreset, createNewBlankMeet }: MeetSetupSheetProps) {
  const [newMeetPromptOpen, setNewMeetPromptOpen] = useState(false);
  const [blankName, setBlankName] = useState('');
  const [blankDate, setBlankDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [validationResult, setValidationResult] = useState<{ ok: boolean; problems: string[] } | null>(null);

  const handleCreateBlank = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = blankName.trim() || 'New Strongman Meet';
    createNewBlankMeet(trimmed, blankDate);
    setBlankName('');
    setNewMeetPromptOpen(false);
    setValidationResult(null);
  };
  const runValidation = () => setValidationResult(validateMeet(state as Parameters<typeof validateMeet>[0]));

  return (
    <>
      <Sec>6. Meets, Demo Presets &amp; Readiness Check</Sec>
      <Key variant={newMeetPromptOpen ? 'ink' : 'pen'} onClick={() => setNewMeetPromptOpen((o) => !o)}>New Blank Meet</Key>
      {newMeetPromptOpen && (
        <form onSubmit={handleCreateBlank} className="flex flex-col gap-2">
          <Sec>Start a New Blank Meet (Current state is auto-snapshotted first)</Sec>
          <Form>
            <Field label="Meet Name">
              <TextInput type="text" placeholder="Meet Name (e.g. PA Dutch Strong 16)..." value={blankName} onChange={(e) => setBlankName(e.target.value)} autoFocus />
            </Field>
            <Field label="Meet Date">
              <TextInput type="date" value={blankDate} onChange={(e) => setBlankDate(e.target.value)} />
            </Field>
          </Form>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Key variant="pen" type="submit">Create Blank Meet</Key>
            <Key onClick={() => setNewMeetPromptOpen(false)}>Cancel</Key>
          </div>
        </form>
      )}

      <Sec>Load Pre-Built Demo Meet</Sec>
      <div role="radiogroup" aria-label="Meet preset" className="zt-block grid-cols-1">
        {MEET_PRESETS.map((preset) => {
          const active = Boolean(meet.isDemo && (meet.presetId ?? DEFAULT_PRESET_ID) === preset.id);
          return (
            <button key={preset.id} type="button" role="radio" aria-checked={active} onClick={() => requestMeetPreset(preset.id)} className={`text-left px-2 py-1.5 min-h-[44px] grid grid-cols-[1fr_auto] items-center gap-2 ${active ? '!bg-ink text-sheet' : ''}`}>
              <span className="min-w-0">
                <span className={`block text-[13px] font-bold truncate ${active ? '' : 'text-pen'}`}>{preset.label}</span>
                <span className={`block text-[10px] ${active ? 'text-sheet/80' : CAP}`}>{preset.sublabel}</span>
              </span>
              <span className={`text-[9px] font-bold uppercase tracking-[0.04em] ${active ? 'text-sheet/80' : 'text-ink-muted'}`}>Demo</span>
            </button>
          );
        })}
      </div>
      {pendingPresetId && (
        <>
          <Toast cap="Demo preset" tone="red">Switching to this demo preset replaces your current meet ({plural(results.length, 'score')}). A recovery snapshot is saved automatically.</Toast>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Key variant="red" onClick={() => loadMeetPreset(pendingPresetId)}>Load Demo Preset</Key>
            <Key onClick={() => setPendingPresetId(null)}>Cancel</Key>
          </div>
        </>
      )}

      <Sec>Readiness</Sec>
      <Key onClick={runValidation}>Validate Meet Readiness</Key>
      {validationResult && (validationResult.ok ? (
        <Toast cap="Readiness">Ready — All divisions, events, weights, and lot numbers are valid.</Toast>
      ) : (
        <div className="border-2 border-redpen px-2 py-1.5">
          <div className="text-[11px] font-bold text-redpen">{validationResult.problems.length} Issue{validationResult.problems.length === 1 ? '' : 's'} Found:</div>
          <ul className="list-disc list-inside text-[11px] text-redpen">
            {validationResult.problems.map((prob, i) => <li key={i}>{prob}</li>)}
          </ul>
        </div>
      ))}
    </>
  );
}
