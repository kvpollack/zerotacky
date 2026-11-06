'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Globe, ImagePlus, Plus, RotateCcw, Trash2 } from 'lucide-react';
import type { MeetListing } from '@/lib/promoter/contract';
import { isLiveBackend } from '@/lib/promoter/usePromoterApi';
import HostGymPicker from './HostGymPicker';
import PaintPicker from '@/components/website/PaintPicker';
import type { HostGymOption } from '@/lib/website/hostGym';
import type { ZtTheme } from '@/lib/website/theme';
import {
  SCHEDULE_LABELS,
  SCHEDULE_NOTES_MAX,
  SCHEDULE_TIME_KEYS,
  US_TIME_ZONES,
  cleanSchedule,
  timeZoneForState,
  type MeetSchedule,
  type ScheduleTimeKey,
} from '@/lib/website/schedule';
import type {
  ResultsFinalizationStatus,
  ShowCompetitionStatus,
  ShowRegistrationStatus,
} from '@/lib/website/types';
import { SPONSORS_MAX, SPONSOR_NAME_MAX, URL_MAX, cleanLivestreamUrl, cleanSponsors, sponsorLogoUrl, type MeetSponsor } from '@/lib/website/extras';
import { removeSponsorLogoQuietly, uploadSponsorLogo } from '@/lib/auth/sponsorLogo';

interface ListingSectionProps {
  meetDate: string;
  meetName?: string;   // 030: named in the colour preview
  listing: MeetListing;
  onSaveListing: (patch: Partial<MeetListing>) => Promise<{ error: string | null }>;
  // Reports whether the form holds unsaved edits so the parent can show it in the dirty bar.
  onDirtyChange?: (dirty: boolean) => void;
  // EM-05 (10/29): the new-entry notice goes to the owner's confirmed sign-in email; when there is none, say so here.
  ownerEmailUnconfirmed?: boolean;
  // 046: logo uploads go through the browser Supabase client; null (demo / no backend) hides the upload key.
  sb?: SupabaseClient | null;
}

// Flat text form of a listing. Kept as strings so the inputs are controlled and comparison is trivial.
interface ListingDraft {
  competitionStatus: ShowCompetitionStatus;
  registrationStatus: ShowRegistrationStatus;
  resultsStatus: ResultsFinalizationStatus;
  isPublicListed: boolean;
  facilityName: string;
  streetAddress: string;
  city: string;
  stateCode: string;
  postalCode: string;
  country: string;
  federation: string;
  entryFeeDisplay: string;
  registrationDeadline: string;
  athleteCapText: string;
  promoterContact: string;
  hostGymId: string; // 026: directory gym id or ''
  theme: ZtTheme | null; // 030: raw field text; validateListingPatch normalises or refuses at save
  autoAccept: boolean;   // 032
  schedule: Record<ScheduleTimeKey, string> & { timezone: string; notes: string };   // 044: raw field text; cleanSchedule decides at save
  livestreamUrl: string;                 // 046 (#17): raw text; cleanLivestreamUrl decides at save
  sponsors: SponsorDraft[];              // 046 (#14): raw rows; blank rows are dropped at save
}
interface SponsorDraft { name: string; url: string; logoPath: string }
function sponsorsDraft(list: MeetSponsor[] | null): SponsorDraft[] {
  return (list ?? []).map((s) => ({ name: s.name, url: s.url ?? '', logoPath: s.logoPath ?? '' }));
}
// Blank rows disappear; otherwise the raw rows go through so validateListingPatch can name the problem row.
function sponsorsPatch(rows: SponsorDraft[]): MeetSponsor[] | null {
  const c = cleanSponsors(rows);
  if (c.problem) return rows.filter((r) => r.name.trim() || r.url.trim() || r.logoPath).map((r) => ({ name: r.name, url: r.url, logoPath: r.logoPath } as MeetSponsor));
  return c.sponsors;
}

function scheduleDraft(s: MeetSchedule | null): ListingDraft['schedule'] {
  const out = { timezone: s?.timezone ?? '', notes: s?.notes ?? '' } as ListingDraft['schedule'];
  for (const k of SCHEDULE_TIME_KEYS) out[k] = s?.[k] ?? '';
  return out;
}

