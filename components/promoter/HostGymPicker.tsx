'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Building2, Search, X } from 'lucide-react';
import { getSupabase } from '@/lib/auth/supabaseBrowser';
import { fetchHostGym, hostGymAddressLine, searchHostGyms, type HostGymOption } from '@/lib/website/hostGym';

interface HostGymPickerProps {
  value: string; // gym id or ''
  onChange: (gym: HostGymOption | null) => void;
  // Copies the chosen gym's address into the venue fields; the parent decides what that means.
  onUseAddress?: (gym: HostGymOption) => void;
}

const INPUT = 'w-full bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-xs font-bold text-zt-text';

// Links a meet to a directory gym (026). Searches `gyms` by name as the promoter types; the chosen gym shows as a
// chip with the address and a clear button. Without a backend the field explains itself and stays inert.
export default function HostGymPicker({ value, onChange, onUseAddress }: HostGymPickerProps) {
  const sb = getSupabase();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<HostGymOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [chosen, setChosen] = useState<HostGymOption | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resolve the saved id into a name once (and again if the saved value changes under us, e.g. after Reset).
  useEffect(() => {
    if (!sb) return;
    if (!value) {
      setChosen(null);
      return;
    }
    if (chosen?.id === value) return;
    let cancelled = false;
    fetchHostGym(sb, value)
      .then((g) => {
        if (cancelled) return;
        setChosen(g);
        if (!g) setNote('The saved host gym is no longer in the directory. Pick another or clear it.');
      })
      .catch((e: unknown) => {
        if (!cancelled) setNote(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb, value]);

  useEffect(() => {
    if (!sb) return;
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(() => {
      searchHostGyms(sb, q)
        .then((rows) => {
          setResults(rows);
          setNote(rows.length === 0 ? `No directory gym matches "${q}".` : null);
        })
        .catch((e: unknown) => setNote(e instanceof Error ? e.message : String(e)))
        .finally(() => setSearching(false));
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [sb, query]);

  if (!sb) {
    return (
      <p className="text-xs text-zt-muted">
        Host gym: connects a show to a Gym Directory listing when the live backend is on. Preview data has no directory.
      </p>
    );
  }

  const pick = (g: HostGymOption) => {
    setChosen(g);
    setQuery('');
    setResults([]);
    setNote(null);
    onChange(g);
  };

  const clear = () => {
    setChosen(null);
    setNote(null);
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <label htmlFor="listing-host-gym" className="block text-[11px] font-bold uppercase text-zt-muted">
        Host Gym (from the Gym Directory)
      </label>
      {chosen ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zt-border-strong bg-zt-inset px-3 py-2">
          <Building2 className="w-4 h-4 text-zt-primary shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-black text-zt-text truncate">{chosen.name}</div>
            <div className="text-[11px] text-zt-muted truncate">{hostGymAddressLine(chosen)}</div>
          </div>
          <Link
            href={`/gyms/${chosen.slug}`}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] font-bold text-zt-primary underline"
          >
            View
          </Link>
          {onUseAddress && (chosen.city || chosen.streetAddress) && (
            <button
              type="button"
              onClick={() => onUseAddress(chosen)}
              className="text-[11px] font-bold px-2 py-1 rounded-lg border border-zt-border-strong text-zt-text hover:border-zt-primary"
            >
              Use gym address
            </button>
          )}
          <button
            type="button"
            onClick={clear}
            aria-label="Clear host gym"
            className="p-1 rounded-lg text-zt-muted hover:text-zt-text hover:bg-zt-surface"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="w-4 h-4 text-zt-muted absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            id="listing-host-gym"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the directory by gym name"
            autoComplete="off"
            className={`${INPUT} pl-9`}
            aria-describedby="listing-host-gym-help"
          />
          {(results.length > 0 || searching) && (
            <ul
              role="listbox"
              aria-label="Matching gyms"
              className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-zt-border-strong bg-zt-surface shadow-xl"
            >
              {searching && results.length === 0 && (
                <li className="px-3 py-2 text-xs text-zt-muted">Searching…</li>
              )}
              {results.map((g) => (
                <li key={g.id} role="option" aria-selected={false}>
                  <button
                    type="button"
                    onClick={() => pick(g)}
                    className="w-full text-left px-3 py-2 hover:bg-zt-inset focus:bg-zt-inset focus:outline-none"
                  >
                    <div className="text-xs font-black text-zt-text">{g.name}</div>
                    <div className="text-[11px] text-zt-muted">{hostGymAddressLine(g)}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p id="listing-host-gym-help" className="text-[11px] text-zt-muted">
        {note ?? 'Optional. Links the show page to the gym and lists the show on the gym\u2019s page. The venue fields below stay the address shown to athletes.'}
      </p>
    </div>
  );
}
