'use client';

// Check-in / weigh-in desk (045, 11/6, feature gaps #8). Lives on the Meet Day tab. One row per active roster athlete:
// checked in, bodyweight in kg as the scale reads it (lb mirror shown), class check against the division's cap, waiver
// (online from the registration, or a paper waiver ticked here), membership card (uploaded card status, or "seen" ticked
// here), paid, a short note, and a reclass picker. Every tap is one server call; the parent reloads the meet afterwards
// so the roster (bodyweight, division, lot) stays in step. Blocked while the builder draft is dirty, same as Registrations.

import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCheck, Scale } from 'lucide-react';
import type { DeskCheckin, DeskPatch, DeskState, RegistrationRequest } from '@/lib/promoter/contract';
import type { Athlete, Division } from '@/lib/types';
import { classCheck, deskPreset, formatKg, kgToLb, lbToKg, parseKg } from '@/lib/desk/rules';
import { cardStatus, cardStatusLabel, type MembershipCard } from '@/lib/website/membershipCards';

interface CheckInDeskSectionProps {
  athletes: Athlete[];
  divisions: Division[];
  registrations: RegistrationRequest[];
  federation: string | null;
  desk: DeskState | null;             // null until loaded
  deskError: string | null;
  cards?: Record<string, MembershipCard[]>;   // by registration id (035); undefined on the mock backend
  blockedReason: string | null;
  onUpdateAthlete: (athleteId: string, patch: DeskPatch) => Promise<{ error?: string }>;
  onSetCap: (divisionId: string, capKg: number | null) => Promise<{ error?: string }>;
  today?: string;   // YYYY-MM-DD for card status; defaults to today
}

const INPUT = 'bg-zt-inset border border-zt-border-strong rounded-xl px-2.5 py-1.5 text-xs font-bold text-zt-text';
const CHIP = 'inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-extrabold uppercase whitespace-nowrap';
const TOGGLE_ON = 'px-2.5 py-1.5 rounded-xl bg-zt-primary text-zt-on-primary font-black text-[11px] uppercase';
const TOGGLE_OFF = 'px-2.5 py-1.5 rounded-xl bg-zt-surface border border-zt-border-strong text-zt-text font-black text-[11px] uppercase';

type Filter = 'all' | 'not_in' | 'not_weighed' | 'flagged';