// Draft text -> patch value. All blank = null. Bad text goes through as-is so validateListingPatch names the field.
function schedulePatch(d: ListingDraft['schedule']): MeetSchedule | null {
  const c = cleanSchedule(d);
  if (c.problem) {
    const raw: Record<string, string> = {};
    for (const [k, v] of Object.entries(d)) if (v.trim()) raw[k] = v.trim();
    return raw as MeetSchedule;
  }
  return c.schedule;
}

function toDraft(listing: MeetListing): ListingDraft {
  return {
    competitionStatus: listing.competitionStatus,
    registrationStatus: listing.registrationStatus,
    resultsStatus: listing.resultsStatus,
    isPublicListed: listing.isPublicListed,
    facilityName: listing.venue?.facilityName ?? '',
    streetAddress: listing.venue?.streetAddress ?? '',
    city: listing.venue?.city ?? '',
    stateCode: listing.venue?.state ?? '',
    postalCode: listing.venue?.postalCode ?? '',
    country: listing.venue?.country ?? 'US',
    federation: listing.federation ?? '',
    entryFeeDisplay: listing.entryFeeDisplay ?? '',
    registrationDeadline: listing.registrationDeadline ?? '',
    athleteCapText:
      listing.athleteCap !== null && listing.athleteCap !== undefined ? String(listing.athleteCap) : '',
    promoterContact: listing.promoterContact ?? '',
    hostGymId: listing.hostGymId ?? '',
    theme: listing.theme ? { ...listing.theme } : null,
    autoAccept: listing.autoAccept ?? true,
    schedule: scheduleDraft(listing.schedule ?? null),
    livestreamUrl: listing.livestreamUrl ?? '',
    sponsors: sponsorsDraft(listing.sponsors ?? null),
  };
}

function toPatch(d: ListingDraft): Partial<MeetListing> {
  const hasVenueFields =
    d.facilityName.trim() || d.streetAddress.trim() || d.city.trim() || d.stateCode.trim() || d.postalCode.trim();
  const capText = d.athleteCapText.trim();
  return {
    competitionStatus: d.competitionStatus,
    registrationStatus: d.registrationStatus,
    resultsStatus: d.resultsStatus,
    isPublicListed: d.isPublicListed,
    venue: hasVenueFields
      ? {
          facilityName: d.facilityName.trim() || undefined,
          streetAddress: d.streetAddress.trim() || undefined,
          city: d.city.trim(),
          state: d.stateCode.trim().toUpperCase(),
          postalCode: d.postalCode.trim() || undefined,
          country: d.country.trim().toUpperCase() || 'US',
        }
      : null,
    federation: d.federation.trim() || null,
    entryFeeDisplay: d.entryFeeDisplay.trim() || null,
    registrationDeadline: d.registrationDeadline.trim() || null,
    // Non-numeric text becomes NaN on purpose so validateListingPatch rejects it with its own message.
    athleteCap: capText ? Number(capText) : null,
    promoterContact: d.promoterContact.trim() || null,
    hostGymId: d.hostGymId.trim() || null,
    theme: d.theme,
    autoAccept: d.autoAccept,
    schedule: schedulePatch(d.schedule),
    // a bare domain becomes https://...; bad text goes through raw so validateListingPatch can refuse it by name
    livestreamUrl: cleanLivestreamUrl(d.livestreamUrl).url ?? (d.livestreamUrl.trim() || null),
    sponsors: sponsorsPatch(d.sponsors),
  };
}

const INPUT = 'w-full bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-xs font-bold text-zt-text';
const LABEL = 'block text-[11px] font-bold uppercase text-zt-muted mb-1';

