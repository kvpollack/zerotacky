'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Calendar,
  Dumbbell,
  ExternalLink,
  Play,
  ShieldAlert,
  Trophy,
  UserCheck,
} from 'lucide-react';
import { describeShowLifecycle } from '@/lib/website/filters';
import type { DemoPersonaProfile, StrongmanGymListing } from '@/lib/website/types';

interface AccountPreviewClientProps {
  personas: DemoPersonaProfile[];
  gyms: StrongmanGymListing[];
}

export default function AccountPreviewClient({ personas, gyms }: AccountPreviewClientProps) {
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>(personas[0]?.id ?? '');
  const [unconnectedActionMsg, setUnconnectedActionMsg] = useState<string | null>(null);

  // Session-only gym preview state (explicitly isolated in React memory; never touches localStorage)
  const [sessionDayPassDraft, setSessionDayPassDraft] = useState<Record<string, string>>({});
  const [sessionSavedNotice, setSessionSavedNotice] = useState<string | null>(null);

  const activePersona =
    personas.find((p) => p.id === selectedPersonaId) ?? personas[0];

  const hasAthlete = activePersona.capabilities.includes('athlete');
  const hasPromoter = activePersona.capabilities.includes('promoter');
  const hasGymOwner = activePersona.capabilities.includes('gym_owner');

  return (
    <div className="space-y-6">
      {/* Explicit Demo Persona Switcher Banner */}
      <section
        aria-labelledby="demo-persona-heading"
        className="bg-zt-surface border-2 border-amber-500/50 rounded-2xl p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-400">
            <ShieldAlert className="w-4 h-4" aria-hidden="true" />
            <span>Account &amp; Dashboard Preview • Demo Persona Switcher</span>
          </div>
          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-zt-inset border border-zt-border text-zt-muted">
            Zero localStorage / Role-Lock Side Effects
          </span>
        </div>

        <div className="space-y-1">
          <h1 id="demo-persona-heading" className="text-xl sm:text-2xl font-black text-zt-text">
            One Account, Overlapping Strongman Capabilities
          </h1>
          <p className="text-xs sm:text-sm text-zt-text-2 leading-relaxed">
            In strongman, the same person is often an athlete, a meet promoter, and a gym owner.
            This preview demonstrates how those capabilities coexist on one profile. Switching
            demo personas below is purely a UI preview—it does not log you in, does not use{' '}
            <code className="font-mono">user_metadata.role</code> for authorization, and never
            modifies your meet-day scorer storage or volunteer phone role lock.
          </p>
        </div>

        {/* Persona Selector Buttons */}
        <div
          role="radiogroup"
          aria-label="Select demo persona"
          className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1"
        >
          {personas.map((p) => {
            const active = p.id === activePersona.id;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  setSelectedPersonaId(p.id);
                  setUnconnectedActionMsg(null);
                  setSessionSavedNotice(null);
                }}
                className={`p-3.5 rounded-xl border text-left transition ${
                  active
                    ? 'bg-zt-primary/15 border-zt-primary text-zt-text ring-1 ring-zt-primary'
                    : 'bg-zt-inset border-zt-border text-zt-text-2 hover:border-zt-border-strong'
                }`}
              >
                <div className="text-xs font-black text-zt-text">{p.label}</div>
                <div className="text-[11px] text-zt-muted mt-1 leading-snug">{p.tagline}</div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {p.capabilities.map((cap) => (
                    <span
                      key={cap}
                      className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-zt-surface border border-zt-border text-zt-primary"
                    >
                      {cap.replace('_', ' ')}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        {unconnectedActionMsg && (
          <div
            role="status"
            className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/50 text-amber-200 text-xs font-bold flex items-start justify-between gap-3"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span>{unconnectedActionMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setUnconnectedActionMsg(null)}
              className="text-[10px] font-black uppercase px-2 py-1 rounded bg-zt-surface text-zt-text"
            >
              Dismiss
            </button>
          </div>
        )}
      </section>

      {/* CAPABILITY 1: ATHLETE VIEW */}
      {hasAthlete && activePersona.athleteData && (
        <section
          aria-labelledby="athlete-cap-heading"
          className="bg-zt-surface border border-zt-border rounded-2xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between gap-2 border-b border-zt-border pb-3">
            <div className="flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-zt-primary" aria-hidden="true" />
              <div>
                <h2 id="athlete-cap-heading" className="text-base font-black uppercase text-zt-text">
                  Athlete Capability • Registrations &amp; Competition History
                </h2>
                <p className="text-xs text-zt-muted">
                  Entries are linked by explicit registration records, never by matching athlete names across meets.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Upcoming / Active Registrations */}
            <div className="space-y-2.5">
              <h3 className="text-xs font-extrabold uppercase text-zt-primary">
                Registered Shows ({activePersona.athleteData.registrations.length})
              </h3>
              {activePersona.athleteData.registrations.map((reg) => (
                <div
                  key={reg.entryId}
                  className="bg-zt-inset border border-zt-border rounded-xl p-3.5 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-zt-primary/20 text-zt-primary-2">
                      {reg.registrationStatus} • {reg.competitionStatus}
                    </span>
                    <span className="text-xs font-bold text-zt-muted">{reg.showDate}</span>
                  </div>
                  <div className="text-sm font-black text-zt-text">
                    <Link href={`/shows/${reg.showSlug}`} className="hover:text-zt-primary">
                      {reg.showName}
                    </Link>
                  </div>
                  <div className="text-xs font-bold text-zt-text-2">
                    Division: {reg.divisionName}
                  </div>

                  {/* Equipment-Specific Rack / Pin Notes */}
                  {reg.equipmentSetupNotes.length > 0 && (
                    <div className="pt-2 border-t border-zt-border space-y-1">
                      <div className="text-[10px] font-extrabold uppercase text-zt-muted">
                        Equipment-Specific Setup Notes (Scoped to This Meet&apos;s Rig)
                      </div>
                      {reg.equipmentSetupNotes.map((note, idx) => (
                        <div
                          key={idx}
                          className="text-[11px] bg-zt-surface border border-zt-border rounded-lg p-2"
                        >
                          <div className="font-bold text-zt-text">{note.showEventLabel}</div>
                          <div className="text-zt-muted">{note.implementContext}</div>
                          <div className="font-black text-zt-primary mt-0.5">
                            Saved Setting: {note.settingValue}
                          </div>
                        </div>
                      ))}
                      <p className="text-[10px] text-zt-muted">
                        Note: Pin numbers are never auto-copied to other meets because hole spacing
                        varies across yokes, monolifts, and logs.
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Past Competition Results */}
            <div className="space-y-2.5">
              <h3 className="text-xs font-extrabold uppercase text-zt-primary">
                Past Competition Entries ({activePersona.athleteData.competitionHistory.length})
              </h3>
              {activePersona.athleteData.competitionHistory.map((hist) => (
                <div
                  key={hist.entryId}
                  className="bg-zt-inset border border-zt-border rounded-xl p-3.5 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-zt-surface-2 text-zt-text-2">
                      Results: {hist.resultsStatus}
                    </span>
                    <span className="text-xs font-bold text-zt-muted">{hist.showDate}</span>
                  </div>
                  <div className="text-sm font-black text-zt-text">
                    <Link href={`/shows/${hist.showSlug}`} className="hover:text-zt-primary">
                      {hist.showName}
                    </Link>
                  </div>
                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="font-bold text-zt-text-2">{hist.divisionName}</span>
                    <span className="font-black text-zt-primary">
                      {hist.overallPlaceDisplay} ({hist.totalPoints} pts)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CAPABILITY 2: PROMOTER VIEW */}
      {hasPromoter && activePersona.promoterData && (
        <section
          aria-labelledby="promoter-cap-heading"
          className="bg-zt-surface border border-zt-border rounded-2xl p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zt-border pb-3">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-zt-primary" aria-hidden="true" />
              <div>
                <h2 id="promoter-cap-heading" className="text-base font-black uppercase text-zt-text">
                  Promoter Capability • Managed Competitions &amp; Scorer Entry Point
                </h2>
                <p className="text-xs text-zt-muted">
                  Promoter access in Phase 2 is enforced via Supabase <code className="font-mono">meets.owner_id</code> and{' '}
                  <code className="font-mono">meet_members</code> RLS. Publish keys and volunteer join codes are never exposed here.
                </p>
              </div>
            </div>

            <Link
              href="/"
              className="px-4 py-2 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase tracking-wider inline-flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" aria-hidden="true" />
              Open Meet-Day Builder &amp; Scorer (/)
            </Link>
          </div>

          <div className="space-y-3">
            {activePersona.promoterData.managedShows.map((item) => {
              const life = describeShowLifecycle(
                item.competitionStatus,
                item.registrationStatus,
                item.resultsStatus
              );
              return (
                <div
                  key={item.meetId}
                  className="bg-zt-inset border border-zt-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-zt-surface-2 text-zt-primary">
                        {life.competitionLabel}
                      </span>
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-zt-surface border border-zt-border text-zt-text-2">
                        {life.resultsLabel}
                      </span>
                    </div>
                    <div className="text-base font-black text-zt-text">{item.name}</div>
                    <div className="text-xs font-bold text-zt-muted">
                      {item.date} • {item.divisionsCount} divisions • {item.athletesCount} athletes
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/shows/${item.slug}`}
                      className="px-3 py-2 rounded-xl bg-zt-surface border border-zt-border-strong text-zt-text font-extrabold text-xs uppercase"
                    >
                      Public Show Page
                    </Link>

                    {item.isPublishedToScoreboard && (
                      <Link
                        href={`/m/${item.slug}`}
                        className="px-3 py-2 rounded-xl bg-zt-surface border border-zt-border-strong text-zt-text-2 font-extrabold text-xs uppercase inline-flex items-center gap-1"
                      >
                        Scoreboard (/m/{item.slug})
                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                      </Link>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        setUnconnectedActionMsg(
                          `Show-specific launch for "${item.name}" is intentionally unconnected in this pass. Opening "/" loads the device's active localStorage meet until the account-to-scorer handoff contract is integrated.`
                        )
                      }
                      className="px-3 py-2 rounded-xl bg-zt-surface-2 border border-amber-500/40 text-amber-300 font-black text-xs uppercase"
                    >
                      Manage This Show (Preview)
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* CAPABILITY 3: GYM OWNER VIEW */}
      {hasGymOwner && activePersona.gymOwnerData && (
        <section
          aria-labelledby="gym-owner-cap-heading"
          className="bg-zt-surface border border-zt-border rounded-2xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between gap-2 border-b border-zt-border pb-3">
            <div className="flex items-center gap-2">
              <Dumbbell className="w-5 h-5 text-zt-secondary" aria-hidden="true" />
              <div>
                <h2 id="gym-owner-cap-heading" className="text-base font-black uppercase text-zt-text">
                  Gym Owner Capability • Equipment &amp; Day-Pass Listing Preview
                </h2>
                <p className="text-xs text-zt-muted">
                  Edits below are session-only preview state and do not persist to a database or touch meet-day storage.
                </p>
              </div>
            </div>
          </div>

          {sessionSavedNotice && (
            <div className="p-3 rounded-xl bg-zt-inset border border-zt-primary text-xs font-bold text-zt-primary-2">
              {sessionSavedNotice}
            </div>
          )}

          <div className="space-y-3">
            {activePersona.gymOwnerData.managedGymSlugs.map((gymSlug) => {
              const gym = gyms.find((g) => g.slug === gymSlug);
              if (!gym) return null;
              const currentPrice =
                sessionDayPassDraft[gym.slug] ?? gym.dayPassPriceDisplay ?? '';

              return (
                <div
                  key={gym.id}
                  className="bg-zt-inset border border-zt-border rounded-xl p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-base font-black text-zt-text">{gym.name}</div>
                      <div className="text-xs font-bold text-zt-muted">
                        {gym.city}, {gym.state} • {gym.implementTags.length} implements listed
                      </div>
                    </div>
                    <Link
                      href={`/gyms/${gym.slug}`}
                      className="px-3 py-1.5 rounded-xl bg-zt-surface border border-zt-border-strong text-zt-text font-extrabold text-xs uppercase"
                    >
                      View Public Gym Page →
                    </Link>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-zt-border">
                    <div>
                      <label
                        htmlFor={`day-pass-price-${gym.slug}`}
                        className="block text-[10px] font-extrabold uppercase text-zt-muted mb-1"
                      >
                        Day-Pass Price Display (Session-Only Preview Edit)
                      </label>
                      <div className="flex gap-2">
                        <input
                          id={`day-pass-price-${gym.slug}`}
                          type="text"
                          value={currentPrice}
                          onChange={(e) =>
                            setSessionDayPassDraft({
                              ...sessionDayPassDraft,
                              [gym.slug]: e.target.value,
                            })
                          }
                          className="flex-1 bg-zt-surface border border-zt-border-strong rounded-lg px-2.5 py-1.5 text-xs font-bold text-zt-text"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setSessionSavedNotice(
                              `Session-only preview updated for ${gym.name} ("${currentPrice}"). Not saved to server.`
                            )
                          }
                          className="px-3 py-1.5 rounded-lg bg-zt-secondary text-zt-on-secondary font-black text-xs uppercase"
                        >
                          Preview Update
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] font-extrabold uppercase text-zt-muted mb-1">
                        Listed Strongman Implements
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {gym.implementTags.map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] font-bold px-2 py-0.5 rounded bg-zt-surface border border-zt-border text-zt-text-2"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}