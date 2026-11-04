'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Cap, textLink } from '@/components/website/sheet';
import { getSupabase } from '@/lib/auth/supabaseBrowser';
import { fetchHostGym, hostGymAddressLine, searchHostGyms, type HostGymOption } from '@/lib/website/hostGym';

interface HostGymPickerProps {
  value: string; // gym id or ''
  onChange: (gym: HostGymOption | null) => void;
  // Copies the chosen gym's address into the venue fields; the parent decides what that means.
  onUseAddress?: (gym: HostGymOption) => void;
  // 029: the account page reuses the picker for the home gym; these override the listing copy and ids.
  id?: string;
  label?: string;
  help?: string;
  clearLabel?: string;
  offlineNote?: string;
}

const INPUT = 'zt-input w-full';
const NOTE = 'text-[13px] leading-snug text-ink-muted';

// Links a meet to a directory gym (026). Searches `gyms` by name as the promoter types; the chosen gym shows as a
// chip with the address and a clear button. Without a backend the field explains itself and stays inert.
export default function HostGymPicker({
  value,
  onChange,
  onUseAddress,
  id = 'listing-host-gym',
  label = 'Host Gym (from the Gym Directory)',
  help = 'Optional. Links the show page to the gym and lists the show on the gym\u2019s page. The venue fields below stay the address shown to athletes.',
  clearLabel = 'Clear host gym',
  offlineNote = 'Host gym: connects a show to a Gym Directory listing when the live backend is on. Preview data has no directory.',
}: HostGymPickerProps) {
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
      <p className={NOTE}>{offlineNote}</p>
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
    <div className="flex flex-col gap-1.5 min-w-0">
      <label htmlFor={id}><Cap as="span">{label}</Cap></label>
      {chosen ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-2 border-rule px-3 py-2 min-h-[44px]">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold text-ink truncate">{chosen.name}</div>
            <div className={`${NOTE} truncate`}>{hostGymAddressLine(chosen)}</div>
          </div>
          <Link href={`/gyms/${chosen.slug}`} target="_blank" rel="noreferrer" className={`text-[13px] ${textLink}`}>
            View
          </Link>
          {onUseAddress && (chosen.city || chosen.streetAddress) && (
            <button type="button" onClick={() => onUseAddress(chosen)} className={`text-[13px] ${textLink}`}>
              Use gym address
            </button>
          )}
          <button type="button" onClick={clear} aria-label={clearLabel} className={`text-[13px] ${textLink}`}>
            Clear
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            id={id}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the directory by gym name"
            autoComplete="off"
            className={INPUT}
            aria-describedby={`${id}-help`}
          />
          {(results.length > 0 || searching) && (
            <ul
              role="listbox"
              aria-label="Matching gyms"
              className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto border-2 border-rule bg-sheet"
            >
              {searching && results.length === 0 && (
                <li className={`px-3 py-2 ${NOTE}`}>Searching…</li>
              )}
              {results.map((g) => (
                <li key={g.id} role="option" aria-selected={false} className="border-b border-rule last:border-b-0">
                  <button
                    type="button"
                    onClick={() => pick(g)}
                    className="w-full text-left px-3 py-2 hover:bg-ground focus:bg-ground focus:outline-none"
                  >
                    <div className="text-[15px] font-bold text-ink">{g.name}</div>
                    <div className={NOTE}>{hostGymAddressLine(g)}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p id={`${id}-help`} className={NOTE}>
        {note ?? help}
      </p>
    </div>
  );
}
