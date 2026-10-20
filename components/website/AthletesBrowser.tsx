'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { MapPin, RotateCcw, Search, User } from 'lucide-react';
import { filterPublicAthletes, ROLE_OPTIONS, type PublicAthlete } from '@/lib/website/athletes';
import { athleteProfilePath } from '@/lib/auth/profile';

interface AthletesBrowserProps {
  initialAthletes: PublicAthlete[];
  availableStates: string[];
  // From the query string (/athletes?state=TN&role=trainer&q=slate), already validated by the page (Astra AD-RL2).
  initialState?: string;
  initialRole?: string;
  initialSearch?: string;
}

const inputCls = 'w-full bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-xs font-bold text-zt-text focus:outline-none focus:border-zt-primary';

export default function AthletesBrowser({ initialAthletes, availableStates, initialState = 'ALL', initialRole = 'ALL', initialSearch = '' }: AthletesBrowserProps) {
  const [search, setSearch] = useState(initialSearch);
  const [stateFilter, setStateFilter] = useState(initialState);
  const [role, setRole] = useState(initialRole);

  const filtered = useMemo(
    () => filterPublicAthletes(initialAthletes, { search, state: stateFilter, role }),
    [initialAthletes, search, stateFilter, role]
  );
  // A linked state nobody is listed in still shows as selected (with zero matches) rather than snapping to All.
  const stateOptions = stateFilter === 'ALL' || availableStates.includes(stateFilter) ? availableStates : [...availableStates, stateFilter].sort();
  const active = search.trim() !== '' || stateFilter !== 'ALL' || role !== 'ALL';
  const reset = () => { setSearch(''); setStateFilter('ALL'); setRole('ALL'); };

  return (
    <div className="space-y-4">
      <div className="bg-zt-surface border border-zt-border rounded-2xl p-3.5 grid grid-cols-1 sm:grid-cols-[1fr_8rem_10rem_auto] gap-2 items-end">
        <label className="block">
          <span className="text-[10px] font-extrabold uppercase text-zt-muted">Search</span>
          <span className="relative block">
            <Search className="w-3.5 h-3.5 text-zt-muted absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or @username" className={`${inputCls} pl-8`} />
          </span>
        </label>
        <label className="block">
          <span className="text-[10px] font-extrabold uppercase text-zt-muted">State</span>
          <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} className={inputCls}>
            <option value="ALL">All</option>
            {stateOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-[10px] font-extrabold uppercase text-zt-muted">Role</span>
          <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
            <option value="ALL">Everyone</option>
            {ROLE_OPTIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </label>
        <button type="button" onClick={reset} disabled={!active} className="px-3 py-2 rounded-xl bg-zt-inset border border-zt-border text-zt-text-2 font-bold text-xs inline-flex items-center gap-1.5 disabled:opacity-40">
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Reset
        </button>
      </div>

      <p className="text-[11px] font-bold text-zt-muted">
        {filtered.length === initialAthletes.length ? `${filtered.length} listed` : `${filtered.length} of ${initialAthletes.length} match`}
      </p>

      {filtered.length === 0 ? (
        <p className="text-xs font-bold text-zt-muted bg-zt-surface border border-zt-border rounded-2xl p-4">
          {initialAthletes.length === 0
            ? 'Nobody is listed yet. Turn on your public profile from the account page and you will be first.'
            : 'No one matches those filters.'}
        </p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((a) => (
            <li key={a.id}>
              <Link href={athleteProfilePath(a.username)} className="block bg-zt-surface border border-zt-border hover:border-zt-primary rounded-2xl p-4 transition h-full">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-zt-inset border border-zt-border-strong flex items-center justify-center shrink-0">
                    {a.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-5 h-5 text-zt-muted" aria-hidden="true" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-black text-zt-text truncate">{a.displayName}</div>
                    <div className="text-[11px] font-bold text-zt-muted truncate">@{a.username}</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {a.badges.map((b) => (
                    <span key={b} className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-zt-inset border border-zt-border text-zt-primary">{b}</span>
                  ))}
                </div>
                <div className="mt-2 space-y-0.5 text-[11px] font-semibold text-zt-text-2">
                  {a.location && (
                    <div className="flex items-center gap-1.5 truncate"><MapPin className="w-3 h-3 text-zt-primary shrink-0" aria-hidden="true" />{a.location}</div>
                  )}
                  {a.favoriteLift && <div className="truncate">Favorite lift: {a.favoriteLift}</div>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
