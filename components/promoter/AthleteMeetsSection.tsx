'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Heart, Medal, Ticket, AlertTriangle } from 'lucide-react';
import type { MyAthleteMeet } from '@/lib/promoter/contract';
import { athleteMeetBadge, bucketAthleteMeets } from '@/lib/promoter/rules';
import { usePromoterApi } from '@/lib/promoter/usePromoterApi';

// Athlete side of My Meets (010, Kurt 10/19): Following -> Registered (upcoming) -> Completed. Rendered for every
// signed-in account above the promoter section; empty buckets collapse to one line so a pure promoter is not shown
// three empty boxes.
export default function AthleteMeetsSection() {
  const api = usePromoterApi();
  const [rows, setRows] = useState<MyAthleteMeet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busySlug, setBusySlug] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api.listMyAthleteMeets();
    if (res.error) setError(res.error);
    else { setError(null); setRows(res.data ?? []); }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const unfollow = async (slug: string) => {
    setBusySlug(slug);
    const res = await api.followShow(slug, false);
    setBusySlug(null);
    if (res.error) { setError(res.error); return; }
    setRows((prev) => (prev ? prev.filter((r) => !(r.kind === 'follow' && r.slug === slug)) : prev));
  };

  if (error) {
    return (
      <section className="p-4 rounded-2xl bg-zt-danger/15 border border-zt-danger text-zt-danger-text text-xs font-bold flex items-center gap-2.5" role="alert">
        <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
        <span>Could not load the shows you follow or entered: {error}</span>
      </section>
    );
  }
  if (rows === null) {
    return <section className="bg-zt-surface border border-zt-border rounded-2xl p-5 text-xs font-bold text-zt-muted">Loading your shows…</section>;
  }

  const b = bucketAthleteMeets(rows);
  const groups: Array<{ id: string; title: string; icon: React.ReactNode; items: MyAthleteMeet[]; empty: string }> = [
    { id: 'registered', title: 'Registered', icon: <Ticket className="w-3.5 h-3.5" aria-hidden="true" />, items: b.registered, empty: 'No upcoming entries. Register from a show page and it lands here.' },
    { id: 'following', title: 'Following', icon: <Heart className="w-3.5 h-3.5" aria-hidden="true" />, items: b.following, empty: 'Follow a show from its page to keep an eye on it here.' },
    { id: 'completed', title: 'Completed', icon: <Medal className="w-3.5 h-3.5" aria-hidden="true" />, items: b.completed, empty: 'Shows you competed in appear here once the promoter marks them completed.' },
  ];

  return (
    <section className="bg-zt-surface border border-zt-border rounded-2xl p-5 sm:p-6 space-y-4" data-testid="athlete-meets">
      <div className="space-y-1">
        <span className="text-[10px] font-black uppercase tracking-widest text-zt-primary flex items-center gap-1.5">
          <Ticket className="w-3.5 h-3.5" aria-hidden="true" />
          Competing &amp; Following
        </span>
        <p className="text-xs text-zt-text-2">
          Shows you follow, shows you entered, and shows you have competed in.{' '}
          <Link href="/shows" className="text-zt-primary font-bold underline">Find a Show</Link> to add more.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {groups.map((g) => (
          <div key={g.id} className="bg-zt-inset border border-zt-border rounded-xl p-3.5 space-y-2.5">
            <div className="text-[11px] font-extrabold uppercase text-zt-text flex items-center gap-1.5">
              {g.icon}
              {g.title}
              <span className="ml-auto text-zt-muted">{g.items.length}</span>
            </div>
            {g.items.length === 0 ? (
              <p className="text-[11px] text-zt-muted">{g.empty}</p>
            ) : (
              <ul className="space-y-2">
                {g.items.map((r) => (
                  <li key={`${r.kind}-${r.meetServerId}`} className="bg-zt-surface border border-zt-border rounded-lg p-2.5 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/shows/${r.slug}`} className="text-xs font-black text-zt-text underline-offset-2 hover:underline leading-tight">
                        {r.name}
                      </Link>
                      <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-zt-primary/15 text-zt-primary border border-zt-primary/40 whitespace-nowrap">
                        {athleteMeetBadge(r)}
                      </span>
                    </div>
                    <div className="text-[11px] font-semibold text-zt-muted">
                      {r.date || 'Date TBA'}
                      {r.divisionName ? ` · ${r.divisionName}` : ''}
                      {r.competitionStatus !== 'upcoming' ? ` · ${r.competitionStatus}` : ''}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-0.5">
                      {g.id === 'completed' && (
                        <Link href={`/shows/${r.slug}`} className="text-[11px] font-extrabold uppercase text-zt-primary underline">
                          Results
                        </Link>
                      )}
                      {r.kind === 'follow' && (
                        <button
                          type="button"
                          disabled={busySlug === r.slug}
                          onClick={() => unfollow(r.slug)}
                          className="text-[11px] font-extrabold uppercase text-zt-muted hover:text-zt-text underline disabled:opacity-50"
                        >
                          Unfollow
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
