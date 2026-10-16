'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Lock,
  MapPin,
} from 'lucide-react';
import { describeShowLifecycle } from '@/lib/website/filters';
import type { PromoterMeetDetail, RegistrationRequest } from '@/lib/promoter/contract';
import {
  getFixturePromoterApi,
  isRegistrationOpen,
  submitFixtureRegistration,
  validateRegistrationInput,
} from '@/lib/promoter/fixtureApi';
import { DEMO_PROMOTER_USER } from '@/lib/promoter/fixtures';

interface RegisterClientProps {
  initialDetail: PromoterMeetDetail;
  waiverText: string;
}

type Step = 1 | 2 | 3 | 4;

export default function RegisterClient({ initialDetail, waiverText }: RegisterClientProps) {
  const [detail, setDetail] = useState<PromoterMeetDetail>(initialDetail);

  // Sync with client-side singleton on mount so any edits made on /promoter are reflected
  useEffect(() => {
    let active = true;
    getFixturePromoterApi()
      .getMeetBySlug(initialDetail.summary.slug)
      .then((res) => {
        if (active && res.data) {
          setDetail(res.data);
        }
      });
    return () => {
      active = false;
    };
  }, [initialDetail.summary.slug]);

  const sortedDivisions = [...detail.state.divisions].sort((a, b) => a.sortOrder - b.sortOrder);
  const sortedEvents = [...detail.state.events].sort((a, b) => a.eventNumber - b.eventNumber);

  const [step, setStep] = useState<Step>(1);
  const [divisionId, setDivisionId] = useState<string>(sortedDivisions[0]?.id ?? '');
  const [athleteName, setAthleteName] = useState('');
  const [email, setEmail] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [waiverAccepted, setWaiverAccepted] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittedReg, setSubmittedReg] = useState<RegistrationRequest | null>(null);

  const { summary } = detail;
  const life = describeShowLifecycle(
    summary.listing.competitionStatus,
    summary.listing.registrationStatus,
    summary.listing.resultsStatus
  );
  const regOpen = isRegistrationOpen(summary.listing.registrationStatus);
  const selectedDivision = sortedDivisions.find((d) => d.id === divisionId);

  const venueDisplay = summary.listing.venue
    ? `${summary.listing.venue.facilityName ? `${summary.listing.venue.facilityName}, ` : ''}${summary.listing.venue.city}, ${summary.listing.venue.state}`
    : 'Venue not provided';

  const renderedWaiver = waiverText
    .replace(/\{\{PROMOTER_NAME\}\}/g, DEMO_PROMOTER_USER.displayName)
    .replace(/\{\{EVENT_NAME\}\}/g, summary.name)
    .replace(/\{\{EVENT_DATE\}\}/g, summary.date || 'TBD')
    .replace(/\{\{VENUE_NAME_AND_ADDRESS\}\}/g, venueDisplay);

  const goToStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!divisionId || !sortedDivisions.some((d) => d.id === divisionId)) {
      setError('Please select a division.');
      return;
    }
    if (!athleteName.trim() || athleteName.trim().length < 2) {
      setError('Please enter your full name.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!emergencyContact.trim() || emergencyContact.trim().length < 5) {
      setError('Please provide an emergency contact name and phone number.');
      return;
    }
    setStep(2);
  };

  const goToStep3 = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!waiverAccepted) {
      setError('You must check the box to accept the competition waiver before continuing.');
      return;
    }
    setStep(3);
  };

  const handleFinalSubmit = async () => {
    setError(null);
    const validationErr = validateRegistrationInput(
      {
        slug: summary.slug,
        divisionId,
        athleteName,
        email,
        emergencyContact,
        waiverAccepted,
      },
      detail
    );
    if (validationErr) {
      setError(validationErr);
      return;
    }

    setSubmitting(true);
    const res = await submitFixtureRegistration({
      slug: summary.slug,
      divisionId,
      athleteName,
      email,
      emergencyContact,
      waiverAccepted,
    });
    setSubmitting(false);

    if (res.error || !res.data) {
      setError(res.error ?? 'Could not submit registration.');
      return;
    }

    setSubmittedReg(res.data);
    setStep(4);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/shows"
          className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase text-zt-muted hover:text-zt-text"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          Back to Strongman Shows
        </Link>

        <Link
          href={`/promoter/${summary.serverId}`}
          className="text-xs font-bold text-zt-primary hover:underline"
        >
          Promoter View (/promoter/{summary.serverId}) →
        </Link>
      </div>

      {/* Show Header Banner */}
      <section className="bg-zt-surface border border-zt-border rounded-2xl p-5 sm:p-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded bg-zt-primary/20 text-zt-primary-2 border border-zt-primary/40">
            {life.competitionLabel}
          </span>
          <span
            className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded border ${
              regOpen
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-zt-danger/15 text-zt-danger-text border-zt-danger/40'
            }`}
          >
            {life.registrationLabel}
          </span>
          {summary.listing.federation && (
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-zt-inset border border-zt-border text-zt-text-2">
              {summary.listing.federation}
            </span>
          )}
        </div>

        <h1 className="text-2xl sm:text-3xl font-black text-zt-text">{summary.name}</h1>

        <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-zt-text-2">
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-zt-primary" aria-hidden="true" />
            {summary.date || 'Date TBD'}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-zt-secondary" aria-hidden="true" />
            {venueDisplay}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-zt-border text-xs">
          <div className="bg-zt-inset border border-zt-border rounded-xl p-2.5">
            <div className="text-[10px] font-extrabold uppercase text-zt-muted">Entry Fee</div>
            <div className="font-black text-zt-text mt-0.5">
              {summary.listing.entryFeeDisplay || 'Collected by promoter'}
            </div>
          </div>
          <div className="bg-zt-inset border border-zt-border rounded-xl p-2.5">
            <div className="text-[10px] font-extrabold uppercase text-zt-muted">
              Registration Deadline
            </div>
            <div className="font-black text-zt-text mt-0.5">
              {summary.listing.registrationDeadline || 'Open until filled'}
            </div>
          </div>
          <div className="bg-zt-inset border border-zt-border rounded-xl p-2.5">
            <div className="text-[10px] font-extrabold uppercase text-zt-muted">Promoter</div>
            <div className="font-black text-zt-text mt-0.5">
              {DEMO_PROMOTER_USER.displayName} ({DEMO_PROMOTER_USER.email})
            </div>
          </div>
        </div>
      </section>

      {/* Closed Registration State */}
      {!regOpen ? (
        <section className="bg-zt-surface border-2 border-zt-border rounded-2xl p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-zt-inset border border-zt-border text-zt-muted mx-auto flex items-center justify-center">
            <Lock className="w-6 h-6" aria-hidden="true" />
          </div>
          <h2 className="text-xl font-black text-zt-text">
            Registration is Closed ({life.registrationLabel})
          </h2>
          <p className="text-xs sm:text-sm text-zt-text-2 max-w-md mx-auto">
            Online athlete registration is not currently open for <strong>{summary.name}</strong>.
            Contact the promoter ({DEMO_PROMOTER_USER.email}) if you have questions about an
            existing entry.
          </p>
          <div className="pt-2">
            <Link
              href="/shows"
              className="inline-block px-5 py-2.5 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase"
            >
              Browse Other Shows
            </Link>
          </div>
        </section>
      ) : (
        <>
          {/* Step Indicator */}
          <ol className="grid grid-cols-4 gap-2 text-xs">
            {[
              { s: 1, label: '1. Division & Info' },
              { s: 2, label: '2. Waiver' },
              { s: 3, label: '3. Review' },
              { s: 4, label: '4. Confirmation' },
            ].map((item) => {
              const active = step === item.s;
              const done = step > item.s;
              return (
                <li
                  key={item.s}
                  className={`rounded-xl px-3 py-2 font-black uppercase text-[11px] text-center border ${
                    active
                      ? 'bg-zt-primary text-zt-on-primary border-zt-primary'
                      : done
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                      : 'bg-zt-surface text-zt-muted border-zt-border'
                  }`}
                >
                  {item.label}
                </li>
              );
            })}
          </ol>

          {error && (
            <div
              role="alert"
              className="p-4 rounded-2xl bg-zt-danger/15 border border-zt-danger text-zt-danger-text text-xs font-bold flex items-center gap-2"
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: DIVISION & ATHLETE DETAILS */}
          {step === 1 && (
            <form
              onSubmit={goToStep2}
              className="bg-zt-surface border border-zt-border rounded-2xl p-5 sm:p-6 space-y-5"
            >
              <h2 className="text-base font-black uppercase tracking-wider text-zt-primary">
                Step 1: Choose Division &amp; Athlete Details
              </h2>

              <div className="space-y-2">
                <label className="block text-xs font-extrabold uppercase text-zt-muted">
                  Select Division / Strength Group *
                </label>
                <div className="grid grid-cols-1 gap-2.5">
                  {sortedDivisions.map((div) => {
                    const selected = div.id === divisionId;
                    const weightSummary = sortedEvents
                      .map((ev) => {
                        const w = ev.divisionWeights?.[div.id];
                        return w ? `Ev${ev.eventNumber}: ${w} lb` : null;
                      })
                      .filter(Boolean)
                      .join(' • ');

                    return (
                      <button
                        key={div.id}
                        type="button"
                        onClick={() => setDivisionId(div.id)}
                        className={`p-3.5 rounded-xl border-2 text-left transition ${
                          selected
                            ? 'bg-zt-primary/15 border-zt-primary text-zt-text'
                            : 'bg-zt-inset border-zt-border text-zt-text-2 hover:border-zt-border-strong'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-black text-zt-text">{div.name}</span>
                          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-zt-surface border border-zt-border text-zt-primary">
                            Station {div.flight}
                          </span>
                        </div>
                        {weightSummary && (
                          <div className="text-[11px] font-semibold text-zt-muted mt-1">
                            Target Weights: {weightSummary}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2 border-t border-zt-border">
                <div>
                  <label
                    htmlFor="reg-athlete-name"
                    className="block text-[11px] font-extrabold uppercase text-zt-muted mb-1"
                  >
                    Athlete Full Name *
                  </label>
                  <input
                    id="reg-athlete-name"
                    type="text"
                    required
                    value={athleteName}
                    onChange={(e) => setAthleteName(e.target.value)}
                    placeholder="e.g. Jordan Demo"
                    className="w-full bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2.5 text-sm font-bold text-zt-text"
                  />
                </div>

                <div>
                  <label
                    htmlFor="reg-athlete-email"
                    className="block text-[11px] font-extrabold uppercase text-zt-muted mb-1"
                  >
                    Email Address *
                  </label>
                  <input
                    id="reg-athlete-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="athlete@example.com"
                    className="w-full bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2.5 text-sm font-bold text-zt-text"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="reg-emergency-contact"
                  className="block text-[11px] font-extrabold uppercase text-zt-muted mb-1"
                >
                  Emergency Contact (Name, Relationship &amp; Phone) *
                </label>
                <input
                  id="reg-emergency-contact"
                  type="text"
                  required
                  value={emergencyContact}
                  onChange={(e) => setEmergencyContact(e.target.value)}
                  placeholder="e.g. Taylor Demo (Spouse) — 717-555-0199"
                  className="w-full bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2.5 text-sm font-bold text-zt-text"
                />
              </div>

              <div className="bg-zt-inset border border-zt-border rounded-xl p-3.5 text-xs font-semibold text-zt-text-2">
                <strong className="text-zt-text uppercase">Entry Fee &amp; Payment Notice:</strong>{' '}
                Entry fee is{' '}
                <strong>{summary.listing.entryFeeDisplay || 'set by the promoter'}</strong>. No
                online payment is collected on this form; the promoter will collect payment directly.
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-6 py-3 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase tracking-wider shadow"
                >
                  Continue to Waiver →
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: FULL WAIVER TEXT & ACCEPTANCE */}
          {step === 2 && (
            <form
              onSubmit={goToStep3}
              className="bg-zt-surface border border-zt-border rounded-2xl p-5 sm:p-6 space-y-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-black uppercase tracking-wider text-zt-primary flex items-center gap-2">
                  <FileText className="w-4 h-4" aria-hidden="true" />
                  <span>Step 2: Assumption of Risk &amp; Liability Waiver</span>
                </h2>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-zt-inset border border-zt-border text-zt-muted">
                  legal/WAIVER.md
                </span>
              </div>

              <div className="bg-zt-inset border border-zt-border-strong rounded-xl p-4 max-h-80 overflow-y-auto text-xs text-zt-text-2 whitespace-pre-wrap font-mono leading-relaxed">
                {renderedWaiver}
              </div>

              <label className="flex items-start gap-2.5 p-3.5 rounded-xl bg-zt-inset border border-zt-border-strong cursor-pointer">
                <input
                  type="checkbox"
                  checked={waiverAccepted}
                  onChange={(e) => setWaiverAccepted(e.target.checked)}
                  className="mt-0.5 w-4 h-4"
                />
                <span className="text-xs font-bold text-zt-text leading-snug">
                  I have read the full Assumption of Risk and Release of Liability Waiver above,
                  understand that competing in strongman involves heavy implements and inherent risk
                  of injury, and agree to its terms for <strong>{summary.name}</strong>.
                </span>
              </label>

              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setStep(1);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-zt-surface-2 text-zt-text-2 font-bold text-xs uppercase"
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  className="px-6 py-3 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase tracking-wider shadow"
                >
                  Review Registration →
                </button>
              </div>
            </form>
          )}

          {/* STEP 3: REVIEW & SUBMIT */}
          {step === 3 && (
            <section className="bg-zt-surface border border-zt-border rounded-2xl p-5 sm:p-6 space-y-5">
              <h2 className="text-base font-black uppercase tracking-wider text-zt-primary flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4" aria-hidden="true" />
                <span>Step 3: Review &amp; Submit Registration</span>
              </h2>

              <dl className="bg-zt-inset border border-zt-border rounded-xl p-4 space-y-2.5 text-xs">
                <div className="flex justify-between gap-2 border-b border-zt-border pb-2">
                  <dt className="font-bold text-zt-muted">Competition</dt>
                  <dd className="font-black text-zt-text">
                    {summary.name} ({summary.date})
                  </dd>
                </div>
                <div className="flex justify-between gap-2 border-b border-zt-border pb-2">
                  <dt className="font-bold text-zt-muted">Selected Division</dt>
                  <dd className="font-black text-zt-primary">
                    {selectedDivision?.name ?? divisionId}
                  </dd>
                </div>
                <div className="flex justify-between gap-2 border-b border-zt-border pb-2">
                  <dt className="font-bold text-zt-muted">Athlete Name</dt>
                  <dd className="font-bold text-zt-text">{athleteName}</dd>
                </div>
                <div className="flex justify-between gap-2 border-b border-zt-border pb-2">
                  <dt className="font-bold text-zt-muted">Email</dt>
                  <dd className="font-bold text-zt-text">{email}</dd>
                </div>
                <div className="flex justify-between gap-2 border-b border-zt-border pb-2">
                  <dt className="font-bold text-zt-muted">Emergency Contact</dt>
                  <dd className="font-bold text-zt-text">{emergencyContact}</dd>
                </div>
                <div className="flex justify-between gap-2 border-b border-zt-border pb-2">
                  <dt className="font-bold text-zt-muted">Waiver Acceptance</dt>
                  <dd className="font-black text-emerald-400">Accepted (Timestamped on Submit)</dd>
                </div>
                <div className="flex justify-between gap-2 pt-1">
                  <dt className="font-bold text-zt-muted">Entry Fee</dt>
                  <dd className="font-bold text-zt-text">
                    {summary.listing.entryFeeDisplay || 'Not provided'} — Promoter will collect
                    payment
                  </dd>
                </div>
              </dl>

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setError(null);
                    setStep(2);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-zt-surface-2 text-zt-text-2 font-bold text-xs uppercase"
                >
                  ← Back to Waiver
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleFinalSubmit}
                  className="px-6 py-3 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase tracking-wider shadow disabled:opacity-40"
                >
                  {submitting ? 'Submitting…' : 'Submit Registration'}
                </button>
              </div>
            </section>
          )}

          {/* STEP 4: CONFIRMATION */}
          {step === 4 && submittedReg && (
            <section className="bg-zt-surface border-2 border-emerald-500/60 rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2.5 text-emerald-400">
                <CheckCircle2 className="w-6 h-6 flex-shrink-0" aria-hidden="true" />
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest">
                    Registration Submitted
                  </div>
                  <h2 className="text-xl font-black text-zt-text">
                    Status: {submittedReg.status.toUpperCase()}
                  </h2>
                </div>
              </div>

              <p className="text-xs sm:text-sm text-zt-text-2 leading-relaxed">
                Your registration for <strong>{summary.name}</strong> in{' '}
                <strong>{selectedDivision?.name ?? submittedReg.divisionId}</strong> has been
                recorded with status <strong className="text-amber-300">pending</strong>. Once the
                promoter accepts your entry, your name is automatically added to the official meet
                roster.
              </p>

              <div className="bg-zt-inset border border-zt-border rounded-xl p-4 space-y-1.5 text-xs">
                <div>
                  <strong className="text-zt-muted uppercase">Registration ID:</strong>{' '}
                  <code className="font-mono text-zt-text">{submittedReg.id}</code>
                </div>
                <div>
                  <strong className="text-zt-muted uppercase">Entry Fee &amp; Payment:</strong>{' '}
                  <span className="font-bold text-zt-text">
                    {summary.listing.entryFeeDisplay || 'Standard entry fee'} — The promoter will
                    collect payment directly.
                  </span>
                </div>
                <div>
                  <strong className="text-zt-muted uppercase">Promoter Contact:</strong>{' '}
                  <span className="font-bold text-zt-primary">
                    {DEMO_PROMOTER_USER.displayName} ({DEMO_PROMOTER_USER.email})
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link
                  href={`/promoter/${summary.serverId}`}
                  className="px-4 py-2.5 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase"
                >
                  View in Promoter Dashboard (/promoter/{summary.serverId})
                </Link>
                <Link
                  href="/shows"
                  className="px-4 py-2.5 rounded-xl bg-zt-inset border border-zt-border-strong text-zt-text font-extrabold text-xs uppercase"
                >
                  Back to Shows
                </Link>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
