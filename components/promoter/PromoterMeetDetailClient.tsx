'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  RotateCcw,
  Save,
  ShieldAlert,
} from 'lucide-react';
import MeetSection from '@/components/setup/builder/MeetSection';
import DivisionsSection from '@/components/setup/builder/DivisionsSection';
import StationsSection from '@/components/setup/builder/StationsSection';
import EventsSection from '@/components/setup/builder/EventsSection';
import AthletesSection from '@/components/setup/builder/AthletesSection';
import {
  addAthlete as mbAddAthlete,
  addDivision as mbAddDivision,
  addEvent as mbAddEvent,
  addStation as mbAddStation,
  bulkAddAthletes as mbBulkAddAthletes,
  moveAthlete as mbMoveAthlete,
  removeAthlete as mbRemoveAthlete,
  removeDivision as mbRemoveDivision,
  removeEvent as mbRemoveEvent,
  removeStation as mbRemoveStation,
  reorderDivisions as mbReorderDivisions,
  reorderEvents as mbReorderEvents,
  shuffleLots as mbShuffleLots,
  updateAthlete as mbUpdateAthlete,
  updateDivision as mbUpdateDivision,
  updateEvent as mbUpdateEvent,
  updateStation as mbUpdateStation,
  validateMeet,
} from '@/lib/meetBuilder';
import { describeShowLifecycle } from '@/lib/website/filters';
import type {
  AthleteAccountLink,
  MeetListing,
  PromoterMeetDetail,
  PromoterUser,
  RegistrationRequest,
} from '@/lib/promoter/contract';
import { isMeetStateDirty } from '@/lib/promoter/rules';
import { isLiveBackend, usePromoterApi } from '@/lib/promoter/usePromoterApi';
import type { AppState, Athlete, Division, EventDef, Meet } from '@/lib/types';
import ListingSection from './ListingSection';
import RegistrationsSection from './RegistrationsSection';
import AthleteAccountsSection from './AthleteAccountsSection';
import MeetDaySection from './MeetDaySection';

type SectionId =
  | 'meet'
  | 'divisions'
  | 'stations'
  | 'events'
  | 'athletes'
  | 'listing'
  | 'registrations'
  | 'meetday';

interface PromoterMeetDetailClientProps {
  serverId: string;
}