export default function ListingSection({
  meetDate,
  meetName = '',
  listing,
  onSaveListing,
  onDirtyChange,
  ownerEmailUnconfirmed = false,
  sb = null,
}: ListingSectionProps) {
  const [draft, setDraft] = useState<ListingDraft>(() => toDraft(listing));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  // 046: logos uploaded in this form session but not yet saved on the listing; removed on Reset or a failed save path.
  const pendingLogos = useRef<Set<string>>(new Set());
  const [logoBusy, setLogoBusy] = useState<number | null>(null);

  const isDirty = useMemo(
    () => JSON.stringify(toPatch(draft)) !== JSON.stringify(toPatch(toDraft(listing))),
    [draft, listing]
  );

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const set = <K extends keyof ListingDraft>(key: K, value: ListingDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));
  const setSched = (key: keyof ListingDraft['schedule'], value: string) =>
    setDraft((prev) => ({ ...prev, schedule: { ...prev.schedule, [key]: value } }));
  // The zone the schedule will run in when the promoter leaves the picker on 'Same as venue'.
  const venueZone = timeZoneForState(draft.stateCode);

  // "Use gym address": the directory address becomes the venue; the facility name stays if the promoter typed one.
  const useGymAddress = (g: HostGymOption) =>
    setDraft((prev) => ({
      ...prev,
      facilityName: prev.facilityName.trim() || g.name,
      streetAddress: g.streetAddress || prev.streetAddress,
      city: g.city || prev.city,
      stateCode: g.state || prev.stateCode,
      postalCode: g.zip || prev.postalCode,
      country: prev.country || 'US',
    }));

  const handleReset = () => {
    if (sb) for (const p of pendingLogos.current) void removeSponsorLogoQuietly(sb, p);
    pendingLogos.current.clear();
    setDraft(toDraft(listing));
    setError(null);
  };

  const setSponsor = (i: number, patch: Partial<SponsorDraft>) =>
    setDraft((prev) => ({ ...prev, sponsors: prev.sponsors.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const addSponsor = () => setDraft((prev) => (prev.sponsors.length >= SPONSORS_MAX ? prev : { ...prev, sponsors: [...prev.sponsors, { name: '', url: '', logoPath: '' }] }));
  const removeSponsor = (i: number) => setDraft((prev) => ({ ...prev, sponsors: prev.sponsors.filter((_, j) => j !== i) }));
  const handleLogo = async (i: number, file: File | undefined) => {
    if (!file || !sb) return;
    setLogoBusy(i);
    setError(null);
    try {
      const path = await uploadSponsorLogo(sb, file);
      pendingLogos.current.add(path);
      setSponsor(i, { logoPath: path });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Logo upload failed.');
    } finally {
      setLogoBusy(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSavedNotice(null);

    const res = await onSaveListing(toPatch(draft));

    setSaving(false);
    if (res.error) {
      setError(res.error);
    } else {
      // 046: the saved listing owns its logos now; replaced ones (and any upload that was dropped from a row) go away
      if (sb) {
        const kept = new Set(draft.sponsors.map((s) => s.logoPath).filter(Boolean));
        for (const p of pendingLogos.current) if (!kept.has(p)) void removeSponsorLogoQuietly(sb, p);
        for (const s of listing.sponsors ?? []) if (s.logoPath && !kept.has(s.logoPath)) void removeSponsorLogoQuietly(sb, s.logoPath);
        pendingLogos.current.clear();
      }
      setSavedNotice(
        isLiveBackend()
          ? 'Listing settings saved. Listed meets appear on Find a Show within a minute.'
          : 'Listing settings saved (preview data, this browser tab only).'
      );
      setTimeout(() => setSavedNotice(null), 4000);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-zt-surface border border-zt-border rounded-2xl p-5 space-y-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zt-border pb-3">
        <div>
          <h2 className="text-sm font-black uppercase tracking-wider text-zt-primary flex items-center gap-2">
            <Globe className="w-4 h-4" aria-hidden="true" />
            <span>5. Show Listing &amp; Lifecycle</span>
          </h2>
          <p className="text-xs text-zt-muted mt-0.5">
            {isLiveBackend() ? (
              <>
                Controls what the public sees on <Link href="/shows" className="text-zt-primary font-bold underline">Find a Show</Link> and the
                meet's registration page. Unlisted meets have no show page and are not in Find a Show; their registration page and live scoreboard still open by direct link, roster names included.
              </>
            ) : (
              <>
                Preview of the listing fields. Saving here updates this browser tab only; it connects to the live backend
                (and to Find a Show) in a later milestone.
              </>
            )}
          </p>
        </div>
        <span className="text-xs font-bold text-zt-text-2">
          Meet Date: <strong>{meetDate || 'Not set'}</strong>
        </span>
      </div>

      {/* Public Visibility Toggle */}
      <div
        className={`rounded-2xl border-2 p-4 space-y-2 ${
          draft.isPublicListed ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-amber-500/10 border-amber-500/40'
        }`}
      >
        <label className="flex items-center gap-2.5 text-sm font-black text-zt-text cursor-pointer">
          <input
            id="listing-public"
            type="checkbox"
            checked={draft.isPublicListed}
            onChange={(e) => set('isPublicListed', e.target.checked)}
            className="w-4 h-4"
          />
          <span className="flex items-center gap-1.5">
            {draft.isPublicListed ? (
              <>
                <Eye className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                Listed in the public shows directory
              </>
            ) : (
              <>
                <EyeOff className="w-4 h-4 text-amber-400" aria-hidden="true" />
                Unlisted
              </>
            )}
          </span>
        </label>
        <p className="text-xs font-bold text-zt-text-2">
          {draft.isPublicListed
            ? 'Listed meets appear on the public shows page and can be found by athletes. Unlist to hide the meet while you finish setting it up.'
            : 'Unlisted meets stay out of the public directory. Keep test meets and drafts unlisted until athletes should find them.'}
        </p>
      </div>

      {ownerEmailUnconfirmed && (
        <p role="status" className="flex items-start gap-2 text-xs font-bold text-amber-300 bg-amber-500/10 border border-amber-500/40 rounded-xl px-3 py-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            Your account email is not confirmed, so new-entry notices cannot reach you. Athletes still get their confirmations.
            Confirm it from the <Link href="/website/account" className="underline">Account page</Link>.
          </span>
        </p>
      )}

      {/* Lifecycle Statuses */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <div>
          <label htmlFor="listing-comp-status" className={LABEL}>
            Competition Status
          </label>
          <select
            id="listing-comp-status"
            value={draft.competitionStatus}
            onChange={(e) => set('competitionStatus', e.target.value as ShowCompetitionStatus)}
            className={INPUT}
          >
            <option value="upcoming">Upcoming</option>
            <option value="live">Live Now</option>
            <option value="completed">Completed</option>
            <option value="postponed">Postponed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <div>
          <label htmlFor="listing-reg-status" className={LABEL}>
            Registration Status
          </label>
          <select
            id="listing-reg-status"
            value={draft.registrationStatus}
            onChange={(e) => set('registrationStatus', e.target.value as ShowRegistrationStatus)}
            className={INPUT}
          >
            <option value="open">Open</option>
            <option value="waitlist">Waitlist Only</option>
            <option value="closed">Closed</option>
            <option value="day_of_only">Day-Of Entry Only</option>
            <option value="not_applicable">Not Applicable</option>
            <option value="not_provided">Not Provided</option>
          </select>
        </div>

        {/* 032: most promoters take every entry; the review queue is the opt-in. */}
        <div>
          <label htmlFor="listing-auto-accept" className={LABEL}>
            New Entries
          </label>
          <select
            id="listing-auto-accept"
            value={draft.autoAccept ? 'auto' : 'review'}
            onChange={(e) => set('autoAccept', e.target.value === 'auto')}
            className={INPUT}
            aria-describedby="listing-auto-accept-help"
          >
            <option value="auto">Accept automatically (go straight to the roster)</option>
            <option value="review">I review each one</option>
          </select>
          <p id="listing-auto-accept-help" className="text-[11px] text-zt-muted mt-1">
            {draft.autoAccept
              ? 'Athletes land on the roster the moment they register and get a "you are in" email. You can still decline anyone from the Registrations tab. Waitlist and cap rules still apply.'
              : 'Entries wait in the Registrations tab until you accept or decline each one. Athletes get a "received" email now and a decision email later.'}
          </p>
        </div>

        <div>
          <label htmlFor="listing-res-status" className={LABEL}>
            Results Status
          </label>
          <select
            id="listing-res-status"
            value={draft.resultsStatus}
            onChange={(e) => set('resultsStatus', e.target.value as ResultsFinalizationStatus)}
            className={INPUT}
          >
            <option value="not_started">Not Started</option>
            <option value="in_progress">In Progress (Live Provisional)</option>
            <option value="provisional">Provisional (Pending Audit)</option>
            <option value="final">Final (Certifies Official Podiums)</option>
          </select>
        </div>
      </div>

      {/* Venue Fields */}
      <div className="pt-3 border-t border-zt-border space-y-3">
        <div className="text-xs font-extrabold uppercase text-zt-primary">Venue &amp; Location</div>
        <HostGymPicker
          value={draft.hostGymId}
          onChange={(g) => set('hostGymId', g ? g.id : '')}
          onUseAddress={useGymAddress}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label htmlFor="listing-facility" className={LABEL}>
              Facility / Gym Name
            </label>
            <input
              id="listing-facility"
              type="text"
              value={draft.facilityName}
              onChange={(e) => set('facilityName', e.target.value)}
              placeholder="e.g. Keystone Forge Strength"
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor="listing-street" className={LABEL}>
              Street Address
            </label>
            <input
              id="listing-street"
              type="text"
              value={draft.streetAddress}
              onChange={(e) => set('streetAddress', e.target.value)}
              placeholder="e.g. 3104 Market St"
              className={INPUT}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label htmlFor="listing-city" className={LABEL}>
              City
            </label>
            <input
              id="listing-city"
              type="text"
              value={draft.city}
              onChange={(e) => set('city', e.target.value)}
              placeholder="York"
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor="listing-state" className={LABEL}>
              State
            </label>
            <input
              id="listing-state"
              type="text"
              maxLength={4}
              value={draft.stateCode}
              onChange={(e) => set('stateCode', e.target.value.toUpperCase())}
              placeholder="PA"
              className={`${INPUT} uppercase`}
            />
          </div>
          <div>
            <label htmlFor="listing-postal" className={LABEL}>
              Postal Code
            </label>
            <input
              id="listing-postal"
              type="text"
              value={draft.postalCode}
              onChange={(e) => set('postalCode', e.target.value)}
              placeholder="17404"
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor="listing-country" className={LABEL}>
              Country
            </label>
            <input
              id="listing-country"
              type="text"
              value={draft.country}
              onChange={(e) => set('country', e.target.value.toUpperCase())}
              placeholder="US"
              className={`${INPUT} uppercase`}
            />
          </div>
        </div>
      </div>

      {/* Federation, Entry Fee, Registration Deadline, Athlete Cap, Contact */}
      <div className="pt-3 border-t border-zt-border space-y-3">
        <div className="text-xs font-extrabold uppercase text-zt-primary">
          Sanctioning, Entry Fee, Caps &amp; Contact
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label htmlFor="listing-federation" className={LABEL}>
              Federation / Format
            </label>
            <input
              id="listing-federation"
              type="text"
              value={draft.federation}
              onChange={(e) => set('federation', e.target.value)}
              placeholder="USS, Strongman Corp, Unsanctioned..."
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor="listing-fee" className={LABEL}>
              Entry Fee Display
            </label>
            <input
              id="listing-fee"
              type="text"
              value={draft.entryFeeDisplay}
              onChange={(e) => set('entryFeeDisplay', e.target.value)}
              placeholder="e.g. $80 (Venmo/Cash)"
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor="listing-deadline" className={LABEL}>
              Registration Deadline
            </label>
            <input
              id="listing-deadline"
              type="date"
              value={draft.registrationDeadline}
              onChange={(e) => set('registrationDeadline', e.target.value)}
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor="listing-cap" className={LABEL}>
              Athlete Cap
            </label>
            <input
              id="listing-cap"
              type="number"
              min={1}
              step={1}
              value={draft.athleteCapText}
              onChange={(e) => set('athleteCapText', e.target.value)}
              placeholder="e.g. 40"
              className={INPUT}
            />
          </div>
        </div>
        <div>
          <label htmlFor="listing-contact" className={LABEL}>
            Promoter Contact (shown to athletes)
          </label>
          <input
            id="listing-contact"
            type="text"
            value={draft.promoterContact}
            onChange={(e) => set('promoterContact', e.target.value)}
            placeholder="email or phone athletes may use"
            aria-describedby="listing-contact-help"
            className={INPUT}
          />
          <p id="listing-contact-help" className="text-[11px] text-zt-muted mt-1">
            Appears on the registration page and in the waiver. Leave blank to show &quot;contact not provided&quot;.
          </p>
        </div>
      </div>

      {/* 044: meet-day schedule (feature gaps #7a). Native time inputs; the show page prints the timeline and offers the
          .ics download; reminders quote check-in and first event. */}
      <div className="pt-3 border-t border-zt-border space-y-3">
        <div className="text-xs font-extrabold uppercase text-zt-primary">Meet-Day Schedule</div>
        <p className="text-xs text-zt-muted">
          Shown on the show page as a timeline with an &quot;Add to calendar&quot; link, and quoted in the week-out and day-before
          reminders. Leave anything you have not settled blank. Times are local to the venue.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(['checkIn', 'weighInStart', 'weighInEnd', 'rulesMeeting', 'start', 'estimatedEnd', 'eveWeighInStart', 'eveWeighInEnd'] as ScheduleTimeKey[]).map((k) => (
            <div key={k}>
              <label htmlFor={`listing-sched-${k}`} className={LABEL}>{SCHEDULE_LABELS[k]}</label>
              <input
                id={`listing-sched-${k}`}
                type="time"
                step={300}
                value={draft.schedule[k]}
                onChange={(e) => setSched(k, e.target.value)}
                className={INPUT}
              />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-3">
          <div>
            <label htmlFor="listing-sched-tz" className={LABEL}>Time zone</label>
            <select
              id="listing-sched-tz"
              value={draft.schedule.timezone}
              onChange={(e) => setSched('timezone', e.target.value)}
              className={INPUT}
            >
              <option value="">{venueZone ? `Same as venue (${US_TIME_ZONES.find((z) => z.id === venueZone)?.label ?? venueZone})` : 'Same as venue (Eastern until a state is set)'}</option>
              {US_TIME_ZONES.map((z) => (
                <option key={z.id} value={z.id}>{z.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="listing-sched-notes" className={LABEL}>Schedule note (optional)</label>
            <input
              id="listing-sched-notes"
              type="text"
              maxLength={SCHEDULE_NOTES_MAX}
              value={draft.schedule.notes}
              onChange={(e) => setSched('notes', e.target.value)}
              placeholder="e.g. Weigh-in is at the host gym, not the venue"
              className={INPUT}
            />
          </div>
        </div>
      </div>

      {/* 046: livestream link (#17) and sponsor blocks (#14). Public on the show page, the phone board footer and the TV idle sheet. */}
      <div className="pt-3 border-t border-zt-border space-y-3">
        <div className="text-xs font-extrabold uppercase text-zt-primary">Livestream &amp; Sponsors</div>
        <div>
          <label htmlFor="listing-livestream" className={LABEL}>Livestream link (optional)</label>
          <input
            id="listing-livestream"
            type="text"   /* not type=url: the browser would block submit on a bare domain, which cleanLivestreamUrl accepts */
            inputMode="url"
            maxLength={URL_MAX}
            value={draft.livestreamUrl}
            onChange={(e) => set('livestreamUrl', e.target.value)}
            placeholder="https://youtube.com/live/..."
            className={INPUT}
          />
          <p className="text-[11px] text-zt-muted mt-1">Shown as a &quot;Watch live&quot; key on the show page and the phone board. Any https:// link works (YouTube, Twitch, Facebook, Instagram).</p>
        </div>
        <div className="space-y-2">
          <div className={LABEL}>Sponsors (up to {SPONSORS_MAX})</div>
          {draft.sponsors.length === 0 && (
            <p className="text-xs text-zt-muted">None yet. Sponsors print as a logo strip on the show page and the board, each linking to the sponsor&apos;s site.</p>
          )}
          {draft.sponsors.map((s, i) => {
            const logoSrc = s.logoPath ? sponsorLogoUrl(s.logoPath) : '';
            return (
              <div key={i} className="grid grid-cols-1 md:grid-cols-[56px_1fr_1fr_auto] gap-2 items-center bg-zt-inset/50 border border-zt-border rounded-xl p-2">
                <div className="w-14 h-14 rounded-lg bg-zt-inset border border-zt-border flex items-center justify-center overflow-hidden">
                  {logoSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoSrc} alt="" className="max-w-full max-h-full object-contain" />
                  ) : (
                    <ImagePlus className="w-5 h-5 text-zt-muted" aria-hidden="true" />
                  )}
                </div>
                <div>
                  <label htmlFor={`listing-sponsor-name-${i}`} className="sr-only">Sponsor {i + 1} name</label>
                  <input id={`listing-sponsor-name-${i}`} type="text" maxLength={SPONSOR_NAME_MAX} value={s.name} onChange={(e) => setSponsor(i, { name: e.target.value })} placeholder="Sponsor name" className={INPUT} />
                </div>
                <div>
                  <label htmlFor={`listing-sponsor-url-${i}`} className="sr-only">Sponsor {i + 1} link</label>
                  <input id={`listing-sponsor-url-${i}`} type="text" inputMode="url" maxLength={URL_MAX} value={s.url} onChange={(e) => setSponsor(i, { url: e.target.value })} placeholder="https://sponsor.com (optional)" className={INPUT} />
                </div>
                <div className="flex items-center gap-1.5">
                  {sb && (
                    <label className="px-3 py-2 rounded-xl bg-zt-inset border border-zt-border-strong text-zt-text font-black text-[11px] uppercase cursor-pointer whitespace-nowrap">
                      {logoBusy === i ? 'Uploading...' : s.logoPath ? 'Replace logo' : 'Add logo'}
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={logoBusy !== null} onChange={(e) => { void handleLogo(i, e.target.files?.[0]); e.target.value = ''; }} />
                    </label>
                  )}
                  {s.logoPath && (
                    <button type="button" onClick={() => setSponsor(i, { logoPath: '' })} className="px-2.5 py-2 rounded-xl text-[11px] font-black uppercase text-zt-muted hover:text-zt-text">No logo</button>
                  )}
                  <button type="button" onClick={() => removeSponsor(i)} aria-label={`Remove sponsor ${i + 1}`} className="p-2 rounded-xl text-zt-muted hover:text-zt-danger-text">
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
          {draft.sponsors.length < SPONSORS_MAX && (
            <button type="button" onClick={addSponsor} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zt-inset border border-zt-border-strong text-zt-text font-black text-[11px] uppercase">
              <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Add sponsor
            </button>
          )}
          {!sb && draft.sponsors.length > 0 && <p className="text-[11px] text-zt-muted">Logo upload needs a signed-in live backend; names and links still save.</p>}
        </div>
      </div>

      {/* 030: colour ways */}
      <div className="pt-3 border-t border-zt-border space-y-3">
        <div className="text-xs font-extrabold uppercase text-zt-primary">Show Colours</div>
        <PaintPicker
          subject="show"
          previewName={meetName}
          value={draft.theme}
          onChange={(t) => set('theme', t)}
          inputClassName={INPUT}
          labelClassName={LABEL}
        />
      </div>

      {error && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-zt-danger/15 border border-zt-danger text-zt-danger-text text-xs font-bold flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {savedNotice && (
        <div
          role="status"
          className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          <span>{savedNotice}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
        {isDirty && (
          <span className="text-xs font-bold text-amber-300 mr-auto">Unsaved listing changes</span>
        )}
        <button
          type="button"
          onClick={handleReset}
          disabled={saving || !isDirty}
          className="px-4 py-2.5 rounded-xl bg-zt-surface-2 border border-zt-border-strong text-zt-text-2 font-extrabold text-xs uppercase inline-flex items-center gap-1.5 disabled:opacity-40"
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          Reset
        </button>
        <button
          type="submit"
          disabled={saving || !isDirty}
          className="px-6 py-3 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase tracking-wider shadow disabled:opacity-40"
        >
          {saving ? 'Saving Listing…' : 'Save Listing Settings'}
        </button>
      </div>
    </form>
  );
}
