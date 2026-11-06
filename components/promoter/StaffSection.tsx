'use client';

// Staff & judges roster (046, 11/6, feature gaps #12). Lives on the Meet Day tab. One row per person: name, role, the
// station they work (or floating), a contact the promoter keeps private, and a short note. Saves through the listing
// patch (`staff` only, so the Listing tab's own draft is untouched). "Briefing cards" opens a printable page: one card
// per station with the crew, the events in running order, the weights per division, the structured spec and the
// standards the head judge sets at the rules meeting. Staff never appears on a public page.

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Printer, Plus, Trash2, Users } from 'lucide-react';
import type { MeetListing } from '@/lib/promoter/contract';
import type { Division, EventDef, Station } from '@/lib/types';
import { STAFF_LIMITS, STAFF_MAX, STAFF_ROLES, cleanStaff, staffRoleLabel, type MeetStaff, type StaffRole } from '@/lib/website/extras';
import { briefingHtml } from '@/lib/website/briefing';

interface StaffSectionProps {
  meetName: string;
  meetDate: string;
  listing: MeetListing;
  stations: Station[];
  divisions: Division[];
  events: EventDef[];
  onSaveListing: (patch: Partial<MeetListing>) => Promise<{ error: string | null }>;
  // MD-06: the parent folds this into its unsaved-work guard (dirty bar + beforeunload)
  onDirtyChange?: (dirty: boolean) => void;
}

interface StaffRow { name: string; role: StaffRole; station: string; contact: string; note: string }

const INPUT = 'w-full bg-zt-inset border border-zt-border-strong rounded-xl px-2.5 py-1.5 text-xs font-bold text-zt-text';
const KEY = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zt-inset border border-zt-border-strong text-zt-text font-black text-[11px] uppercase disabled:opacity-50';

function toRows(staff: MeetStaff[] | null): StaffRow[] {
  return (staff ?? []).map((s) => ({ name: s.name, role: s.role, station: s.station ?? '', contact: s.contact ?? '', note: s.note ?? '' }));
}
// MD-06: the raw rows (trimmed) decide dirtiness, so an invalid draft (a contact with no name) still counts as unsaved work
// and Save stays enabled to explain what is missing. Rows with nothing typed are ignored.
function rowsKey(rows: StaffRow[]): string {
  return JSON.stringify(rows
    .map((r) => ({ name: r.name.trim(), role: r.role, station: r.station.trim(), contact: r.contact.trim(), note: r.note.trim() }))
    .filter((r) => r.name || r.station || r.contact || r.note));
}

