'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { filterPublicAthletes, ROLE_OPTIONS, TRAINER_MODE_OPTIONS, type PublicAthlete } from '@/lib/website/athletes';
import { athleteProfilePath } from '@/lib/auth/profile';
import { Cap, textLink } from './sheet';

interface AthletesBrowserProps {
  initialAthletes: PublicAthlete[];
  availableStates: string[];
  // From the query string (/athletes?state=TN&role=trainer&q=slate), already validated by the page (Astra AD-RL2).
  initialState?: string;
  initialRole?: string;
  initialSearch?: string;
  // /trainers (029): the role is fixed, the Role select is replaced by an in-person / online filter.
  fixedRole?: 'trainer';
  initialMode?: string;
}

// Hand redraw in the sheet grammar (11/5, sweep item 5): one ruled filter block, people as cells of a ruled grid
// (square avatar with initials when there is no photo, name, @handle, role chips, location, favorite lift).
const CHIP = 'inline-flex items-center border border-rule px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-ink whitespace-nowrap';
function initials(name: string): string {
  const parts = name.replace(/^@/, '').split(/[\s_.-]+/).filter(Boolean);
  return (parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? '?').slice(0, 2)).toUpperCase();
}

export default function AthletesBrowser({ initialAthletes, availableStates, initialState = 'ALL', initialRole = 'ALL', initialSearch = '', fixedRole, initialMode = 'ALL' }: AthletesBrowserProps) {
  const [search, setSearch] = useState(initialSearch);
  const [stateFilter, setStateFilter] = useState(initialState);
  const [role, setRole] = useState(fixedRole ?? initialRole);
  const [mode, setMode] = useState(fixedRole ? initialMode : 'ALL');

  const filtered = useMemo(
    () => filterPublicAthletes(initialAthletes, { search, state: stateFilter, role, mode }),
    [initialAthletes, search, stateFilter, role, mode]
  );
  // A linked state nobody is listed in still shows as selected (with zero matches) rather than snapping to All.
  const stateOptions = stateFilter === 'ALL' || availableStates.includes(stateFilter) ? availableStates : [...availableStates, stateFilter].sort();
  const active = search.trim() !== '' || stateFilter !== 'ALL' || (fixedRole ? mode !== 'ALL' : role !== 'ALL');
  const reset = () => { setSearch(''); setStateFilter('ALL'); setRole(fixedRole ?? 'ALL'); setMode('ALL'); };

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Filter people" className="zt-block grid-cols-1">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_8rem_12rem] gap-x-6 gap-y-4 px-4 py-4 sm:px-5 items-end">
          <label className="flex flex-col gap-1.5">
            <Cap as="span">Search</Cap>
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or @username" className="zt-input" />
          </label>
          <label className="flex flex-col gap-1.5">
            <Cap as="span">State</Cap>
            <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} className="zt-input">
              <option value="ALL">All</option>
              {stateOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          {fixedRole ? (
            <label className="flex flex-col gap-1.5">
              <Cap as="span">Coaching</Cap>
              <select value={mode} onChange={(e) => setMode(e.target.value)} className="zt-input">
                <option value="ALL">In person or online</option>
                {TRAINER_MODE_OPTIONS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
          ) : (
            <label className="flex flex-col gap-1.5">
              <Cap as="span">Role</Cap>
              <select value={role} onChange={(e) => setRole(e.target.value)} className="zt-input">
                <option value="ALL">Everyone</option>
                {ROLE_OPTIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </label>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-5 text-[13px]">
          <span className="text-ink-muted">
            {filtered.length === initialAthletes.length ? `${filtered.length} listed` : <>{<strong className="text-ink">{filtered.length}</strong>} of {initialAthletes.length} match</>}
          </span>
          {active && <button type="button" onClick={reset} className={textLink}>Reset filters</button>}
        </div>
      </section>

      {filtered.length === 0 ? (
        <div className="zt-block grid-cols-1">
          <p className="px-5 py-5 text-[15px] leading-relaxed text-ink-muted">
            {initialAthletes.length === 0
              ? (fixedRole ? 'No trainers are listed yet. Tick "I coach" on your account page and turn on your public profile to be first.' : 'Nobody is listed yet. Turn on your public profile from the account page and you will be first.')
              : 'No one matches those filters.'}
          </p>
        </div>
      ) : (
        <ul className="zt-block grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((a) => (
            <li key={a.id} className="min-w-0">
              <Link href={athleteProfilePath(a.username)} className="flex gap-4 px-4 py-4 sm:px-5 h-full no-underline hover:bg-ground group">
                <div className="w-14 h-14 shrink-0 border-2 border-rule bg-ground flex items-center justify-center overflow-hidden">
                  {a.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span aria-hidden="true" className="font-sheet text-pen text-[22px] leading-none">{initials(a.displayName)}</span>
                  )}
                </div>
                <div className="min-w-0 flex flex-col gap-1">
                  <div className="text-[17px] font-bold leading-tight text-ink truncate group-hover:text-pen">{a.displayName}</div>
                  <Cap as="span" className="truncate">@{a.username}</Cap>
                  {a.badges.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {a.badges.map((b) => <span key={b} className={CHIP}>{b}</span>)}
                    </div>
                  )}
                  {(a.location || a.favoriteLift) && (
                    <div className="text-[13px] leading-snug text-ink-muted pt-0.5">
                      {a.location && <div className="truncate">{a.location}</div>}
                      {a.favoriteLift && <div className="truncate">Favorite lift: <span className="text-ink">{a.favoriteLift}</span></div>}
                    </div>
                  )}
                </div>
              </Link>
            </li>
          ))}
          {/* fill the last row so the ruled grid shows no dark holes */}
          {Array.from({ length: (6 - (filtered.length % 6)) % 6 }).map((_, i) => (
            <li key={`fill-${i}`} aria-hidden="true" className={`hidden ${i < (2 - (filtered.length % 2)) % 2 ? 'sm:block' : ''} ${i < (3 - (filtered.length % 3)) % 3 ? 'lg:block' : 'lg:hidden'}`} />
          ))}
        </ul>
      )}
    </div>
  );
}