export default function PromoterMeetDetailClient({ serverId }: PromoterMeetDetailClientProps) {
  const api = usePromoterApi();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<PromoterUser | null>(null);
  const [detail, setDetail] = useState<PromoterMeetDetail | null>(null);
  const [workingState, setWorkingState] = useState<AppState | null>(null);
  const [registrations, setRegistrations] = useState<RegistrationRequest[]>([]);
  const [activeTab, setActiveTab] = useState<SectionId>('meet');

  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [savingState, setSavingState] = useState(false);
  // The Listing tab keeps its own draft (saved through updateListing, not saveMeetState); it reports dirtiness up
  // so the sticky bar can mention it.
  const [listingDirty, setListingDirty] = useState(false);
  // Astra M2: an open EventForm holds a draft that reaches workingState only through its own Save button, so the
  // global dirty bar and the registration guard treat it like unsaved work.
  const [eventFormOpen, setEventFormOpen] = useState(false);
  // 10/26 (Kurt 10/21): while that form is open, the tabs refuse to leave Events. A refused click flashes the bar
  // and moves focus to it; the bar's Discard draft closes the form (closeFormSignal) so the promoter can move on.
  const [navBlockedAt, setNavBlockedAt] = useState(0);
  const [closeFormSignal, setCloseFormSignal] = useState(0);
  const dirtyBarRef = useRef<HTMLDivElement | null>(null);
  const requestTab = useCallback((id: SectionId) => {
    if (eventFormOpen && id !== 'events') {
      setNavBlockedAt(Date.now());
      dirtyBarRef.current?.focus();
      return false;
    }
    setActiveTab(id);
    return true;
  }, [eventFormOpen]);
  useEffect(() => {
    if (!navBlockedAt) return;
    const t = setTimeout(() => setNavBlockedAt(0), 2500);
    return () => clearTimeout(t);
  }, [navBlockedAt]);
  useEffect(() => { if (!eventFormOpen) setNavBlockedAt(0); }, [eventFormOpen]);
  const [athleteLinks, setAthleteLinks] = useState<AthleteAccountLink[]>([]);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    const userRes = await api.getCurrentUser();
    if (userRes.error) {
      setLoadError(userRes.error);
      setLoading(false);
      return;
    }
    setUser(userRes.data);
    if (!userRes.data) {
      setLoading(false);
      return;
    }

    const [meetRes, regsRes, linksRes] = await Promise.all([
      api.getMeet(serverId),
      api.listRegistrations(serverId),
      api.listAthleteAccounts(serverId),
    ]);

    if (meetRes.error || !meetRes.data) {
      setLoadError(meetRes.error ?? `Meet "${serverId}" could not be loaded.`);
      setLoading(false);
      return;
    }
    // 023: linked accounts are a side panel; a failure there must not block the meet.
    setAthleteLinks(linksRes.data ?? []);

    setDetail(meetRes.data);
    setWorkingState(JSON.parse(JSON.stringify(meetRes.data.state)));
    if (regsRes.error || !regsRes.data) {
      setLoadError(regsRes.error ?? 'Registrations could not be loaded.');
      setLoading(false);
      return;
    }
    setRegistrations(regsRes.data);
    setLoading(false);
  }, [api, serverId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (detail?.summary.name) document.title = `${detail.summary.name} — Manage Meet | ZeroTacky`;
  }, [detail?.summary.name]);

  const isDirty = useMemo(() => {
    if (!detail || !workingState) return false;
    return isMeetStateDirty(detail.state, workingState);
  }, [detail, workingState]);

  const readiness = useMemo(() => {
    if (!workingState) return { ok: true, problems: [] };
    return validateMeet(workingState);
  }, [workingState]);

  // Pure AppState mutators matching MeetSetup.jsx / useMeetState.js
  const updateMeetConfig = (patch: Partial<Meet>) => {
    setWorkingState((prev) => (prev ? { ...prev, meet: { ...prev.meet, ...patch } } : prev));
  };

  const toggleGymPlate = (plateWeight: number) => {
    setWorkingState((prev) => {
      if (!prev) return prev;
      const exists = prev.meet.availablePlates.includes(plateWeight);
      const nextPlates = exists
        ? prev.meet.availablePlates.filter((p) => p !== plateWeight)
        : [...prev.meet.availablePlates, plateWeight].sort((a, b) => b - a);
      return { ...prev, meet: { ...prev.meet, availablePlates: nextPlates } };
    });
  };

  const addStation = (input?: { id?: string; label?: string }) =>
    setWorkingState((prev) => (prev ? mbAddStation(prev, input) : prev));
  const updateStation = (stationId: string, patch: { label?: string; eventOrder?: string[] | null }) =>
    setWorkingState((prev) => (prev ? mbUpdateStation(prev, stationId, patch) : prev));
  const removeStation = (stationId: string) =>
    setWorkingState((prev) => (prev ? mbRemoveStation(prev, stationId) : prev));

  const addDivision = (input: { id?: string; name: string; flight?: string }) =>
    setWorkingState((prev) => (prev ? mbAddDivision(prev, input) : prev));
  const updateDivision = (
    divisionId: string,
    patch: Partial<Pick<Division, 'name' | 'flight' | 'sortOrder'>>
  ) => setWorkingState((prev) => (prev ? mbUpdateDivision(prev, divisionId, patch) : prev));
  const removeDivision = (divisionId: string) =>
    setWorkingState((prev) => (prev ? mbRemoveDivision(prev, divisionId) : prev));
  const reorderDivisions = (orderedIds: string[]) =>
    setWorkingState((prev) => (prev ? mbReorderDivisions(prev, orderedIds) : prev));

  const addEvent = (input: Partial<EventDef> & { name: string }) =>
    setWorkingState((prev) => (prev ? mbAddEvent(prev, input) : prev));
  const updateEvent = (eventId: string, patch: Partial<EventDef>) =>
    setWorkingState((prev) => (prev ? mbUpdateEvent(prev, eventId, patch) : prev));
  const removeEvent = (eventId: string) =>
    setWorkingState((prev) => (prev ? mbRemoveEvent(prev, eventId) : prev));
  const reorderEvents = (orderedIds: string[]) =>
    setWorkingState((prev) => (prev ? mbReorderEvents(prev, orderedIds) : prev));

  const addAthlete = (input: { divisionId: string; name: string }) =>
    setWorkingState((prev) => (prev ? mbAddAthlete(prev, input) : prev));
  const bulkAddAthletes = (divisionId: string, namesText: string) =>
    setWorkingState((prev) => (prev ? mbBulkAddAthletes(prev, divisionId, namesText) : prev));
  const updateAthlete = (athleteId: string, patch: Partial<Omit<Athlete, 'id'>>) =>
    setWorkingState((prev) => (prev ? mbUpdateAthlete(prev, athleteId, patch) : prev));
  const removeAthlete = (athleteId: string) =>
    setWorkingState((prev) => (prev ? mbRemoveAthlete(prev, athleteId) : prev));
  const moveAthlete = (athleteId: string, toDivisionId: string) =>
    setWorkingState((prev) => (prev ? mbMoveAthlete(prev, athleteId, toDivisionId) : prev));
  const shuffleLots = (divisionId: string) =>
    setWorkingState((prev) => (prev ? mbShuffleLots(prev, divisionId) : prev));

  const toggleAthleteWithdrawn = (athlete: Athlete) => {
    const nextStatus = athlete.status === 'active' ? 'withdrawn' : 'active';
    setWorkingState((prev) =>
      prev
        ? {
            ...prev,
            athletes: prev.athletes.map((a) =>
              a.id === athlete.id ? { ...a, status: nextStatus } : a
            ),
          }
        : prev
    );
  };

  const handleSaveMeetState = async () => {
    if (!workingState) return;
    setSavingState(true);
    setSaveError(null);
    setSaveNotice(null);

    // C3: the save names the revision this editor loaded; the API refuses if someone saved in between.
    const res = await api.saveMeetState(serverId, workingState, { expectedUpdatedAt: detail?.summary.updatedAt });
    setSavingState(false);

    if (res.error || !res.data) {
      setSaveError(res.error ?? 'Failed to save meet configuration.');
      // C2: the write landed and only the refresh failed. Reload so the editor shows the saved version instead of
      // offering a retry that the revision check would refuse.
      if (res.committed) await loadAll();
      return;
    }

    setDetail(res.data);
    setWorkingState(JSON.parse(JSON.stringify(res.data.state)));
    setSaveNotice('Meet configuration saved.');
    setTimeout(() => setSaveNotice(null), 4000);
  };

  const handleDiscardChanges = () => {
    if (!detail) return;
    setWorkingState(JSON.parse(JSON.stringify(detail.state)));
    setSaveError(null);
  };

  const handleSaveListing = async (patch: Partial<MeetListing>) => {
    // C3: the Listing tab names the revision it loaded, like the builder save does.
    const res = await api.updateListing(serverId, patch, { expectedUpdatedAt: detail?.summary.updatedAt });
    if (!res.error && res.data) {
      setDetail((prev) => (prev ? { ...prev, summary: res.data! } : prev));
    } else if (res.committed) {
      await loadAll();
    }
    return { error: res.error };
  };

  const registrationsBlockedReason = isDirty
    ? 'Save or discard your changes first. Accepting or declining reloads the roster and would overwrite unsaved edits.'
    : eventFormOpen
      ? 'An event form is open on the Events tab. Save or cancel it first; accepting or declining reloads the meet and would drop that draft.'
      : null;

  // 023: links need the saved roster ids, so the row list comes from `detail.state`, and a dirty draft blocks it.
  const handleLinkAthleteAccount = async (athleteId: string, username: string | null): Promise<{ error?: string }> => {
    if (isDirty) {
      return { error: 'Save or discard your roster changes first, then link accounts to the saved athletes.' };
    }
    const res = await api.linkAthleteAccount(serverId, athleteId, username);
    if (res.error) return { error: res.error };
    const refreshed = await api.listAthleteAccounts(serverId);
    if (refreshed.data) setAthleteLinks(refreshed.data);
    else setAthleteLinks((prev) => (res.data ? [...prev.filter((l) => l.athleteId !== athleteId), res.data] : prev.filter((l) => l.athleteId !== athleteId)));
    return {};
  };

  const handleSetRegistrationStatus = async (
    regId: string,
    status: RegistrationRequest['status']
  ) => {
    // M1: never replace a dirty working draft. The Registrations tab disables its buttons while dirty, this is the
    // backstop.
    if (registrationsBlockedReason) {
      return { error: registrationsBlockedReason };
    }
    const res = await api.setRegistrationStatus(regId, status);
    if (res.error) {
      return { error: res.error };
    }

    // Re-fetch meet and registrations so the roster row appears or disappears immediately. The working draft is
    // clean here (checked above), so replacing it loses nothing.
    const [meetRes, regsRes] = await Promise.all([
      api.getMeet(serverId),
      api.listRegistrations(serverId),
    ]);
    const problems: string[] = [];
    if (meetRes.error || !meetRes.data) {
      problems.push(`roster refresh failed: ${meetRes.error ?? 'no data'}`);
    } else {
      setDetail(meetRes.data);
      setWorkingState(JSON.parse(JSON.stringify(meetRes.data.state)));
    }
    if (regsRes.error || !regsRes.data) {
      problems.push(`registrations refresh failed: ${regsRes.error ?? 'no data'}`);
    } else {
      setRegistrations(regsRes.data);
    }
    if (problems.length > 0) {
      return { error: `Status changed to ${status}, but the page could not refresh (${problems.join('; ')}). Reload to see the current state.` };
    }
    return { error: null };
  };

  const handleDeleteMeet = async (confirmName: string | null) => {
    const res = await api.deleteMeet(serverId, confirmName ? { confirmName } : undefined);
    if (res.error || !res.data) {
      return { error: res.error ?? 'Could not delete the meet.', deleted: null };
    }
    router.push('/promoter');
    return { error: null, deleted: res.data };
  };

  const handleRotateJoinCode = async () => {
    const res = await api.rotateJoinCode(serverId);
    if (res.error || !res.data) {
      return { error: res.error ?? 'Could not rotate join code.', joinCode: null };
    }
    setDetail((prev) =>
      prev
        ? {
            ...prev,
            summary: { ...prev.summary, joinCode: res.data!.joinCode },
          }
        : prev
    );
    return { error: null, joinCode: res.data.joinCode };
  };

  if (loading) {
    return (
      <div className="bg-zt-surface border border-zt-border rounded-2xl p-8 text-center text-sm font-bold text-zt-muted">
        Loading meet workspace…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="bg-zt-surface border border-zt-border rounded-2xl p-6 space-y-4">
        <div
          role="alert"
          className="p-4 rounded-xl bg-zt-danger/15 border border-zt-danger text-zt-danger-text text-xs font-bold flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          <span>{loadError}</span>
        </div>
        <Link
          href="/promoter"
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          Back to My Meets
        </Link>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-xl mx-auto my-8 bg-zt-surface border-2 border-zt-border rounded-2xl p-6 text-center space-y-4">
        <Lock className="w-8 h-8 text-zt-primary mx-auto" aria-hidden="true" />
        <h1 className="text-xl font-black text-zt-text">Sign-in is required</h1>
        <p className="text-xs text-zt-text-2">
          Sign in on your <Link href="/website/account" className="text-zt-primary font-bold underline">account page</Link> to manage this meet.
        </p>
        <Link
          href="/website/account"
          className="inline-block px-5 py-2.5 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase"
        >
          Go to Account
        </Link>
      </div>
    );
  }

  if (!detail || !workingState) {
    return (
      <div className="bg-zt-surface border border-zt-border rounded-2xl p-6 space-y-4">
        <div
          role="alert"
          className="p-4 rounded-xl bg-zt-danger/15 border border-zt-danger text-zt-danger-text text-xs font-bold flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          <span>Meet not found.</span>
        </div>
        <Link
          href="/promoter"
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          Back to My Meets
        </Link>
      </div>
    );
  }

  const { summary } = detail;
  const life = describeShowLifecycle(
    summary.listing.competitionStatus,
    summary.listing.registrationStatus,
    summary.listing.resultsStatus
  );
  const pendingRegCount = registrations.filter((r) => r.status === 'pending').length;

  const tabs: Array<{ id: SectionId; number: number; label: string; badge?: string | number }> = [
    // Build order (Kurt 10/21, shipped 10/26): divisions before events (weights are per division), events before
    // stations (each station orders the events), listing before registrations (entries open from Listing), and
    // registrations before athletes (accepted entries land on the roster). Meet Day last.
    { id: 'meet', number: 1, label: 'Meet' },
    { id: 'divisions', number: 2, label: 'Divisions', badge: workingState.divisions.length },
    { id: 'events', number: 3, label: 'Events', badge: workingState.events.length },
    { id: 'stations', number: 4, label: 'Stations', badge: (workingState.meet.stations ?? []).length || undefined },
    { id: 'listing', number: 5, label: 'Listing' },
    {
      id: 'registrations',
      number: 6,
      label: 'Registrations',
      badge: pendingRegCount > 0 ? `${pendingRegCount} pending` : registrations.length,
    },
    { id: 'athletes', number: 7, label: 'Athletes', badge: workingState.athletes.length },
    { id: 'meetday', number: 8, label: 'Meet Day' },
  ];

  const onTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = tabs.length - 1;
    if (next === null) return;
    e.preventDefault();
    if (requestTab(tabs[next].id)) tabRefs.current[next]?.focus();
  };

  return (
    <div className="space-y-5 pb-20">
      {/* Top Breadcrumb & Meet Summary Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/promoter"
          className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase text-zt-muted hover:text-zt-text"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          Back to My Meets
        </Link>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Link
            href={`/register/${summary.slug}`}
            className="px-3 py-1.5 rounded-xl bg-zt-inset border border-zt-border-strong text-zt-text-2 hover:text-zt-text font-extrabold uppercase"
          >
            Public Registration Page
          </Link>
        </div>
      </div>

      <section className="bg-zt-surface border border-zt-border rounded-2xl p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded bg-zt-primary/20 text-zt-primary-2 border border-zt-primary/40">
              {life.competitionLabel}
            </span>
            <span
              className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded inline-flex items-center gap-1 border ${
                summary.listing.isPublicListed
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                  : 'bg-amber-500/15 text-amber-300 border-amber-500/40'
              }`}
            >
              {summary.listing.isPublicListed ? (
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
              {life.resultsLabel} ({workingState.results.length} locked/recorded scores — read-only here)
            </span>
          </div>

          <span className="text-[11px] font-mono text-zt-muted">ID: {summary.serverId}</span>
        </div>

        {!isLiveBackend() && (
          <p className="text-[11px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/40 rounded-xl px-3 py-2">
            Preview: this meet&apos;s data lives in this browser tab only, resets on reload, and nothing here is a real
            entry or a live meet. The live backend connects in a later milestone.
          </p>
        )}

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-zt-text">
              {workingState.meet.name}
            </h1>
            <div className="text-xs font-bold text-zt-muted mt-0.5">
              {workingState.meet.date || 'Date TBD'} • Slug:{' '}
              <code className="font-mono text-zt-text-2">/{workingState.meet.slug}</code> •{' '}
              {workingState.divisions.length} divisions • {workingState.events.length} events •{' '}
              {workingState.athletes.length} roster athletes
            </div>
          </div>

          {/* Live Readiness Badge */}
          <div className="flex items-center gap-2">
            {readiness.ok ? (
              <span className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-black inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                Meet Ready to Run
              </span>
            ) : (
              <span
                title={readiness.problems.join(' • ')}
                className="px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-black inline-flex items-center gap-1.5"
              >
                <ShieldAlert className="w-4 h-4" aria-hidden="true" />
                {readiness.problems.length} Setup Check{readiness.problems.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </div>

        {/* Ordered 7-Tab Bar */}
        <div
          role="tablist"
          aria-label="Meet editor sections"
          className="flex items-center gap-1.5 overflow-x-auto pt-3 border-t border-zt-border"
        >
          {tabs.map((tab, index) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  tabRefs.current[index] = el;
                }}
                type="button"
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={active}
                aria-controls={`panel-${tab.id}`}
                tabIndex={active ? 0 : -1}
                onKeyDown={(e) => onTabKeyDown(e, index)}
                onClick={() => requestTab(tab.id)}
                aria-disabled={eventFormOpen && tab.id !== 'events' ? true : undefined}
                className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wide whitespace-nowrap border transition flex items-center gap-1.5 ${
                  active
                    ? 'bg-zt-primary text-zt-on-primary border-zt-primary shadow'
                    : eventFormOpen && tab.id !== 'events'
                      ? 'bg-zt-inset text-zt-muted border-zt-border opacity-60 cursor-not-allowed'
                      : 'bg-zt-inset text-zt-text-2 border-zt-border hover:border-zt-border-strong'
                }`}
              >
                <span>
                  {tab.number}. {tab.label}
                </span>
                {tab.badge !== undefined && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-extrabold ${
                      active
                        ? 'bg-black/25 text-white'
                        : 'bg-zt-surface text-zt-primary border border-zt-border'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Save Error / Notice Banner */}
      {saveError && (
        <div
          role="alert"
          className="p-4 rounded-2xl bg-zt-danger/15 border border-zt-danger text-zt-danger-text text-xs font-bold flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          <span>{saveError}</span>
        </div>
      )}

      {saveNotice && (
        <div
          role="status"
          className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          <span>{saveNotice}</span>
        </div>
      )}

      {/* Active Section Content. Every section stays mounted so in-progress drafts (Listing fields, EventForm)
          survive tab switches; inactive panels are hidden with the HTML hidden attribute (M2). */}
      <div>
        <div role="tabpanel" id="panel-meet" aria-labelledby="tab-meet" hidden={activeTab !== 'meet'}>
          <MeetSection
            meet={workingState.meet}
            updateMeetConfig={updateMeetConfig}
            toggleGymPlate={toggleGymPlate}
            allowDemoToggle={false}
          />
        </div>

        <div role="tabpanel" id="panel-stations" aria-labelledby="tab-stations" hidden={activeTab !== 'stations'}>
          <StationsSection
            meet={workingState.meet}
            divisions={workingState.divisions}
            athletes={workingState.athletes}
            events={workingState.events}
            addStation={addStation}
            updateStation={updateStation}
            removeStation={removeStation}
            updateDivision={updateDivision}
            sectionNumber={4}
          />
        </div>

        <div role="tabpanel" id="panel-divisions" aria-labelledby="tab-divisions" hidden={activeTab !== 'divisions'}>
          <DivisionsSection
            meet={workingState.meet}
            divisions={workingState.divisions}
            athletes={workingState.athletes}
            results={workingState.results}
            addDivision={addDivision}
            updateDivision={updateDivision}
            removeDivision={removeDivision}
            reorderDivisions={reorderDivisions}
          />
        </div>

        <div role="tabpanel" id="panel-events" aria-labelledby="tab-events" hidden={activeTab !== 'events'}>
          <EventsSection
            divisions={workingState.divisions}
            events={workingState.events}
            results={workingState.results}
            addEvent={addEvent}
            updateEvent={updateEvent}
            removeEvent={removeEvent}
            reorderEvents={reorderEvents}
            onEditingChange={setEventFormOpen}
            closeFormSignal={closeFormSignal}
            defaultCollarWeightPerPair={workingState.meet.collarWeightPerPair}
            sectionNumber={3}
          />
        </div>

        <div role="tabpanel" id="panel-athletes" aria-labelledby="tab-athletes" hidden={activeTab !== 'athletes'}>
          <AthletesSection
            divisions={workingState.divisions}
            athletes={workingState.athletes}
            results={workingState.results}
            addAthlete={addAthlete}
            bulkAddAthletes={bulkAddAthletes}
            updateAthlete={updateAthlete}
            removeAthlete={removeAthlete}
            moveAthlete={moveAthlete}
            shuffleLots={shuffleLots}
            toggleAthleteWithdrawn={toggleAthleteWithdrawn}
            sectionNumber={7}
          />
          <AthleteAccountsSection
            athletes={detail.state.athletes}
            divisions={detail.state.divisions}
            links={athleteLinks}
            onLink={handleLinkAthleteAccount}
            blockedReason={isDirty ? 'Save or discard your roster changes first, then link accounts to the saved athletes.' : null}
          />
        </div>

        <div role="tabpanel" id="panel-listing" aria-labelledby="tab-listing" hidden={activeTab !== 'listing'}>
          <ListingSection
            meetDate={workingState.meet.date}
            listing={summary.listing}
            onSaveListing={handleSaveListing}
            onDirtyChange={setListingDirty}
          />
        </div>

        <div role="tabpanel" id="panel-registrations" aria-labelledby="tab-registrations" hidden={activeTab !== 'registrations'}>
          <RegistrationsSection
            registrations={registrations}
            divisions={workingState.divisions}
            athletes={workingState.athletes}
            meetDate={workingState.meet.date}
            onSetStatus={handleSetRegistrationStatus}
            blockedReason={registrationsBlockedReason}
          />
        </div>

        <div role="tabpanel" id="panel-meetday" aria-labelledby="tab-meetday" hidden={activeTab !== 'meetday'}>
          <MeetDaySection
            summary={summary}
            resultCount={workingState.results.length}
            onRotateCode={handleRotateJoinCode}
            onDelete={handleDeleteMeet}
          />
        </div>
      </div>

      {/* Sticky Dirty-State Save Bar: builder sections (Meet, Divisions, Events, Stations, Athletes) save here; Listing saves on its own tab. */}
      {(isDirty || listingDirty || eventFormOpen) && (
        <div
          ref={dirtyBarRef}
          tabIndex={-1}
          role="region"
          aria-label="Unsaved meet changes"
          aria-live={navBlockedAt ? 'assertive' : undefined}
          className={`fixed bottom-4 inset-x-4 max-w-5xl mx-auto bg-zt-surface border-2 rounded-2xl p-4 shadow-2xl z-30 flex flex-wrap items-center justify-between gap-3 outline-none transition-colors ${
            navBlockedAt ? 'border-zt-danger ring-2 ring-zt-danger/40' : 'border-zt-primary'
          }`}
        >
          <div className="space-y-0.5">
            <div className="text-xs font-black uppercase tracking-wider text-zt-primary">
              {isDirty ? 'Unsaved Meet Builder Changes' : listingDirty ? 'Unsaved Listing Changes' : 'Event Form Open'}
            </div>
            <div className="text-xs font-bold text-zt-text-2">
              {isDirty
                ? 'Your edits to Meet, Divisions, Events, or Athletes are in working memory. Save to commit them.'
                : listingDirty
                  ? 'The Listing tab has edited fields.'
                  : 'An event form on the Events tab has a draft that Save Changes does not include.'}
              {isDirty && listingDirty ? ' The Listing tab also has edited fields.' : ''}
              {listingDirty ? ' Use Save Listing Settings or Reset on the Listing tab.' : ''}
              {eventFormOpen ? ' Save or cancel the event form on the Events tab to include or drop that draft.' : ''}
              {navBlockedAt ? <strong className="text-zt-danger"> The other tabs stay locked until you do.</strong> : null}
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {eventFormOpen && activeTab !== 'events' && (
              <button
                type="button"
                onClick={() => setActiveTab('events')}
                className="px-4 py-2.5 rounded-xl bg-zt-surface-2 border border-zt-border-strong text-zt-text-2 font-extrabold text-xs uppercase"
              >
                Go to Events
              </button>
            )}
            {eventFormOpen && (
              <button
                type="button"
                onClick={() => setCloseFormSignal((n) => n + 1)}
                className="px-4 py-2.5 rounded-xl bg-zt-surface-2 border border-zt-border-strong text-zt-text-2 font-extrabold text-xs uppercase inline-flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                Discard draft
              </button>
            )}
            {listingDirty && activeTab !== 'listing' && (
              <button
                type="button"
                onClick={() => setActiveTab('listing')}
                className="px-4 py-2.5 rounded-xl bg-zt-surface-2 border border-zt-border-strong text-zt-text-2 font-extrabold text-xs uppercase"
              >
                Go to Listing
              </button>
            )}
            {isDirty && (
            <>
            <button
              type="button"
              onClick={handleDiscardChanges}
              disabled={savingState}
              className="px-4 py-2.5 rounded-xl bg-zt-surface-2 border border-zt-border-strong text-zt-text-2 font-extrabold text-xs uppercase inline-flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              Discard
            </button>
            <button
              type="button"
              onClick={handleSaveMeetState}
              disabled={savingState}
              className="px-5 py-2.5 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase tracking-wider inline-flex items-center gap-1.5 shadow"
            >
              <Save className="w-3.5 h-3.5" aria-hidden="true" />
              {savingState ? 'Saving…' : 'Save Changes'}
            </button>
            </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
