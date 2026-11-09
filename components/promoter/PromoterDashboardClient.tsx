'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AthleteMeetsSection from './AthleteMeetsSection';
import { Cap, keyClass, textLink } from '@/components/website/sheet';
import { longIsoDate } from '@/lib/website/sheetFormat';
import { slugify } from '@/lib/meetBuilder';
import { describeShowLifecycle } from '@/lib/website/filters';
import type { PromoterMeetSummary, PromoterUser } from '@/lib/promoter/contract';
import { isLiveBackend, setFixtureSignedOutForDev, usePromoterApi } from '@/lib/promoter/usePromoterApi';

// UI transition hand redraw (11/4, from the route sweep): heading row with a pen key, the create form as a ruled block of
// label-over-input cells, the meets as one ruled list (status caps, name, date · slug · venue, four counts in the sheet
// numeral, Reg form / Open keys). Lucide icons dropped; no colour outside ink / pen / muted. Logic untouched.
const INPUT = 'zt-input w-full';
const CELL = 'flex flex-col gap-1.5 px-4 py-3 sm:px-5 sm:py-3.5 min-w-0';
const NOTE = 'text-[13px] leading-snug text-ink-muted';

export default function PromoterDashboardClient() {
  const api = usePromoterApi();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<PromoterUser | null>(null);
  const [meets, setMeets] = useState<PromoterMeetSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Create meet form state
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDate, setNewDate] = useState('2026-12-05');
  const [newSlug, setNewSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);   // R3: a create that landed but could not be read back

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    // Dev-only query param handler (?signedout=1) to verify the signed-out state; fixture backend only
    // (the helper is a no-op when Supabase is configured, and loads the fixture module lazily: Astra H1).
    if (typeof window !== 'undefined' && !isLiveBackend()) {
      const params = new URLSearchParams(window.location.search);
      const isSignedOutParam = params.get('signedout') === '1';
      await setFixtureSignedOutForDev(isSignedOutParam);
    }

    const userRes = await api.getCurrentUser();
    if (userRes.error) {
      setLoadError(userRes.error);
      setLoading(false);
      return;
    }

    setUser(userRes.data);
    if (!userRes.data) {
      setMeets([]);
      setLoading(false);
      return;
    }

    const meetsRes = await api.listMyMeets();
    if (meetsRes.error) {
      setLoadError(meetsRes.error);
    } else {
      setMeets(meetsRes.data ?? []);
    }
    setLoading(false);
  }, [api]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreateMeet = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setNotice(null);
    setCreating(true);

    const computedSlug = slugEdited && newSlug.trim() ? slugify(newSlug) : slugify(newName);
    const res = await api.createMeet({
      name: newName,
      date: newDate,
      slug: computedSlug,
    });
    setCreating(false);

    if (res.committed && !res.data) {
      // R3: the meet exists; do not leave the form armed for a second create. Close it and reload the list.
      setCreateOpen(false);
      setNewName('');
      setNewSlug('');
      setSlugEdited(false);
      await refresh();
      setNotice(res.error ?? 'The meet was created, but it could not be loaded afterwards. The list below was reloaded; do not create it again.');
      return;
    }
    if (res.error || !res.data) {
      setCreateError(res.error ?? 'Could not create meet.');
      return;
    }

    setCreateOpen(false);
    setNewName('');
    setNewSlug('');
    setSlugEdited(false);
    router.push(`/promoter/${res.data.summary.serverId}`);
  };

  if (loading) {
    return (
      <div className="zt-block" aria-busy="true">
        <div className="px-5 py-5 text-[13px] uppercase tracking-[0.04em] text-ink-muted">Loading promoter dashboard…</div>
      </div>
    );
  }

  // A failed session lookup is an error, not a signed-out visitor (M11).
  if (!user && loadError) {
    return (
      <div className="max-w-xl zt-block">
        <div className={`${CELL} py-6 gap-3`}>
          <Cap as="span">Promoter dashboard</Cap>
          <h1 className="text-[28px] font-bold leading-tight text-ink">Could not check your session</h1>
          <p role="alert" className="text-[15px] font-bold text-ink">{loadError}</p>
          <button type="button" onClick={() => refresh()} className={keyClass('ink', 'self-start')}>Try again</button>
        </div>
      </div>
    );
  }

  // Signed-out state (getCurrentUser() returns null)
  if (!user) {
    return (
      <div className="max-w-xl zt-block">
        <div className={`${CELL} py-6 gap-3`}>
          <Cap as="span">Promoter dashboard</Cap>
          <h1 className="text-[28px] font-bold leading-tight text-ink">Sign-in is required</h1>
          <p className="text-[15px] leading-snug text-ink">
            You must be signed in to create meets, configure divisions and event weights, manage
            public directory listings, or review athlete registrations.
          </p>
          {loadError && <div role="alert" className="text-[15px] font-bold text-ink">{loadError}</div>}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link href="/website/account" className={keyClass('ink')}>Go to Account &amp; Sign-In</Link>
            {!isLiveBackend() && (
              <a href="/promoter" className={`${textLink} text-[13px]`}>Exit signed-out preview</a>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      <AthleteMeetsSection />

      {/* Heading row */}
      <section aria-labelledby="my-meets-heading">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-2.5">
          <div className="flex flex-col gap-1 min-w-0">
            <Cap as="span">My Meets · Promoting · Signed in as {user.displayName} ({user.email})</Cap>
            <h1 id="my-meets-heading" className="text-[28px] font-bold leading-tight text-ink">My Meets</h1>
            <p className={`${NOTE} max-w-2xl`}>
              Configure divisions, events, weights, listing details, and athlete registrations on your laptop. Use the
              meet-day phone scorer for floor edits and live scoring.
            </p>
            {!isLiveBackend() && (
              <p className={`${NOTE} font-bold max-w-2xl`}>
                Preview: everything on this dashboard lives in this browser tab only, resets on reload, and no entry here
                is real. The live backend connects in a later milestone.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                setCreateOpen((v) => !v);
                setCreateError(null);
              }}
              aria-expanded={createOpen}
              className={keyClass(createOpen ? 'ink' : 'pen')}
            >
              {createOpen ? 'Close' : '+ New Meet'}
            </button>
            {isLiveBackend() && (
              <Link href="/promoter/import" className={keyClass('line')}>Import a past show</Link>
            )}
            {!isLiveBackend() && (
              <a href="/promoter?signedout=1" className={`${textLink} text-[13px]`} title="Dev preview of the signed-out state">
                Preview signed-out
              </a>
            )}
          </div>
        </div>

        {loadError && (
          <div role="alert" className="text-[15px] font-bold text-ink mb-3">{loadError}</div>
        )}
        {notice && (
          <div role="status" className="text-[15px] font-bold text-ink mb-3">{notice}</div>
        )}

        {/* New Meet form */}
        {createOpen && (
          <form onSubmit={handleCreateMeet} className="flex flex-col gap-4 mb-6">
            <div className="zt-block grid-cols-1 md:grid-cols-3">
              <div className={`${CELL} col-span-full py-4 gap-1`}>
                <Cap as="span">New meet</Cap>
                <h2 className="text-[22px] font-bold leading-tight text-ink">Create a new strongman meet</h2>
                <p className={NOTE}>Starts unlisted until you enable the listing on its Listing tab.</p>
              </div>
              <div className={CELL}>
                <label htmlFor="new-meet-name"><Cap as="span">Meet name *</Cap></label>
                <input
                  id="new-meet-name"
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewName(val);
                    if (!slugEdited) {
                      setNewSlug(slugify(val));
                    }
                  }}
                  placeholder="e.g. Pennsylvania Winter Iron 2026"
                  className={INPUT}
                />
              </div>
              <div className={CELL}>
                <label htmlFor="new-meet-date"><Cap as="span">Competition date *</Cap></label>
                <input
                  id="new-meet-date"
                  type="date"
                  required
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className={INPUT}
                />
              </div>
              <div className={CELL}>
                <label htmlFor="new-meet-slug"><Cap as="span">URL slug (optional)</Cap></label>
                <input
                  id="new-meet-slug"
                  type="text"
                  value={slugEdited ? newSlug : newName ? slugify(newName) : ''}
                  onChange={(e) => {
                    setSlugEdited(true);
                    setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-'));
                  }}
                  placeholder="pennsylvania-winter-iron-2026"
                  className={`${INPUT} font-mono`}
                />
              </div>
            </div>

            {createError && (
              <div role="alert" className="text-[15px] font-bold text-ink">{createError}</div>
            )}

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setCreateOpen(false);
                  setCreateError(null);
                }}
                className={`${textLink} text-[13px]`}
              >
                Cancel
              </button>
              <button type="submit" disabled={creating} className={keyClass('pen', 'disabled:opacity-40 disabled:cursor-not-allowed')}>
                {creating ? 'Creating…' : 'Create & Open Meet'}
              </button>
            </div>
          </form>
        )}

        {/* Meets list */}
        {meets.length === 0 ? (
          <div className="zt-block">
            <div className={`${CELL} py-6 gap-1`}>
              <div className="text-[18px] font-bold text-ink">You do not have any meets yet.</div>
              <p className={NOTE}>Use &ldquo;New Meet&rdquo; above to set up your first competition.</p>
            </div>
          </div>
        ) : (
          <div className="zt-block">
            {meets.map((m) => {
              const life = describeShowLifecycle(
                m.listing.competitionStatus,
                m.listing.registrationStatus,
                m.listing.resultsStatus
              );
              const listedLabel = m.listing.isPublicListed
                ? (isLiveBackend() ? 'Listed' : 'Listed (preview)')
                : (isLiveBackend() ? 'Unlisted' : 'Unlisted (preview)');
              return (
                <article
                  key={m.serverId}
                  aria-label={m.name}
                  className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-3 px-4 py-4 sm:px-5"
                >
                  <div className="flex flex-col gap-1 min-w-0">
                    <Cap as="span">
                      {life.competitionLabel} · {listedLabel} · {life.registrationLabel} · {life.resultsLabel}
                    </Cap>
                    <h2 className="text-[20px] font-bold leading-tight text-ink lg:truncate">
                      <Link href={`/promoter/${m.serverId}`} className="hover:text-pen no-underline">{m.name}</Link>
                    </h2>
                    <div className="text-[13px] text-ink-muted flex flex-wrap gap-x-3">
                      <span className="text-ink font-bold">{m.date ? longIsoDate(m.date) : 'Date TBD'}</span>
                      <span className="font-mono">/{m.slug}</span>
                      {m.listing.venue && (
                        <span>
                          {m.listing.venue.facilityName ? `${m.listing.venue.facilityName}, ` : ''}
                          {m.listing.venue.city}, {m.listing.venue.state}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Counts & actions */}
                  <div className="flex flex-wrap items-center justify-between lg:justify-end gap-x-5 gap-y-3">
                    <dl className="grid grid-cols-4 gap-x-4 gap-y-2 sm:flex sm:items-start sm:gap-5 w-full sm:w-auto">
                      <Count label="Divisions" value={m.divisionCount} />
                      <Count label="Athletes" value={m.athleteCount} />
                      <Count label="Accepted" value={m.registrationCount} />
                      <Count label="Pending" value={m.pendingCount} pen={m.pendingCount > 0} />
                    </dl>
                    <div className="flex items-center gap-2">
                      <Link href={`/register/${m.slug}`} className={keyClass('line')}>Reg form</Link>
                      <Link href={`/promoter/${m.serverId}`} className={keyClass('ink')}>Open →</Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

/** One count in a meet row: the sheet numeral over a cap. Pen when the number wants attention (pending entries). */
function Count({ label, value, pen }: { label: string; value: number; pen?: boolean }) {
  return (
    <div className="flex flex-col items-start gap-0.5 min-w-0 sm:min-w-[4.5rem]">
      <dt className="text-xs tracking-[0.06em] uppercase text-ink-muted order-2">{label}</dt>
      <dd className={`font-sheet text-[24px] leading-none order-1 ${pen ? 'text-pen' : 'text-ink'}`}>{value}</dd>
    </div>
  );
}
