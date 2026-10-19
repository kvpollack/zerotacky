'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Calendar,
  Eye,
  EyeOff,
  FilePlus2,
  Lock,
  Trophy,
  Users,
} from 'lucide-react';
import { slugify } from '@/lib/meetBuilder';
import { describeShowLifecycle } from '@/lib/website/filters';
import type { PromoterMeetSummary, PromoterUser } from '@/lib/promoter/contract';
import { isLiveBackend, setFixtureSignedOutForDev, usePromoterApi } from '@/lib/promoter/usePromoterApi';

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
      <div className="bg-zt-surface border border-zt-border rounded-2xl p-8 text-center text-sm font-bold text-zt-muted">
        Loading promoter dashboard…
      </div>
    );
  }

  // A failed session lookup is an error, not a signed-out visitor (M11).
  if (!user && loadError) {
    return (
      <div className="max-w-xl mx-auto my-8 bg-zt-surface border-2 border-zt-danger rounded-2xl p-6 sm:p-8 text-center space-y-4 shadow-lg">
        <div className="w-12 h-12 rounded-2xl bg-zt-danger/15 border border-zt-danger text-zt-danger-text mx-auto flex items-center justify-center">
          <AlertTriangle className="w-6 h-6" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-black text-zt-text">Could not check your session</h1>
        <p role="alert" className="text-xs sm:text-sm font-bold text-zt-danger-text">{loadError}</p>
        <button
          type="button"
          onClick={() => refresh()}
          className="px-5 py-3 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase tracking-wider shadow"
        >
          Try again
        </button>
      </div>
    );
  }

  // Signed-out state (getCurrentUser() returns null)
  if (!user) {
    return (
      <div className="max-w-xl mx-auto my-8 bg-zt-surface border-2 border-zt-border rounded-2xl p-6 sm:p-8 text-center space-y-4 shadow-lg">
        <div className="w-12 h-12 rounded-2xl bg-zt-primary/15 border border-zt-primary/40 text-zt-primary mx-auto flex items-center justify-center">
          <Lock className="w-6 h-6" aria-hidden="true" />
        </div>
        <div className="space-y-1.5">
          <div className="text-[10px] font-black uppercase tracking-widest text-zt-primary">
            Promoter Dashboard
          </div>
          <h1 className="text-2xl font-black text-zt-text">Sign-in is required</h1>
          <p className="text-xs sm:text-sm text-zt-text-2 leading-relaxed">
            You must be signed in to create meets, configure divisions and event weights, manage
            public directory listings, or review athlete registrations.
          </p>
        </div>

        {loadError && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-zt-danger/15 border border-zt-danger text-zt-danger-text text-xs font-bold"
          >
            {loadError}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href="/website/account"
            className="px-5 py-3 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase tracking-wider shadow"
          >
            Go to Account &amp; Sign-In
          </Link>
          {!isLiveBackend() && (
            <a
              href="/promoter"
              className="px-4 py-3 rounded-xl bg-zt-inset border border-zt-border text-zt-text-2 font-bold text-xs uppercase hover:text-zt-text"
            >
              Exit Signed-Out Preview
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <section className="bg-zt-surface border border-zt-border rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-zt-primary flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5" aria-hidden="true" />
              Promoter Dashboard
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-zt-inset border border-zt-border text-zt-text-2">
              Signed in as {user.displayName} ({user.email})
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-zt-text">My Meets</h1>
          <p className="text-xs sm:text-sm text-zt-text-2 max-w-2xl">
            Configure divisions, events, weights, listing details, and athlete registrations on your laptop. Use the
            meet-day phone scorer for floor edits and live scoring.
          </p>
          {!isLiveBackend() && (
            <p className="text-[11px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/40 rounded-xl px-3 py-2 max-w-2xl">
              Preview: everything on this dashboard lives in this browser tab only, resets on reload, and no entry here
              is real. The live backend connects in a later milestone.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
          <button
            type="button"
            onClick={() => {
              setCreateOpen((v) => !v);
              setCreateError(null);
            }}
            className="px-4 py-3 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase tracking-wider inline-flex items-center gap-2 shadow active:scale-95 transition"
          >
            <FilePlus2 className="w-4 h-4" aria-hidden="true" />
            New Meet
          </button>
          {!isLiveBackend() && (
            <a
              href="/promoter?signedout=1"
              className="px-3 py-3 rounded-xl bg-zt-inset border border-zt-border text-zt-muted hover:text-zt-text font-bold text-[11px] uppercase"
              title="Dev preview of the signed-out state"
            >
              Preview Signed-Out
            </a>
          )}
        </div>
      </section>

      {loadError && (
        <div
          role="alert"
          className="p-4 rounded-2xl bg-zt-danger/15 border border-zt-danger text-zt-danger-text text-xs font-bold flex items-center gap-2.5"
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          <span>{loadError}</span>
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/40 text-amber-200 text-xs font-bold flex items-center gap-2.5"
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          <span>{notice}</span>
        </div>
      )}

      {/* New Meet Drawer */}
      {createOpen && (
        <form
          onSubmit={handleCreateMeet}
          className="bg-zt-surface border-2 border-zt-primary rounded-2xl p-5 space-y-4 shadow-xl"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-black uppercase tracking-wider text-zt-primary">
              Create a New Strongman Meet
            </h2>
            <span className="text-[11px] font-bold text-zt-muted">
              Starts unlisted until you enable the listing on its Listing tab
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="new-meet-name"
                className="block text-[11px] font-extrabold uppercase text-zt-muted mb-1"
              >
                Meet Name *
              </label>
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
                className="w-full bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-xs sm:text-sm font-bold text-zt-text"
              />
            </div>

            <div>
              <label
                htmlFor="new-meet-date"
                className="block text-[11px] font-extrabold uppercase text-zt-muted mb-1"
              >
                Competition Date *
              </label>
              <input
                id="new-meet-date"
                type="date"
                required
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-full bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-xs sm:text-sm font-bold text-zt-text"
              />
            </div>

            <div>
              <label
                htmlFor="new-meet-slug"
                className="block text-[11px] font-extrabold uppercase text-zt-muted mb-1"
              >
                URL Slug (Optional)
              </label>
              <input
                id="new-meet-slug"
                type="text"
                value={slugEdited ? newSlug : newName ? slugify(newName) : ''}
                onChange={(e) => {
                  setSlugEdited(true);
                  setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-'));
                }}
                placeholder="pennsylvania-winter-iron-2026"
                className="w-full bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-xs sm:text-sm font-mono font-bold text-zt-text"
              />
            </div>
          </div>

          {createError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-zt-danger/15 border border-zt-danger text-zt-danger-text text-xs font-bold flex items-center gap-2"
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              <span>{createError}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setCreateOpen(false);
                setCreateError(null);
              }}
              className="px-4 py-2.5 rounded-xl bg-zt-surface-2 text-zt-text-2 font-bold text-xs uppercase"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-5 py-2.5 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase tracking-wider disabled:opacity-40"
            >
              {creating ? 'Creating…' : 'Create & Open Meet'}
            </button>
          </div>
        </form>
      )}

      {/* Meets List */}
      {meets.length === 0 ? (
        <div className="bg-zt-surface border border-zt-border rounded-2xl p-8 text-center space-y-3">
          <div className="text-base font-black text-zt-text">You do not have any meets yet.</div>
          <p className="text-xs text-zt-muted">
            Click &ldquo;New Meet&rdquo; above to set up your first competition.
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {meets.map((m) => {
            const life = describeShowLifecycle(
              m.listing.competitionStatus,
              m.listing.registrationStatus,
              m.listing.resultsStatus
            );
            return (
              <article
                key={m.serverId}
                className="bg-zt-surface border border-zt-border hover:border-zt-border-strong rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition"
              >
                <div className="space-y-2 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded ${
                        m.listing.competitionStatus === 'live'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : m.listing.competitionStatus === 'upcoming'
                          ? 'bg-zt-primary/20 text-zt-primary-2 border border-zt-primary/40'
                          : m.listing.competitionStatus === 'completed'
                          ? 'bg-zt-surface-2 text-zt-text border border-zt-border-strong'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      }`}
                    >
                      {life.competitionLabel}
                    </span>

                    <span
                      className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded inline-flex items-center gap-1 border ${
                        m.listing.isPublicListed
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                          : 'bg-zt-inset text-zt-muted border-zt-border'
                      }`}
                    >
                      {m.listing.isPublicListed ? (
                        <>
                          <Eye className="w-3 h-3" aria-hidden="true" />
                          {isLiveBackend() ? 'Listed' : 'Listed (preview)'}
                        </>
                      ) : (
                        <>
                          <EyeOff className="w-3 h-3" aria-hidden="true" />
                          {isLiveBackend() ? 'Unlisted' : 'Unlisted (preview)'}
                        </>
                      )}
                    </span>

                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-zt-inset border border-zt-border text-zt-text-2">
                      {life.registrationLabel}
                    </span>

                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-zt-inset border border-zt-border text-zt-muted">
                      {life.resultsLabel}
                    </span>
                  </div>

                  <div>
                    <h2 className="text-lg sm:text-xl font-black text-zt-text truncate">
                      <Link href={`/promoter/${m.serverId}`} className="hover:text-zt-primary">
                        {m.name}
                      </Link>
                    </h2>
                    <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-zt-muted mt-0.5">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-zt-primary" aria-hidden="true" />
                        {m.date || 'Date TBD'}
                      </span>
                      <span className="font-mono text-[11px] text-zt-text-2">/{m.slug}</span>
                      {m.listing.venue && (
                        <span>
                          • {m.listing.venue.facilityName ? `${m.listing.venue.facilityName}, ` : ''}
                          {m.listing.venue.city}, {m.listing.venue.state}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Counts & Actions */}
                <div className="flex flex-wrap items-center justify-between lg:justify-end gap-3 pt-3 lg:pt-0 border-t lg:border-t-0 border-zt-border flex-shrink-0">
                  <div className="flex items-center gap-3 text-xs">
                    <div className="bg-zt-inset border border-zt-border rounded-xl px-3 py-2 text-center">
                      <div className="text-sm font-black text-zt-text">{m.divisionCount}</div>
                      <div className="text-[10px] font-extrabold uppercase text-zt-muted">
                        Divisions
                      </div>
                    </div>
                    <div className="bg-zt-inset border border-zt-border rounded-xl px-3 py-2 text-center">
                      <div className="text-sm font-black text-zt-text">{m.athleteCount}</div>
                      <div className="text-[10px] font-extrabold uppercase text-zt-muted">
                        Athletes
                      </div>
                    </div>
                    <div className="bg-zt-inset border border-zt-border rounded-xl px-3 py-2 text-center">
                      <div className="text-sm font-black text-zt-primary flex items-center justify-center gap-1">
                        <Users className="w-3.5 h-3.5" aria-hidden="true" />
                        {m.registrationCount}
                      </div>
                      <div className="text-[10px] font-extrabold uppercase text-zt-muted">
                        Accepted
                      </div>
                    </div>
                    <div className="bg-zt-inset border border-zt-border rounded-xl px-3 py-2 text-center">
                      <div className={`text-sm font-black ${m.pendingCount > 0 ? 'text-amber-300' : 'text-zt-text'}`}>
                        {m.pendingCount}
                      </div>
                      <div className="text-[10px] font-extrabold uppercase text-zt-muted">
                        Pending
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/register/${m.slug}`}
                      className="px-3 py-2.5 rounded-xl bg-zt-inset border border-zt-border-strong text-zt-text-2 hover:text-zt-text font-extrabold text-xs uppercase"
                    >
                      Reg Form
                    </Link>
                    <Link
                      href={`/promoter/${m.serverId}`}
                      className="px-5 py-2.5 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase tracking-wider shadow"
                    >
                      Open →
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