export default function CheckInDeskSection({
  athletes, divisions, registrations, federation, desk, deskError, cards, blockedReason, onUpdateAthlete, onSetCap, today,
}: CheckInDeskSectionProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [unit, setUnit] = useState<'kg' | 'lb'>('kg');
  const [weightDraft, setWeightDraft] = useState<Record<string, string>>({});
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [capDraft, setCapDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const todayIso = today ?? new Date().toISOString().slice(0, 10);

  const divById = useMemo(() => new Map(divisions.map((d) => [d.id, d])), [divisions]);
  const regByAthlete = useMemo(() => {
    const m = new Map<string, RegistrationRequest>();
    for (const r of registrations) if (r.athleteId && r.status === 'accepted') m.set(r.athleteId, r);
    return m;
  }, [registrations]);

  const rows = useMemo(() => {
    const sortedDivs = [...divisions].sort((a, b) => a.sortOrder - b.sortOrder);
    const order = new Map(sortedDivs.map((d, i) => [d.id, i]));
    return athletes
      .filter((a) => a.status === 'active')
      .map((a) => {
        const row = desk?.checkins[a.id];
        const cap = desk?.caps[a.divisionId];
        return { athlete: a, row, cap, check: classCheck(row?.weighedKg, cap), reg: regByAthlete.get(a.id) };
      })
      .sort((x, y) => (order.get(x.athlete.divisionId) ?? 99) - (order.get(y.athlete.divisionId) ?? 99) || x.athlete.name.localeCompare(y.athlete.name));
  }, [athletes, divisions, desk, regByAthlete]);

  const counts = useMemo(() => ({
    roster: rows.length,
    checkedIn: rows.filter((r) => r.row?.checkedInAt).length,
    weighed: rows.filter((r) => r.row?.weighedKg !== null && r.row?.weighedKg !== undefined).length,
    over: rows.filter((r) => r.check.status === 'over').length,
  }), [rows]);

  const visible = rows.filter((r) => {
    if (query.trim() && !r.athlete.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
    if (filter === 'not_in') return !r.row?.checkedInAt;
    if (filter === 'not_weighed') return r.row?.weighedKg === null || r.row?.weighedKg === undefined;
    if (filter === 'flagged') return r.check.status === 'over' || !waiverOk(r.reg, r.row);
    return true;
  });

  const run = async (key: string, fn: () => Promise<{ error?: string }>, done?: string) => {
    if (blockedReason) { setError(blockedReason); return; }
    setBusy(key); setError(null); setNotice(null);
    const res = await fn();
    setBusy(null);
    if (res.error) setError(res.error);
    else if (done) { setNotice(done); setTimeout(() => setNotice(null), 4000); }
  };

  const saveWeight = (a: Athlete) => {
    const raw = weightDraft[a.id];
    if (raw === undefined) return;
    if (!raw.trim()) {
      void run(`w-${a.id}`, () => onUpdateAthlete(a.id, { weighedKg: null }), `Weigh-in cleared for ${a.name}.`);
      return;
    }
    let kg: number | null;
    if (unit === 'lb') {
      const lb = Number(raw.replace(',', '.'));
      kg = Number.isFinite(lb) && lb > 0 ? parseKg(lbToKg(lb)) : null;
    } else {
      kg = parseKg(raw);
    }
    if (kg === null) { setError(`"${raw}" is not a bodyweight between 20 and 300 kg (44 to 661 lb). Type it the way the scale shows it.`); return; }
    void run(`w-${a.id}`, () => onUpdateAthlete(a.id, { weighedKg: kg }), `${a.name}: ${formatKg(kg)} recorded.`);
    setWeightDraft((p) => { const n = { ...p }; delete n[a.id]; return n; });
  };

  const saveCap = (d: Division) => {
    const raw = capDraft[d.id];
    if (raw === undefined) return;
    const kg = raw.trim() ? parseKg(raw) : null;
    if (raw.trim() && kg === null) { setError(`"${raw}" is not a cap between 20 and 300 kg.`); return; }
    void run(`cap-${d.id}`, () => onSetCap(d.id, kg), kg === null ? `${d.name}: cap cleared.` : `${d.name}: cap ${formatKg(kg)}.`);
    setCapDraft((p) => { const n = { ...p }; delete n[d.id]; return n; });
  };

  const preset = deskPreset(federation);
  const divisionsSorted = [...divisions].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <section aria-labelledby="desk-heading" className="bg-zt-surface border border-zt-border rounded-2xl p-5 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zt-border pb-3">
        <div>
          <h2 id="desk-heading" className="text-sm font-black uppercase tracking-wider text-zt-primary flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4" aria-hidden="true" />
            <span>Check-in &amp; Weigh-in Desk</span>
          </h2>
          <p className="text-xs text-zt-muted mt-0.5">
            Tick athletes in as they arrive, type the scale reading, and the desk flags anyone over their division cap.
            A kg weigh-in also fills the roster bodyweight. Reclass moves an athlete to another division (before any result).
          </p>
        </div>
        <dl className="flex gap-4 text-right">
          <Stat label="Checked in" value={`${counts.checkedIn}/${counts.roster}`} />
          <Stat label="Weighed" value={`${counts.weighed}/${counts.roster}`} />
          <Stat label="Over cap" value={String(counts.over)} warn={counts.over > 0} />
        </dl>
      </div>

      <div className="rounded-xl bg-zt-inset border border-zt-border p-3 text-xs text-zt-text-2">
        <div className="font-extrabold uppercase text-[11px] text-zt-muted mb-1 flex items-center gap-1.5"><Scale className="w-3.5 h-3.5" aria-hidden="true" />{preset.title}</div>
        <ul className="list-disc pl-4 space-y-0.5">{preset.lines.map((l) => <li key={l}>{l}</li>)}</ul>
      </div>

      {/* Division caps */}
      <div className="space-y-2">
        <div className="text-[11px] font-bold uppercase text-zt-muted">Division weight caps (kg, blank = no cap)</div>
        <div className="flex flex-wrap gap-2">
          {divisionsSorted.map((d) => {
            const cap = desk?.caps[d.id];
            const draft = capDraft[d.id] ?? (cap !== undefined ? String(cap) : '');
            return (
              <label key={d.id} className="flex items-center gap-1.5 text-xs font-bold text-zt-text-2">
                <span className="max-w-[160px] truncate" title={d.name}>{d.name}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label={`${d.name} weight cap in kg`}
                  value={draft}
                  disabled={Boolean(blockedReason) || busy === `cap-${d.id}`}
                  onChange={(e) => setCapDraft((p) => ({ ...p, [d.id]: e.target.value }))}
                  onBlur={() => saveCap(d)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
                  placeholder="none"
                  className={`${INPUT} w-[76px]`}
                />
              </label>
            );
          })}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          aria-label="Find an athlete"
          placeholder="Find an athlete"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={`${INPUT} w-56`}
        />
        <div role="group" aria-label="Show" className="flex gap-1">
          {([['all', 'All'], ['not_in', 'Not checked in'], ['not_weighed', 'Not weighed'], ['flagged', 'Flagged']] as [Filter, string][]).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setFilter(id)} aria-pressed={filter === id} className={filter === id ? TOGGLE_ON : TOGGLE_OFF}>{label}</button>
          ))}
        </div>
        <div role="group" aria-label="Scale unit" className="flex gap-1 ml-auto">
          <button type="button" onClick={() => setUnit('kg')} aria-pressed={unit === 'kg'} className={unit === 'kg' ? TOGGLE_ON : TOGGLE_OFF}>Scale in kg</button>
          <button type="button" onClick={() => setUnit('lb')} aria-pressed={unit === 'lb'} className={unit === 'lb' ? TOGGLE_ON : TOGGLE_OFF}>Scale in lb</button>
        </div>
      </div>

      {blockedReason && (
        <div role="note" className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-200 text-xs font-bold">{blockedReason}</div>
      )}
      {deskError && !desk && (
        <div role="alert" className="p-3 rounded-xl bg-zt-danger/15 border border-zt-danger text-zt-danger-text text-xs font-bold">Desk could not load: {deskError}</div>
      )}
      {error && (
        <div role="alert" className="p-3.5 rounded-xl bg-zt-danger/15 border border-zt-danger text-zt-danger-text text-xs font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden="true" /><span>{error}</span>
        </div>
      )}
      {notice && (
        <div role="status" className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" aria-hidden="true" /><span>{notice}</span>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-xs text-zt-muted">No active athletes on the roster yet. Accept registrations or add athletes on the Athletes tab.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-zt-border text-[10px] font-extrabold uppercase text-zt-muted">
                <th className="py-2.5 pr-3">Athlete</th>
                <th className="py-2.5 px-2">Division</th>
                <th className="py-2.5 px-2">Checked in</th>
                <th className="py-2.5 px-2">Bodyweight</th>
                <th className="py-2.5 px-2">Class</th>
                <th className="py-2.5 px-2">Waiver</th>
                <th className="py-2.5 px-2">Card</th>
                <th className="py-2.5 px-2">Paid</th>
                <th className="py-2.5 pl-2">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zt-border">
              {visible.map(({ athlete: a, row, cap, check, reg }) => {
                const regCards = reg && cards ? cards[reg.id] ?? [] : [];
                const bestCard = regCards.length ? [...regCards].sort((x, y) => y.expiresOn.localeCompare(x.expiresOn))[0] : null;
                const weightValue = weightDraft[a.id] ?? (row?.weighedKg !== null && row?.weighedKg !== undefined ? (unit === 'kg' ? String(row.weighedKg) : String(kgToLb(row.weighedKg))) : '');
                const disabled = Boolean(blockedReason);
                return (
                  <tr key={a.id} className={`hover:bg-zt-inset/50 ${row?.checkedInAt ? '' : 'opacity-90'}`}>
                    <td className="py-2.5 pr-3">
                      <div className="font-bold text-zt-text">{a.name}</div>
                      <div className="text-[10px] text-zt-muted">Lot {a.lotNumber}{reg ? '' : ' · hand-added'}</div>
                    </td>
                    <td className="py-2.5 px-2">
                      <select
                        aria-label={`Division for ${a.name}`}
                        value={a.divisionId}
                        disabled={disabled || busy === `d-${a.id}`}
                        onChange={(e) => {
                          const target = divById.get(e.target.value);
                          void run(`d-${a.id}`, () => onUpdateAthlete(a.id, { divisionId: e.target.value }), `${a.name} moved to ${target?.name ?? 'the new division'}.`);
                        }}
                        className={`${INPUT} max-w-[180px]`}
                      >
                        {divisionsSorted.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </td>
                    <td className="py-2.5 px-2">
                      <button
                        type="button"
                        disabled={disabled || busy === `c-${a.id}`}
                        aria-pressed={Boolean(row?.checkedInAt)}
                        onClick={() => void run(`c-${a.id}`, () => onUpdateAthlete(a.id, { checkedIn: !row?.checkedInAt }))}
                        className={row?.checkedInAt ? TOGGLE_ON : TOGGLE_OFF}
                      >
                        {row?.checkedInAt ? `In ${clock(row.checkedInAt)}` : 'Check in'}
                      </button>
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          inputMode="decimal"
                          aria-label={`Bodyweight for ${a.name} in ${unit}`}
                          value={weightValue}
                          disabled={disabled || busy === `w-${a.id}`}
                          onChange={(e) => setWeightDraft((p) => ({ ...p, [a.id]: e.target.value }))}
                          onBlur={() => saveWeight(a)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
                          placeholder={unit}
                          className={`${INPUT} w-[84px]`}
                        />
                        <span className="text-[10px] text-zt-muted whitespace-nowrap">
                          {row?.weighedKg !== null && row?.weighedKg !== undefined ? (unit === 'kg' ? `${kgToLb(row.weighedKg)} lb` : formatKg(row.weighedKg)) : a.bodyweight ? `${a.bodyweight} lb listed` : ''}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-2">
                      {check.status === 'over' ? (
                        <span className={`${CHIP} bg-zt-danger/15 text-zt-danger-text border border-zt-danger`}>Over by {formatKg(check.overByKg)}</span>
                      ) : check.status === 'ok' ? (
                        <span className={`${CHIP} bg-emerald-500/15 text-emerald-300`}>Makes {formatKg(cap!)}</span>
                      ) : cap !== undefined ? (
                        <span className="text-[10px] text-zt-muted">Cap {formatKg(cap)}</span>
                      ) : (
                        <span className="text-[10px] text-zt-muted">No cap</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2">
                      {reg?.waiverAcceptedAt ? (
                        <span className={`${CHIP} bg-emerald-500/15 text-emerald-300`} title={reg.waiverAcceptedAt}>Online</span>
                      ) : (
                        <button
                          type="button"
                          disabled={disabled || busy === `pw-${a.id}`}
                          aria-pressed={Boolean(row?.paperWaiverAt)}
                          onClick={() => void run(`pw-${a.id}`, () => onUpdateAthlete(a.id, { paperWaiver: !row?.paperWaiverAt }))}
                          className={row?.paperWaiverAt ? TOGGLE_ON : `${TOGGLE_OFF} border-amber-500/60`}
                        >
                          {row?.paperWaiverAt ? 'Paper signed' : 'Needs waiver'}
                        </button>
                      )}
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="flex flex-col gap-1">
                        {bestCard && (
                          <span className={`${CHIP} ${cardStatus(bestCard.expiresOn, todayIso) === 'expired' ? 'bg-zt-danger/15 text-zt-danger-text' : 'bg-zt-inset text-zt-text-2'}`}>
                            {bestCard.federation.toUpperCase()}: {cardStatusLabel(cardStatus(bestCard.expiresOn, todayIso), bestCard.expiresOn)}
                          </span>
                        )}
                        <button
                          type="button"
                          disabled={disabled || busy === `cv-${a.id}`}
                          aria-pressed={Boolean(row?.cardVerifiedAt)}
                          onClick={() => void run(`cv-${a.id}`, () => onUpdateAthlete(a.id, { cardVerified: !row?.cardVerifiedAt }))}
                          className={row?.cardVerifiedAt ? TOGGLE_ON : TOGGLE_OFF}
                        >
                          {row?.cardVerifiedAt ? 'Card seen' : 'Mark card seen'}
                        </button>
                      </div>
                    </td>
                    <td className="py-2.5 px-2">
                      {reg ? (
                        <span className={`${CHIP} ${reg.paid ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-200'}`}>{reg.paid ? 'Paid' : 'Unpaid'}</span>
                      ) : (
                        <span className="text-[10px] text-zt-muted">n/a</span>
                      )}
                    </td>
                    <td className="py-2.5 pl-2">
                      <input
                        type="text"
                        maxLength={120}
                        aria-label={`Desk note for ${a.name}`}
                        value={noteDraft[a.id] ?? row?.note ?? ''}
                        disabled={disabled || busy === `n-${a.id}`}
                        onChange={(e) => setNoteDraft((p) => ({ ...p, [a.id]: e.target.value }))}
                        onBlur={() => {
                          const v = noteDraft[a.id];
                          if (v === undefined || v === (row?.note ?? '')) return;
                          void run(`n-${a.id}`, () => onUpdateAthlete(a.id, { note: v }));
                          setNoteDraft((p) => { const n = { ...p }; delete n[a.id]; return n; });
                        }}
                        placeholder="e.g. card expired, paid cash"
                        className={`${INPUT} w-[170px]`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visible.length === 0 && <p className="text-xs text-zt-muted mt-3">Nobody matches that filter.</p>}
        </div>
      )}
    </section>
  );
}

function waiverOk(reg: RegistrationRequest | undefined, row: DeskCheckin | undefined): boolean {
  return Boolean(reg?.waiverAcceptedAt || row?.paperWaiverAt);
}

function clock(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] font-extrabold uppercase text-zt-muted">{label}</dt>
      <dd className={`text-base font-black ${warn ? 'text-zt-danger-text' : 'text-zt-text'}`}>{value}</dd>
    </div>
  );
}
