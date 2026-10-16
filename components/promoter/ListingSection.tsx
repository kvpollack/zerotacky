'use client';

import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Globe } from 'lucide-react';
import type { MeetListing } from '@/lib/promoter/contract';
import type {
  ResultsFinalizationStatus,
  ShowCompetitionStatus,
  ShowRegistrationStatus,
} from '@/lib/website/types';

interface ListingSectionProps {
  meetDate: string;
  listing: MeetListing;
  onSaveListing: (patch: Partial<MeetListing>) => Promise<{ error: string | null }>;
}

export default function ListingSection({
  meetDate,
  listing,
  onSaveListing,
}: ListingSectionProps) {
  const [competitionStatus, setCompetitionStatus] = useState<ShowCompetitionStatus>(
    listing.competitionStatus
  );
  const [registrationStatus, setRegistrationStatus] = useState<ShowRegistrationStatus>(
    listing.registrationStatus
  );
  const [resultsStatus, setResultsStatus] = useState<ResultsFinalizationStatus>(
    listing.resultsStatus
  );
  const [isPublicListed, setIsPublicListed] = useState<boolean>(listing.isPublicListed);

  const [facilityName, setFacilityName] = useState(listing.venue?.facilityName ?? '');
  const [streetAddress, setStreetAddress] = useState(listing.venue?.streetAddress ?? '');
  const [city, setCity] = useState(listing.venue?.city ?? '');
  const [stateCode, setStateCode] = useState(listing.venue?.state ?? '');
  const [postalCode, setPostalCode] = useState(listing.venue?.postalCode ?? '');
  const [country, setCountry] = useState(listing.venue?.country ?? 'US');

  const [federation, setFederation] = useState(listing.federation ?? '');
  const [entryFeeDisplay, setEntryFeeDisplay] = useState(listing.entryFeeDisplay ?? '');
  const [registrationDeadline, setRegistrationDeadline] = useState(
    listing.registrationDeadline ?? ''
  );
  const [athleteCapText, setAthleteCapText] = useState(
    listing.athleteCap !== null && listing.athleteCap !== undefined
      ? String(listing.athleteCap)
      : ''
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSavedNotice(null);

    const hasVenueFields =
      facilityName.trim() ||
      streetAddress.trim() ||
      city.trim() ||
      stateCode.trim() ||
      postalCode.trim();

    const venue = hasVenueFields
      ? {
          facilityName: facilityName.trim() || undefined,
          streetAddress: streetAddress.trim() || undefined,
          city: city.trim(),
          state: stateCode.trim().toUpperCase(),
          postalCode: postalCode.trim() || undefined,
          country: country.trim().toUpperCase() || 'US',
        }
      : null;

    const athleteCap = athleteCapText.trim() ? Number(athleteCapText.trim()) : null;

    const res = await onSaveListing({
      competitionStatus,
      registrationStatus,
      resultsStatus,
      isPublicListed,
      venue,
      federation: federation.trim() || null,
      entryFeeDisplay: entryFeeDisplay.trim() || null,
      registrationDeadline: registrationDeadline.trim() || null,
      athleteCap,
    });

    setSaving(false);
    if (res.error) {
      setError(res.error);
    } else {
      setSavedNotice('Public listing settings saved.');
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
            <span>5. Public Show Listing &amp; Lifecycle</span>
          </h2>
          <p className="text-xs text-zt-muted mt-0.5">
            Controls how this competition appears on <code className="font-mono">/shows</code> and{' '}
            <code className="font-mono">/register/&lt;slug&gt;</code>.
          </p>
        </div>
        <span className="text-xs font-bold text-zt-text-2">
          Meet Date: <strong>{meetDate || 'Not set'}</strong>
        </span>
      </div>

      {/* Public Visibility Toggle + Plain Warning */}
      <div
        className={`rounded-2xl border-2 p-4 space-y-2 ${
          isPublicListed
            ? 'bg-emerald-500/10 border-emerald-500/40'
            : 'bg-amber-500/10 border-amber-500/40'
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2.5 text-sm font-black text-zt-text cursor-pointer">
            <input
              type="checkbox"
              checked={isPublicListed}
              onChange={(e) => setIsPublicListed(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="flex items-center gap-1.5">
              {isPublicListed ? (
                <>
                  <Eye className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                  Publicly Listed on /shows
                </>
              ) : (
                <>
                  <EyeOff className="w-4 h-4 text-amber-400" aria-hidden="true" />
                  Public Listing Off (Unlisted)
                </>
              )}
            </span>
          </label>
        </div>
        <p className="text-xs font-bold text-zt-text-2">
          {isPublicListed
            ? 'This meet is visible in the public /shows directory. Athletes can discover it by state, division, and implements.'
            : 'Warning: Turning Public Listing off means this meet is invisible on /shows. Keep it off for test meets or drafts until you are ready for athletes to find it.'}
        </p>
      </div>

      {/* Lifecycle Statuses */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <div>
          <label
            htmlFor="listing-comp-status"
            className="block text-[11px] font-extrabold uppercase text-zt-muted mb-1"
          >
            Competition Status
          </label>
          <select
            id="listing-comp-status"
            value={competitionStatus}
            onChange={(e) => setCompetitionStatus(e.target.value as ShowCompetitionStatus)}
            className="w-full bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-xs font-bold text-zt-text"
          >
            <option value="upcoming">Upcoming</option>
            <option value="live">Live Now</option>
            <option value="completed">Completed</option>
            <option value="postponed">Postponed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="listing-reg-status"
            className="block text-[11px] font-extrabold uppercase text-zt-muted mb-1"
          >
            Registration Status
          </label>
          <select
            id="listing-reg-status"
            value={registrationStatus}
            onChange={(e) => setRegistrationStatus(e.target.value as ShowRegistrationStatus)}
            className="w-full bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-xs font-bold text-zt-text"
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
          <label
            htmlFor="listing-res-status"
            className="block text-[11px] font-extrabold uppercase text-zt-muted mb-1"
          >
            Results Status
          </label>
          <select
            id="listing-res-status"
            value={resultsStatus}
            onChange={(e) => setResultsStatus(e.target.value as ResultsFinalizationStatus)}
            className="w-full bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-xs font-bold text-zt-text"
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
        <div className="text-xs font-extrabold uppercase text-zt-primary">
          Venue &amp; Location
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold uppercase text-zt-muted mb-1">
              Facility / Gym Name
            </label>
            <input
              type="text"
              value={facilityName}
              onChange={(e) => setFacilityName(e.target.value)}
              placeholder="e.g. The Power Plant Gym"
              className="w-full bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-xs font-bold text-zt-text"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase text-zt-muted mb-1">
              Street Address
            </label>
            <input
              type="text"
              value={streetAddress}
              onChange={(e) => setStreetAddress(e.target.value)}
              placeholder="e.g. 3104 Market St"
              className="w-full bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-xs font-bold text-zt-text"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-bold uppercase text-zt-muted mb-1">
              City
            </label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="York"
              className="w-full bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-xs font-bold text-zt-text"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase text-zt-muted mb-1">
              State
            </label>
            <input
              type="text"
              maxLength={4}
              value={stateCode}
              onChange={(e) => setStateCode(e.target.value.toUpperCase())}
              placeholder="PA"
              className="w-full bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-xs font-bold text-zt-text uppercase"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase text-zt-muted mb-1">
              Postal Code
            </label>
            <input
              type="text"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              placeholder="17404"
              className="w-full bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-xs font-bold text-zt-text"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase text-zt-muted mb-1">
              Country
            </label>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value.toUpperCase())}
              placeholder="US"
              className="w-full bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-xs font-bold text-zt-text uppercase"
            />
          </div>
        </div>
      </div>

      {/* Federation, Entry Fee, Registration Deadline, Athlete Cap */}
      <div className="pt-3 border-t border-zt-border space-y-3">
        <div className="text-xs font-extrabold uppercase text-zt-primary">
          Sanctioning, Entry Fee &amp; Caps
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-bold uppercase text-zt-muted mb-1">
              Federation / Format
            </label>
            <input
              type="text"
              value={federation}
              onChange={(e) => setFederation(e.target.value)}
              placeholder="USS, Strongman Corp, Unsanctioned..."
              className="w-full bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-xs font-bold text-zt-text"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase text-zt-muted mb-1">
              Entry Fee Display
            </label>
            <input
              type="text"
              value={entryFeeDisplay}
              onChange={(e) => setEntryFeeDisplay(e.target.value)}
              placeholder="e.g. $80 (Venmo/Cash)"
              className="w-full bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-xs font-bold text-zt-text"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase text-zt-muted mb-1">
              Registration Deadline
            </label>
            <input
              type="date"
              value={registrationDeadline}
              onChange={(e) => setRegistrationDeadline(e.target.value)}
              className="w-full bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-xs font-bold text-zt-text"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase text-zt-muted mb-1">
              Athlete Cap
            </label>
            <input
              type="number"
              min={1}
              value={athleteCapText}
              onChange={(e) => setAthleteCapText(e.target.value)}
              placeholder="e.g. 40"
              className="w-full bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-xs font-bold text-zt-text"
            />
          </div>
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

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={saving}
          className="px-6 py-3 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase tracking-wider shadow disabled:opacity-40"
        >
          {saving ? 'Saving Listing…' : 'Save Listing Settings'}
        </button>
      </div>
    </form>
  );
}
