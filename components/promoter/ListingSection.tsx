'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Globe, RotateCcw } from 'lucide-react';
import type { MeetListing } from '@/lib/promoter/contract';
import { isLiveBackend } from '@/lib/promoter/usePromoterApi';
import type {
  ResultsFinalizationStatus,
  ShowCompetitionStatus,
  ShowRegistrationStatus,
} from '@/lib/website/types';

interface ListingSectionProps {
  meetDate: string;
  listing: MeetListing;
  onSaveListing: (patch: Partial<MeetListing>) => Promise<{ error: string | null }>;
  // Reports whether the form holds unsaved edits so the parent can show it in the dirty bar.
  onDirtyChange?: (dirty: boolean) => void;
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
  };
}

const INPUT = 'w-full bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-xs font-bold text-zt-text';
const LABEL = 'block text-[11px] font-bold uppercase text-zt-muted mb-1';

export default function ListingSection({
  meetDate,
  listing,
  onSaveListing,
  onDirtyChange,
}: ListingSectionProps) {
  const [draft, setDraft] = useState<ListingDraft>(() => toDraft(listing));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const isDirty = useMemo(
    () => JSON.stringify(toPatch(draft)) !== JSON.stringify(toPatch(toDraft(listing))),
    [draft, listing]
  );

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const set = <K extends keyof ListingDraft>(key: K, value: ListingDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const handleReset = () => {
    setDraft(toDraft(listing));
    setError(null);
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
                meet's registration page. Unlisted meets still open by direct link.
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
