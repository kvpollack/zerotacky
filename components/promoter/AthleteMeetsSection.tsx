'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Cap, textLink } from '@/components/website/sheet';
import type { MyAthleteMeet } from '@/lib/promoter/contract';
import { athleteMeetBadge, bucketAthleteMeets } from '@/lib/promoter/rules';
import { usePromoterApi } from '@/lib/promoter/usePromoterApi';

// Athlete side of My Meets (010, Kurt 10/19): Following -> Registered (upcoming) -> Completed. Rendered for every
// signed-in account above the promoter section; empty buckets collapse to one line so a pure promoter is not shown
// three empty boxes.
// UI transition hand redraw (11/4, from the route sweep): three ruled columns in a .zt-block, each a cap + count over a
// list of rows; status as a cap, links as text links. Data flow unchanged.
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
      <section className="zt-block" role="alert">
        <div className="px-5 py-4 text-[15px] font-bold text-ink">Could not load the shows you follow or entered: {error}</div>
      </section>
    );
  }
  if (rows === null) {
    return <section className="zt-block"><div className="px-5 py-4 text-[13px] uppercase tracking-[0.04em] text-ink-muted">Loading your shows…</div></section>;
  }

  const b = bucketAthleteMeets(rows);
  const groups: Array<{ id: string; title: string; items: MyAthleteMeet[]; empty: string }> = [
    { id: 'registered', title: 'Registered', items: b.registered, empty: 'No upcoming entries. Register from a show page and it lands here.' },
    { id: 'following', title: 'Following', items: b.following, empty: 'Follow a show from its page to keep an eye on it here.' },
    { id: 'completed', title: 'Completed', items: b.completed, empty: 'Shows you competed in appear here once the promoter marks them completed.' },
  ];

  return (
    <section data-testid="athlete-meets" aria-labelledby="athlete-meets-heading">
      <div className="flex flex-col gap-1 mb-2.5">
        <Cap as="span">Competing &amp; following</Cap>
        <h2 id="athlete-meets-heading" className="text-[22px] font-bold leading-tight text-ink">Your shows</h2>
        <p className="text-[13px] text-ink-muted">
          Shows you follow, shows you entered, and shows you have competed in.{' '}
          <Link href="/shows" className={textLink}>Find a Show</Link> to add more.
        </p>
      </div>

      <div className="zt-block grid-cols-1 md:grid-cols-3">
        {groups.map((g) => (
          <div key={g.id} className="flex flex-col">
            <div className="flex items-baseline justify-between gap-2 px-4 py-2.5 border-b border-rule">
              <Cap as="h3">{g.title}</Cap>
              <span className="font-sheet text-pen text-[18px] leading-none">{g.items.length}</span>
            </div>
            {g.items.length === 0 ? (
              <p className="px-4 py-3 text-[13px] text-ink-muted">{g.empty}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-rule">
                {g.items.map((r) => (
                  <li key={`${r.kind}-${r.meetServerId}`} className="px-4 py-3 flex flex-col gap-1">
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`/shows/${r.slug}`} className={`${textLink} text-[15px] leading-tight`}>
                        {r.name}
                      </Link>
                      <Cap as="span" className="whitespace-nowrap pt-0.5">{athleteMeetBadge(r)}</Cap>
                    </div>
                    <div className="text-[13px] text-ink-muted">
                      {r.date || 'Date TBA'}
                      {r.divisionName ? ` · ${r.divisionName}` : ''}
                      {r.competitionStatus !== 'upcoming' ? ` · ${r.competitionStatus}` : ''}
                    </div>
                    {(g.id === 'completed' || r.kind === 'follow') && (
                      <div className="flex flex-wrap gap-3 pt-0.5 text-[13px]">
                        {g.id === 'completed' && (
                          <Link href={`/shows/${r.slug}`} className={textLink}>Results</Link>
                        )}
                        {r.kind === 'follow' && (
                          <button
                            type="button"
                            disabled={busySlug === r.slug}
                            onClick={() => unfollow(r.slug)}
                            className={`${textLink} disabled:opacity-50`}
                          >
                            Unfollow
                          </button>
                        )}
                      </div>
                    )}
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