export default function StaffSection({ meetName, meetDate, listing, stations, divisions, events, onSaveListing, onDirtyChange }: StaffSectionProps) {
  const [rows, setRows] = useState<StaffRow[]>(() => toRows(listing.staff));
  const [savedKey, setSavedKey] = useState(() => rowsKey(toRows(listing.staff)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // A save elsewhere (or a reload) that changes the roster replaces an untouched form; a dirty form keeps its edits.
  const incomingKey = rowsKey(toRows(listing.staff));
  if (incomingKey !== savedKey && rowsKey(rows) === savedKey) {
    setRows(toRows(listing.staff));
    setSavedKey(incomingKey);
  }

  const dirty = rowsKey(rows) !== savedKey;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  // MD-15: rows store the station ID; labels are display only (two stations may share a label). Rows saved before this
  // change hold a label and are matched to the first station with that label when displayed.
  const stationIds = useMemo(() => new Set(stations.map((s) => s.id)), [stations]);
  const stationIdFor = (raw: string): string => {
    if (!raw) return '';
    if (stationIds.has(raw)) return raw;
    const norm = (s: string) => s.trim().toLowerCase().replace(/^station\s+/, '');
    return stations.find((s) => norm(s.label) === norm(raw))?.id ?? raw;
  };
  const counts = useMemo(() => {
    const c: Partial<Record<StaffRole, number>> = {};
    for (const r of cleanStaff(rows).staff ?? []) c[r.role] = (c[r.role] ?? 0) + 1;
    return c;
  }, [rows]);

  const setRow = (i: number, patch: Partial<StaffRow>) => setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = (role: StaffRole = 'judge') => setRows((prev) => (prev.length >= STAFF_MAX ? prev : [...prev, { name: '', role, station: '', contact: '', note: '' }]));
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, j) => j !== i));

  const handleSave = async () => {
    setError(null);
    setNotice(null);
    const c = cleanStaff(rows.map((r) => ({ ...r, station: stationIdFor(r.station) })));
    if (c.problem) { setError(c.problem); return; }
    setSaving(true);
    const res = await onSaveListing({ staff: c.staff });
    setSaving(false);
    if (res.error) { setError(res.error); return; }
    const next = toRows(c.staff);
    setRows(next);
    setSavedKey(rowsKey(next));
    setNotice(c.staff ? `Saved ${c.staff.length} ${c.staff.length === 1 ? 'person' : 'people'}.` : 'Saved: no staff listed.');
  };

  const handleReset = () => { setRows(toRows(listing.staff)); setError(null); };

  const openBriefing = () => {
    const c = cleanStaff(rows.map((r) => ({ ...r, station: stationIdFor(r.station) })));
    if (c.problem) { setError(c.problem); return; }
    const html = briefingHtml({
      meetName, meetDate, federation: listing.federation, promoterContact: listing.promoterContact, schedule: listing.schedule,
      stations, divisions, events, staff: c.staff,
    });
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    // MD-13: with 'noopener' Chrome returns null even when the tab opened, so open first and cut the opener link after
    const w = window.open(url, '_blank');
    if (!w) setError('Your browser blocked the briefing tab. Allow pop-ups for this site and try again.');
    else w.opener = null;
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <section aria-labelledby="staff-heading" className="bg-zt-surface border border-zt-border rounded-2xl p-5 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zt-border pb-3">
        <div>
          <h2 id="staff-heading" className="text-sm font-black uppercase tracking-wider text-zt-primary flex items-center gap-2">
            <Users className="w-4 h-4" aria-hidden="true" />
            <span>Staff &amp; Judges</span>
          </h2>
          <p className="text-xs text-zt-muted mt-0.5">
            Who is working the meet and where. Contacts and notes stay private to this editor. Briefing cards print one page per
            station: crew, events in running order with weights, implement and equipment rules, and the judging standards.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] font-extrabold uppercase text-zt-muted">
          {STAFF_ROLES.filter((r) => counts[r]).map((r) => (
            <span key={r} className="rounded-lg bg-zt-inset border border-zt-border px-2 py-0.5">{counts[r]} {staffRoleLabel(r)}</span>
          ))}
        </div>
      </div>

      {rows.length === 0 && (
        <p className="text-xs text-zt-muted">Nobody listed yet. Add your head judge first, then a judge and loaders per station, a scorer, an emcee, and a medic.</p>
      )}

      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-2 md:grid-cols-[1.4fr_1fr_1fr_1.2fr_1.6fr_auto] gap-2 items-center bg-zt-inset/50 border border-zt-border rounded-xl p-2">
            <div className="col-span-2 md:col-span-1">
              <label htmlFor={`staff-name-${i}`} className="sr-only">Name</label>
              <input id={`staff-name-${i}`} type="text" maxLength={STAFF_LIMITS.name} value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} placeholder="Name" className={INPUT} />
            </div>
            <div>
              <label htmlFor={`staff-role-${i}`} className="sr-only">Role</label>
              <select id={`staff-role-${i}`} value={r.role} onChange={(e) => setRow(i, { role: e.target.value as StaffRole })} className={INPUT}>
                {STAFF_ROLES.map((role) => <option key={role} value={role}>{staffRoleLabel(role)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={`staff-station-${i}`} className="sr-only">Station</label>
              <select id={`staff-station-${i}`} value={stationIds.has(stationIdFor(r.station)) ? stationIdFor(r.station) : r.station ? '__other' : ''} onChange={(e) => setRow(i, { station: e.target.value === '__other' ? r.station : e.target.value })} className={INPUT}>
                <option value="">Floating</option>
                {stations.map((s) => <option key={s.id} value={s.id}>{stations.filter((x) => x.label === s.label).length > 1 ? `${s.label} (${s.id})` : s.label}</option>)}
                {r.station && !stationIds.has(stationIdFor(r.station)) && <option value="__other">{r.station}</option>}
              </select>
            </div>
            <div>
              <label htmlFor={`staff-contact-${i}`} className="sr-only">Contact</label>
              <input id={`staff-contact-${i}`} type="text" maxLength={STAFF_LIMITS.contact} value={r.contact} onChange={(e) => setRow(i, { contact: e.target.value })} placeholder="Phone or email (private)" className={INPUT} />
            </div>
            <div>
              <label htmlFor={`staff-note-${i}`} className="sr-only">Note</label>
              <input id={`staff-note-${i}`} type="text" maxLength={STAFF_LIMITS.note} value={r.note} onChange={(e) => setRow(i, { note: e.target.value })} placeholder="Note (arrives 7:00, brings tape)" className={INPUT} />
            </div>
            <button type="button" onClick={() => removeRow(i)} aria-label={`Remove ${r.name || `row ${i + 1}`}`} className="p-2 rounded-xl text-zt-muted hover:text-zt-danger-text justify-self-end">
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => addRow('judge')} disabled={rows.length >= STAFF_MAX} className={KEY}><Plus className="w-3.5 h-3.5" aria-hidden="true" /> Add judge</button>
        <button type="button" onClick={() => addRow('loader')} disabled={rows.length >= STAFF_MAX} className={KEY}><Plus className="w-3.5 h-3.5" aria-hidden="true" /> Add loader</button>
        <button type="button" onClick={() => addRow('volunteer')} disabled={rows.length >= STAFF_MAX} className={KEY}><Plus className="w-3.5 h-3.5" aria-hidden="true" /> Add volunteer</button>
        <button type="button" onClick={() => addRow('other')} disabled={rows.length >= STAFF_MAX} className={KEY}><Plus className="w-3.5 h-3.5" aria-hidden="true" /> Add other</button>
      </div>

      {error && (
        <div role="alert" className="p-3.5 rounded-xl bg-zt-danger/15 border border-zt-danger text-zt-danger-text text-xs font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden="true" /><span>{error}</span>
        </div>
      )}
      {notice && !dirty && (
        <div role="status" className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" aria-hidden="true" /><span>{notice}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-zt-border">
        <button type="button" onClick={openBriefing} className={KEY}>
          <Printer className="w-3.5 h-3.5" aria-hidden="true" /> Briefing cards{dirty ? ' (unsaved roster)' : ''}
        </button>
        <div className="flex items-center gap-2.5">
          {dirty && (
            <button type="button" onClick={handleReset} className="px-4 py-2.5 rounded-xl text-xs font-black uppercase text-zt-muted hover:text-zt-text">Discard</button>
          )}
          <button type="button" onClick={handleSave} disabled={saving || !dirty} className="px-4 py-2.5 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase disabled:opacity-50">
            {saving ? 'Saving...' : 'Save staff'}
          </button>
        </div>
      </div>
    </section>
  );
}
