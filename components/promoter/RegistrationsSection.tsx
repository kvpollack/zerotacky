'use client';

import React, { useState } from 'react';
import { AlertTriangle, Check, UserCheck, Users, X } from 'lucide-react';
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
}

export default function RegistrationsSection({
  registrations,
  divisions,
  athletes,
  onSetStatus,
}: RegistrationsSectionProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const divisionNameById = new Map(divisions.map((d) => [d.id, d.name]));

  const findMatchingRosterAthlete = (reg: RegistrationRequest): Athlete | undefined => {
    return athletes.find(
      (a) =>
        a.id === `reg-ath-${reg.id}` ||
        (a.divisionId === reg.divisionId &&
          a.name.trim().toLowerCase() === reg.athleteName.trim().toLowerCase())
    );
  };

  const handleAction = async (id: string, nextStatus: RegistrationRequest['status']) => {
    setBusyId(id);
    setActionError(null);
    const res = await onSetStatus(id, nextStatus);
    setBusyId(null);
    if (res.error) {
      setActionError(res.error);
    }
  };

  return (
    <section className="bg-zt-surface border border-zt-border rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zt-border pb-3">
        <div>
          <h2 className="text-sm font-black uppercase tracking-wider text-zt-primary flex items-center gap-2">
            <Users className="w-4 h-4" aria-hidden="true" />
            <span>6. Athlete Registrations ({registrations.length})</span>
          </h2>
          <p className="text-xs text-zt-muted mt-0.5">
            Accepting a registration automatically adds the athlete to that division&apos;s meet
            roster (Section 4) with the next lot number.
          </p>
        </div>
      </div>

      {actionError && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-zt-danger/15 border border-zt-danger text-zt-danger-text text-xs font-bold flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          <span>{actionError}</span>
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
                const rosterEntry =
                  reg.status === 'accepted' ? findMatchingRosterAthlete(reg) : undefined;
                const isBusy = busyId === reg.id;

                return (
                  <tr key={reg.id} className="hover:bg-zt-inset/50">
                    <td className="py-3 pr-3">
                      <div className="font-black text-zt-text">{reg.athleteName}</div>
                      <div className="text-[11px] font-semibold text-zt-muted">{reg.email}</div>
                    </td>
                    <td className="py-3 px-2 font-bold text-zt-text-2 whitespace-nowrap">
                      {divName}
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
                          disabled={isBusy || reg.status === 'accepted'}
                          onClick={() => handleAction(reg.id, 'accepted')}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-500 text-emerald-950 font-black text-[11px] uppercase inline-flex items-center gap-1 disabled:opacity-35"
                        >
                          <Check className="w-3 h-3" aria-hidden="true" />
                          Accept
                        </button>
                        <button
                          type="button"
                          disabled={isBusy || reg.status === 'declined'}
                          onClick={() => handleAction(reg.id, 'declined')}
                          className="px-2.5 py-1.5 rounded-lg bg-zt-inset border border-zt-border-strong text-zt-text-2 hover:text-red-300 font-extrabold text-[11px] uppercase inline-flex items-center gap-1 disabled:opacity-35"
                        >
                          <X className="w-3 h-3" aria-hidden="true" />
                          Decline
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
