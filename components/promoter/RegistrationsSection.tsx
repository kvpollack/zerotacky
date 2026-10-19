'use client';

import React, { useState } from 'react';
import { AlertTriangle, Check, LogOut, PhoneCall, UserCheck, Users, X } from 'lucide-react';
import type { RegistrationRequest } from '@/lib/promoter/contract';
import type { Athlete, Division } from '@/lib/types';

interface RegistrationsSectionProps {
  registrations: RegistrationRequest[];
  divisions: Division[];
  athletes: Athlete[];
  onSetStatus: (
    id: string,
    status: RegistrationRequest['status']
  ) => Promise<{ error: string | null }>;
  // When set, Accept/Decline are disabled and this message is shown (e.g. unsaved builder edits).
  blockedReason?: string | null;
}

export default function RegistrationsSection({
  registrations,
  divisions,
  athletes,
  onSetStatus,
  blockedReason = null,
}: RegistrationsSectionProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  // Errors are kept per request so the message sits next to the row whose action failed.
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const divisionNameById = new Map(divisions.map((d) => [d.id, d.name]));

  // Roster rows are linked by athleteId only (contract); names are never used for matching.
  const rosterRowFor = (reg: RegistrationRequest): Athlete | undefined =>
    reg.athleteId ? athletes.find((a) => a.id === reg.athleteId) : undefined;

  const handleAction = async (id: string, nextStatus: RegistrationRequest['status']) => {
    if (blockedReason) {
      setRowErrors((prev) => ({ ...prev, [id]: blockedReason }));
      return;
    }
    setBusyId(id);
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    const res = await onSetStatus(id, nextStatus);
    setBusyId(null);
    if (res.error) {
      setRowErrors((prev) => ({ ...prev, [id]: res.error as string }));
    }
  };

  const pendingCount = registrations.filter((r) => r.status === 'pending').length;
  const acceptedCount = registrations.filter((r) => r.status === 'accepted').length;

  return (
    <section className="bg-zt-surface border border-zt-border rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zt-border pb-3">
        <div>
          <h2 className="text-sm font-black uppercase tracking-wider text-zt-primary flex items-center gap-2">
            <Users className="w-4 h-4" aria-hidden="true" />
            <span>6. Athlete Registrations ({registrations.length})</span>
          </h2>
          <p className="text-xs text-zt-muted mt-0.5">
            {pendingCount} pending, {acceptedCount} accepted. Accepting adds the athlete to that division&apos;s roster
            (Section 4) with the next lot number; declining removes the roster row unless it already has results.
            Emergency contacts are visible to you only.
          </p>
        </div>
      </div>

      {blockedReason && (
        <div
          role="status"
          className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          <span>{blockedReason}</span>
        </div>
      )}

      {registrations.length === 0 ? (
        <div className="bg-zt-inset border border-zt-border rounded-xl p-6 text-center text-xs font-bold text-zt-muted">
          No athlete registrations submitted for this meet yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-zt-border text-[10px] font-extrabold uppercase text-zt-muted">
                <th className="py-2.5 pr-3">Athlete</th>
                <th className="py-2.5 px-2">Emergency Contact</th>
                <th className="py-2.5 px-2">Division</th>
                <th className="py-2.5 px-2">Status &amp; Roster Link</th>
                <th className="py-2.5 px-2">Waiver</th>
                <th className="py-2.5 px-2">Paid</th>
                <th className="py-2.5 px-2">Submitted</th>
                <th className="py-2.5 pl-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zt-border">
              {registrations.map((reg) => {
                const divName = divisionNameById.get(reg.divisionId) ?? reg.divisionId;
                const rosterEntry = rosterRowFor(reg);
                const isBusy = busyId === reg.id;
                const rowError = rowErrors[reg.id];
                const disabled = isBusy || Boolean(blockedReason);

                return (
                  <React.Fragment key={reg.id}>
                  <tr className="hover:bg-zt-inset/50">
                    <td className="py-3 pr-3">
                      <div className="font-black text-zt-text">{reg.athleteName}</div>
                      <div className="text-[11px] font-semibold text-zt-muted">{reg.email}</div>
                    </td>
                    <td className="py-3 px-2 text-[11px] font-semibold text-zt-text-2">
                      <span className="inline-flex items-center gap-1">
                        <PhoneCall className="w-3 h-3 text-zt-muted" aria-hidden="true" />
                        {reg.emergencyContact || 'not provided'}
                      </span>
                      {/* 009: an athlete under 18 was registered by this parent/guardian; owner-only like the emergency contact */}
                      {reg.guardian && (
                        <span className="block mt-1 text-[10px] font-extrabold text-amber-300">
                          Under 18. Guardian: {reg.guardian.name} ({reg.guardian.contact})
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-2 font-bold text-zt-text-2 whitespace-nowrap">
                      {divName}
                      {/* G2-M1: the registration keeps the submitted division; the roster row is where they compete */}
                      {rosterEntry && rosterEntry.divisionId !== reg.divisionId && (
                        <span className="block text-[10px] font-extrabold text-amber-300">
                          competing in {divisionNameById.get(rosterEntry.divisionId) ?? rosterEntry.divisionId}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-2 whitespace-nowrap">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${
                            reg.status === 'accepted'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : reg.status === 'pending'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              : 'bg-zt-inset text-zt-muted border-zt-border'
                          }`}
                        >
                          {reg.status}
                        </span>
                        {reg.waitlisted && reg.status === 'pending' && (
                          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-zt-inset text-zt-text-2 border border-zt-border">
                            waitlisted
                          </span>
                        )}
                        {rosterEntry && (
                          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-zt-primary/15 text-zt-primary-2 border border-zt-primary/40 inline-flex items-center gap-1">
                            <UserCheck className="w-3 h-3" aria-hidden="true" />
                            On Roster (Lot #{rosterEntry.lotNumber})
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-2 whitespace-nowrap">
                      {reg.waiverAcceptedAt ? (
                        <span className="text-[11px] font-bold text-emerald-400">
                          Signed {reg.waiverAcceptedAt.slice(0, 10)}
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold text-amber-400">Unsigned</span>
                      )}
                    </td>
                    <td className="py-3 px-2 whitespace-nowrap">
                      <span
                        className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded ${
                          reg.paid
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-zt-inset text-zt-muted border border-zt-border'
                        }`}
                      >
                        {reg.paid ? 'Paid' : 'Unpaid'}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-zt-muted font-semibold whitespace-nowrap">
                      {reg.createdAt.slice(0, 10)}
                    </td>
                    <td className="py-3 pl-2 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={disabled || reg.status === 'accepted'}
                          onClick={() => handleAction(reg.id, 'accepted')}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-500 text-emerald-950 font-black text-[11px] uppercase inline-flex items-center gap-1 disabled:opacity-35"
                        >
                          <Check className="w-3 h-3" aria-hidden="true" />
                          Accept
                        </button>
                        <button
                          type="button"
                          disabled={disabled || reg.status === 'declined'}
                          onClick={() => handleAction(reg.id, 'declined')}
                          className="px-2.5 py-1.5 rounded-lg bg-zt-inset border border-zt-border-strong text-zt-text-2 hover:text-red-300 font-extrabold text-[11px] uppercase inline-flex items-center gap-1 disabled:opacity-35"
                        >
                          <X className="w-3 h-3" aria-hidden="true" />
                          Decline
                        </button>
                        {/* R6 (Astra rehearsal): the athlete pulled out after being accepted. Same server path as decline
                            (roster row leaves, scored athletes refused), kept separate so the record says what happened. */}
                        <button
                          type="button"
                          disabled={disabled || reg.status !== 'accepted'}
                          onClick={() => handleAction(reg.id, 'withdrawn')}
                          title="Athlete withdrew after being accepted"
                          className="px-2.5 py-1.5 rounded-lg bg-zt-inset border border-zt-border-strong text-zt-text-2 hover:text-amber-300 font-extrabold text-[11px] uppercase inline-flex items-center gap-1 disabled:opacity-35"
                        >
                          <LogOut className="w-3 h-3" aria-hidden="true" />
                          Withdraw
                        </button>
                      </div>
                    </td>
                  </tr>
                  {rowError && (
                    <tr>
                      <td colSpan={8} className="pb-3">
                        <div
                          role="alert"
                          className="p-2.5 rounded-lg bg-zt-danger/15 border border-zt-danger text-zt-danger-text text-[11px] font-bold flex items-center gap-2"
                        >
                          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                          <span>{reg.athleteName}: {rowError}</span>
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
