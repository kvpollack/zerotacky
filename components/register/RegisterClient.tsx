'use client';

import React, { useEffect, useRef, useState } from 'react';
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
  UserCheck,
} from 'lucide-react';
import { describeShowLifecycle } from '@/lib/website/filters';
import type { PublicRegistrationMeet } from '@/lib/promoter/contract';
import {
  ADULT_AGE,
  ageOnDate,
  ageReferenceDate,
  decideRegistrationOutcome,
  isRegistrationOpen,
  MIN_ATHLETE_AGE,
  parseIsoDate,
  todayIsoDate,
  validateRegistrationInput,
} from '@/lib/promoter/rules';
import { getPromoterApi, isLiveBackend } from '@/lib/promoter/usePromoterApi';
import MarkdownBlocks from '@/components/legal/MarkdownBlocks';
import { parseMarkdown } from '@/lib/legal/markdown';
import { useAuth } from '@/lib/auth/useAuth';
import { getSupabase } from '@/lib/auth/supabaseBrowser';
import { describeEmailResult, requestRegistrationEmail } from '@/lib/email/client';
import { listMyCards, showWantsMembershipCard } from '@/lib/website/membershipCards';
import SignInForm from '@/components/auth/SignInForm';

interface RegisterClientProps {
  slug: string;
  waiverText: string | null;
  waiverVersion: string | null; // computed server-side from the waiver file; null when the waiver did not load
  waiverError: string | null;
}

type Step = 1 | 2 | 3 | 4;
type LoadState = 'loading' | 'ready' | 'missing' | 'error';

const PREVIEW_NOTICE =
  'Preview: this entry is stored in this browser tab only, resets when the page reloads, and is not a real registration. Real entries open when the live backend lands in a later milestone.';

export default function RegisterClient({ slug, waiverText, waiverVersion, waiverError }: RegisterClientProps) {
  const [meet, setMeet] = useState<PublicRegistrationMeet | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);

  const [step, setStep] = useState<Step>(1);
  // Registration needs an account (Kurt 10/21: the entry belongs to the athlete, and it is how the user base grows).
  // The server refuses anonymous submissions too (021); this gate keeps the athlete on the page while they sign in.
  // Preview builds have no accounts, so the fixture backend stays open.
  const auth = useAuth();
  const needsAccount = isLiveBackend() && !auth.user;

  // Prefill from the account when it is known (the profile arrives a beat after the session); both stay editable and a
  // value the athlete already typed wins.
  const accountEmail = auth.user?.email ?? '';
  const accountName = auth.profile?.display_name ?? '';
  useEffect(() => { if (accountEmail) setEmail((v) => v || accountEmail); }, [accountEmail]);
  useEffect(() => { if (accountName) setAthleteName((v) => v || accountName); }, [accountName]);
  const [divisionId, setDivisionId] = useState<string>('');
  const [athleteName, setAthleteName] = useState('');
  const [email, setEmail] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  // 009: date of birth; age is judged on the meet date. Under 18 reveals the guardian fields (waiver section 7).
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianContact, setGuardianContact] = useState('');
  const [waiverAccepted, setWaiverAccepted] = useState(false);

  // 035: a sanctioned show and no membership card on the account -> one-line nudge on step 1. Never blocks; one cheap
  // query, errors swallowed (the nudge simply does not show).
  const [cardNudge, setCardNudge] = useState(false);
  const userId = auth.user?.id ?? null;
  const showFederation = meet?.listing.federation ?? '';
  useEffect(() => {
    const sb = getSupabase();
    if (!userId || !sb || !isLiveBackend() || !showWantsMembershipCard(showFederation)) { setCardNudge(false); return; }
    let cancelled = false;
    listMyCards(sb, userId)
      .then((cards) => { if (!cancelled) setCardNudge(cards.length === 0); })
      .catch(() => { if (!cancelled) setCardNudge(false); });
    return () => { cancelled = true; };
  }, [userId, showFederation]);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ id: string; status: 'pending' | 'waitlist' | 'accepted' } | null>(null);
  const [emailNote, setEmailNote] = useState<string | null>(null);   // 031: "A confirmation is on its way to ..." 

  const radioRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // The public meet shape is looked up in the browser so meets created in this tab's dashboard are found too.
  useEffect(() => {
    let active = true;
    setLoadState('loading');
    getPromoterApi()
      .getPublicMeetBySlug(slug)
      .then((res) => {
        if (!active) return;
        if (res.error) {
          setLoadError(res.error);
          setLoadState('error');
          return;
        }
        if (!res.data) {
          setLoadState('missing');
          return;
        }
        setMeet(res.data);
        setDivisionId((cur) => cur || res.data?.divisions[0]?.id || '');
        setLoadState('ready');
      })
      .catch((err: unknown) => {
        if (!active) return;
        setLoadError(err instanceof Error ? err.message : String(err));
        setLoadState('error');
      });
    return () => {
      active = false;
    };
  }, [slug]);

  if (loadState === 'loading') {
    return (
      <div className="max-w-3xl mx-auto">
        <section className="bg-zt-surface border border-zt-border rounded-2xl p-8 text-center text-xs font-bold text-zt-muted" aria-busy="true">
          Loading competition…
        </section>
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <BackToShows />
        <section role="alert" className="bg-zt-surface border border-zt-danger rounded-2xl p-6 space-y-2">
          <h1 className="text-xl font-black text-zt-text">Could not load this competition</h1>
          <p className="text-xs font-bold text-zt-danger-text">{loadError}</p>
        </section>
      </div>
    );
  }

  if (loadState === 'missing' || !meet) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <BackToShows />
        <section className="bg-zt-surface border border-zt-border rounded-2xl p-8 text-center space-y-3">
          <h1 className="text-xl font-black text-zt-text">No competition found for this registration link</h1>
          <p className="text-xs sm:text-sm text-zt-text-2 max-w-md mx-auto">
            Check the link from the promoter, or browse the shows list.
            {!isLiveBackend() && ' Meets created in the preview dashboard exist only in the browser tab that created them.'}
          </p>
          <Link
            href="/shows"
            className="inline-block px-5 py-2.5 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase"
          >
            Browse Shows
          </Link>
        </section>
      </div>
    );
  }

  const life = describeShowLifecycle(
    meet.listing.competitionStatus,
    meet.listing.registrationStatus,
    'not_started'
  );
  const regOpen = isRegistrationOpen(meet.listing.registrationStatus);
  const gate = decideRegistrationOutcome(meet);
  const selectedDivision = meet.divisions.find((d) => d.id === divisionId);
  const promoterContactDisplay = meet.listing.promoterContact ?? 'contact not provided';

  const venueDisplay = meet.listing.venue
    ? `${meet.listing.venue.facilityName ? `${meet.listing.venue.facilityName}, ` : ''}${meet.listing.venue.city}, ${meet.listing.venue.state}`
    : 'Venue not provided';

  const renderedWaiver = (waiverText ?? '')
    .replace(/\{\{PROMOTER_NAME\}\}/g, meet.promoterDisplayName)
    .replace(/\{\{EVENT_NAME\}\}/g, meet.name)
    .replace(/\{\{EVENT_DATE\}\}/g, meet.date || 'TBD')
    .replace(/\{\{VENUE_NAME_AND_ADDRESS\}\}/g, venueDisplay);

  // Age on competition day, live as the date is typed; null until the date is complete.
  const ageOnMeetDay = parseIsoDate(dateOfBirth) ? ageOnDate(dateOfBirth, ageReferenceDate(meet.date)) : null;
  const isMinor = ageOnMeetDay !== null && ageOnMeetDay >= MIN_ATHLETE_AGE && ageOnMeetDay < ADULT_AGE;
  const guardianOrNull = isMinor ? { name: guardianName, contact: guardianContact } : null;

  const capacityDisplay =
    meet.listing.athleteCap !== null
      ? `${meet.acceptedCount} of ${meet.listing.athleteCap} spots taken`
      : `${meet.acceptedCount} on the roster, no cap`;

  const goToStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const err = validateRegistrationInput(
      {
        slug: meet.slug, divisionId, athleteName, email, emergencyContact,
        dateOfBirth,
        guardian: guardianOrNull,
        waiverAccepted: true, waiverVersion: waiverVersion ?? '',
      },
      meet
    );
    if (err) {
      setError(err);
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
    if (!waiverAccepted) {
      setError('You must read and accept the competition waiver before submitting.');
      return;
    }
    if (!waiverVersion) {
      setError('The waiver text did not load, so this entry cannot be submitted. Reload the page and try again.');
      return;
    }
    setSubmitting(true);
    const res = await getPromoterApi().submitRegistration({
      slug: meet.slug,
      divisionId,
      athleteName,
      email,
      emergencyContact,
      dateOfBirth,
      guardian: guardianOrNull,
      waiverAccepted: true,
      waiverVersion,
    });
    setSubmitting(false);

    if (res.error || !res.data) {
      setError(res.error ?? 'Could not submit registration.');
      return;
    }

    setSubmitted(res.data);
    setStep(4);
    // 031: confirmation to the athlete and a notice to the promoter. Best effort: the registration is already in.
    if (isLiveBackend()) {
      requestRegistrationEmail(getSupabase(), res.data.id, 'received').then((r) => setEmailNote(describeEmailResult(r, 'athlete')));
    }
    // Refresh the public shape so the capacity line reflects the new entry.
    const refreshed = await getPromoterApi().getPublicMeetBySlug(meet.slug);
    if (refreshed.data) setMeet(refreshed.data);
  };

  const onRadioKeyDown = (e: React.KeyboardEvent, index: number) => {
    const count = meet.divisions.length;
    let next: number | null = null;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (index + 1) % count;
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = (index - 1 + count) % count;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = count - 1;
    if (next === null) return;
    e.preventDefault();
    setDivisionId(meet.divisions[next].id);
    radioRefs.current[next]?.focus();
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <BackToShows />

      {/* Show Header Banner */}
      <section className="bg-zt-surface border border-zt-border rounded-2xl p-5 sm:p-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-black uppercase px-2.5 py-0.5 rounded bg-zt-primary/20 text-zt-primary-2 border border-zt-primary/40">
            {life.competitionLabel}
          </span>
          <span
            className={`text-xs font-black uppercase px-2.5 py-0.5 rounded border ${
              regOpen
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-zt-danger/15 text-zt-danger-text border-zt-danger/40'
            }`}
          >
            {life.registrationLabel}
          </span>
          {meet.listing.federation && (
            <span className="text-xs font-bold uppercase px-2 py-0.5 rounded bg-zt-inset border border-zt-border text-zt-text-2">
              {meet.listing.federation}
            </span>
          )}
        </div>

        <h1 className="text-2xl sm:text-3xl font-black text-zt-text">{meet.name}</h1>

        <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-zt-text-2">
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-zt-primary" aria-hidden="true" />
            {meet.date || 'Date TBD'}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-zt-secondary" aria-hidden="true" />
            {venueDisplay}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 pt-2 border-t border-zt-border text-xs">
          <div className="bg-zt-inset border border-zt-border rounded-xl p-2.5">
            <div className="text-xs font-extrabold uppercase text-zt-muted">Entry Fee</div>
            <div className="font-black text-zt-text mt-0.5">
              {meet.listing.entryFeeDisplay || 'Collected by promoter'}
            </div>
          </div>
          <div className="bg-zt-inset border border-zt-border rounded-xl p-2.5">
            <div className="text-xs font-extrabold uppercase text-zt-muted">Registration Deadline</div>
            <div className="font-black text-zt-text mt-0.5">
              {meet.listing.registrationDeadline || (regOpen ? 'Open until filled' : 'Closed')}
            </div>
          </div>
          <div className="bg-zt-inset border border-zt-border rounded-xl p-2.5">
            <div className="text-xs font-extrabold uppercase text-zt-muted">Capacity</div>
            <div className="font-black text-zt-text mt-0.5">{capacityDisplay}</div>
          </div>
          <div className="bg-zt-inset border border-zt-border rounded-xl p-2.5">
            <div className="text-xs font-extrabold uppercase text-zt-muted">Promoter</div>
            <div className="font-black text-zt-text mt-0.5">
              {meet.promoterDisplayName}
              <span className="block font-bold text-zt-text-2">{promoterContactDisplay}</span>
            </div>
          </div>
        </div>
      </section>

      {!isLiveBackend() && (
        <p className="text-xs font-bold text-amber-300 bg-amber-500/10 border border-amber-500/40 rounded-xl px-3 py-2">
          {PREVIEW_NOTICE}
        </p>
      )}

      {waiverError ? (
        <section role="alert" className="bg-zt-surface border-2 border-zt-danger rounded-2xl p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-zt-danger/15 border border-zt-danger text-zt-danger-text mx-auto flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" aria-hidden="true" />
          </div>
          <h2 className="text-xl font-black text-zt-text">Registration unavailable</h2>
          <p className="text-xs sm:text-sm text-zt-danger-text max-w-md mx-auto">{waiverError}</p>
          <p className="text-xs text-zt-text-2 max-w-md mx-auto">
            Athletes must accept the waiver to register, so the form is hidden until the waiver text is available.
            Contact the promoter ({promoterContactDisplay}) in the meantime.
          </p>
        </section>
      ) : gate.status === null ? (
        <section className="bg-zt-surface border-2 border-zt-border rounded-2xl p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-zt-inset border border-zt-border text-zt-muted mx-auto flex items-center justify-center">
            <Lock className="w-6 h-6" aria-hidden="true" />
          </div>
          <h2 className="text-xl font-black text-zt-text">
            {regOpen ? 'Registration is not taking entries' : life.registrationLabel}
          </h2>
          <p className="text-xs sm:text-sm text-zt-text-2 max-w-md mx-auto">{gate.error}</p>
          <p className="text-xs text-zt-text-2 max-w-md mx-auto">
            Promoter: {meet.promoterDisplayName} ({promoterContactDisplay}).
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
          {gate.status === 'waitlist' && step < 4 && (
            <p className="text-xs font-bold text-zt-text-2 bg-zt-inset border border-zt-border rounded-xl px-3 py-2">
              {gate.reason === 'full'
                ? `This show is full (${capacityDisplay}). You can still register: your entry goes on the waitlist and the promoter decides if a spot opens.`
                : 'This competition is taking waitlist entries only. Your request will be marked waitlisted and the promoter decides if a spot opens.'}
            </p>
          )}

          {/* Step Indicator */}
          <ol className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
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
                  aria-current={active ? 'step' : undefined}
                  className={`rounded-xl px-2 py-2 font-black uppercase text-xs leading-tight text-center border min-h-[44px] flex items-center justify-center ${
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

          {/* STEP 0: ACCOUNT. Registration is tied to a ZeroTacky account. */}
          {step === 1 && isLiveBackend() && auth.loading && (
            <section className="bg-zt-surface border border-zt-border rounded-2xl p-5 sm:p-6">
              <div className="text-xs font-bold uppercase text-zt-muted">Checking your session…</div>
            </section>
          )}
          {step === 1 && needsAccount && !auth.loading && (
            <section aria-labelledby="reg-account-heading" className="bg-zt-surface border border-zt-border rounded-2xl p-5 sm:p-6 space-y-4">
              <h2 id="reg-account-heading" className="text-base font-black uppercase tracking-wider text-zt-primary flex items-center gap-2">
                <UserCheck className="w-4 h-4" aria-hidden="true" /> Step 1: Your ZeroTacky account
              </h2>
              <p className="text-xs sm:text-sm text-zt-text-2 leading-relaxed max-w-2xl">
                Registering takes a free account. Your entry is tied to it, so you can follow its status on My Meets and
                every show you compete in builds your record. Create one here, or sign in if you already have one; you
                stay on this page. Under 18? A parent or guardian creates the account and registers you.
              </p>
              <div className="max-w-xl">
                <SignInForm auth={auth} defaultMode="signup" returnTo={`/register/${slug}`} idPrefix="reg-acct" />
              </div>
            </section>
          )}

          {/* STEP 1: DIVISION & ATHLETE DETAILS */}
          {step === 1 && !needsAccount && !(isLiveBackend() && auth.loading) && (
            <form
              onSubmit={goToStep2}
              className="bg-zt-surface border border-zt-border rounded-2xl p-5 sm:p-6 space-y-5"
            >
              <h2 className="text-base font-black uppercase tracking-wider text-zt-primary">
                Step 1: Choose Division &amp; Athlete Details
              </h2>

              {cardNudge && (
                <p className="text-xs text-zt-muted bg-zt-inset border border-zt-border rounded-lg px-3 py-2">
                  This show lists {showFederation}. You have no membership card on your account yet; adding one on your{' '}
                  <Link href="/website/account" className="underline font-bold text-zt-text">Account page</Link> saves the promoter a
                  question at check-in. Optional; you can register either way.
                </p>
              )}

              <div className="space-y-2">
                <div id="reg-division-label" className="block text-xs font-extrabold uppercase text-zt-muted">
                  Select Division / Strength Group *
                </div>
                <div role="radiogroup" aria-labelledby="reg-division-label" className="grid grid-cols-1 gap-2.5">
                  {meet.divisions.map((div, index) => {
                    const selected = div.id === divisionId;
                    const weightSummary = div.targetWeights
                      .filter((t) => t.weight !== null)
                      .map((t) => `${t.eventName}: ${t.weight} lb`)
                      .join(' • ');

                    return (
                      <button
                        key={div.id}
                        ref={(el) => {
                          radioRefs.current[index] = el;
                        }}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        tabIndex={selected || (!divisionId && index === 0) ? 0 : -1}
                        onClick={() => setDivisionId(div.id)}
                        onKeyDown={(e) => onRadioKeyDown(e, index)}
                        className={`p-3.5 rounded-xl border-2 text-left transition ${
                          selected
                            ? 'bg-zt-primary/15 border-zt-primary text-zt-text'
                            : 'bg-zt-inset border-zt-border text-zt-text-2 hover:border-zt-border-strong'
                        }`}
                      >
                        <span className="block text-sm font-black text-zt-text">{div.name}</span>
                        {weightSummary && (
                          <span className="block text-xs font-semibold text-zt-muted mt-1">
                            Target Weights: {weightSummary}
                          </span>
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
                    className="block text-xs font-extrabold uppercase text-zt-muted mb-1"
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
                    className="block text-xs font-extrabold uppercase text-zt-muted mb-1"
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
                  className="block text-xs font-extrabold uppercase text-zt-muted mb-1"
                >
                  Emergency Contact (Name, Relationship &amp; Phone) *
                </label>
                <input
                  id="reg-emergency-contact"
                  type="text"
                  required
                  value={emergencyContact}
                  onChange={(e) => setEmergencyContact(e.target.value)}
                  placeholder="e.g. Taylor Demo (Spouse) 717-555-0199"
                  aria-describedby="reg-emergency-help"
                  className="w-full bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2.5 text-sm font-bold text-zt-text"
                />
                <p id="reg-emergency-help" className="text-xs text-zt-muted mt-1">
                  A name and a phone number with at least 7 digits. Only the promoter sees this.
                </p>
              </div>

              <fieldset className="bg-zt-inset border border-zt-border rounded-xl p-3.5">
                <legend className="text-xs font-extrabold uppercase text-zt-muted px-1">Athlete date of birth *</legend>
                <input
                  id="reg-date-of-birth"
                  type="date"
                  required
                  value={dateOfBirth}
                  max={todayIsoDate()}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  aria-label="Athlete date of birth"
                  aria-describedby="reg-dob-help"
                  className="w-full sm:w-64 bg-zt-panel border border-zt-border-strong rounded-xl px-3 py-2.5 text-sm font-bold text-zt-text"
                />
                <p id="reg-dob-help" className="text-xs text-zt-muted mt-1">
                  {ageOnMeetDay === null && 'Only the promoter sees this. Athletes under 18 on competition day are registered by a parent or legal guardian.'}
                  {ageOnMeetDay !== null && ageOnMeetDay < MIN_ATHLETE_AGE && (
                    <span className="text-amber-300 font-bold">
                      Age {Math.max(ageOnMeetDay, 0)} on competition day. Athletes must be at least {MIN_ATHLETE_AGE}. Contact the promoter about younger athletes.
                    </span>
                  )}
                  {isMinor && (
                    <span className="text-zt-text font-bold">
                      Age {ageOnMeetDay} on competition day. A parent or legal guardian must register the athlete and sign the waiver at check-in.
                    </span>
                  )}
                  {ageOnMeetDay !== null && ageOnMeetDay >= ADULT_AGE && `Age ${ageOnMeetDay} on competition day.`}
                </p>
                {isMinor && (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="reg-guardian-name" className="block text-xs font-extrabold uppercase text-zt-muted mb-1">
                        Parent / guardian full name *
                      </label>
                      <input
                        id="reg-guardian-name"
                        type="text"
                        value={guardianName}
                        onChange={(e) => setGuardianName(e.target.value)}
                        placeholder="e.g. Jordan Demo"
                        className="w-full bg-zt-panel border border-zt-border-strong rounded-xl px-3 py-2.5 text-sm font-bold text-zt-text"
                      />
                    </div>
                    <div>
                      <label htmlFor="reg-guardian-contact" className="block text-xs font-extrabold uppercase text-zt-muted mb-1">
                        Parent / guardian phone or email *
                      </label>
                      <input
                        id="reg-guardian-contact"
                        type="text"
                        value={guardianContact}
                        onChange={(e) => setGuardianContact(e.target.value)}
                        placeholder="717-555-0100 or guardian@example.com"
                        className="w-full bg-zt-panel border border-zt-border-strong rounded-xl px-3 py-2.5 text-sm font-bold text-zt-text"
                      />
                    </div>
                    <p className="sm:col-span-2 text-xs text-zt-muted">
                      By continuing you confirm you are the athlete&apos;s parent or legal guardian. You will accept the waiver on the
                      athlete&apos;s behalf in the next step and sign it on paper at check-in. The promoter sets the minimum age for
                      this competition. Only the promoter sees these details.
                    </p>
                  </div>
                )}
              </fieldset>

              <div className="bg-zt-inset border border-zt-border rounded-xl p-3.5 text-xs font-semibold text-zt-text-2">
                <strong className="text-zt-text uppercase">Entry Fee &amp; Payment Notice:</strong>{' '}
                Entry fee is{' '}
                <strong>{meet.listing.entryFeeDisplay || 'set by the promoter'}</strong>. No
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
                <span className="text-xs font-bold uppercase px-2 py-0.5 rounded bg-zt-inset border border-zt-border text-zt-muted">
                  Organizer: {meet.promoterDisplayName}
                </span>
              </div>

              <div className="bg-zt-inset border border-zt-border-strong rounded-xl p-4 max-h-80 overflow-y-auto space-y-2">
                {/* same renderer as /legal/waiver; the hash stored with the registration is of the raw file, not of this rendering */}
                <MarkdownBlocks blocks={parseMarkdown(renderedWaiver)} compact />
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
                  of injury, and agree to its terms for <strong>{meet.name}</strong>.
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
                    {meet.name} ({meet.date || 'date TBD'})
                  </dd>
                </div>
                <div className="flex justify-between gap-2 border-b border-zt-border pb-2">
                  <dt className="font-bold text-zt-muted">Selected Division</dt>
                  <dd className="font-black text-zt-primary">{selectedDivision?.name ?? divisionId}</dd>
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
                  <dt className="font-bold text-zt-muted">Date of birth</dt>
                  <dd className="font-bold text-zt-text">
                    {dateOfBirth}
                    {ageOnMeetDay !== null && ` (${ageOnMeetDay} on competition day)`}
                    {isMinor && `, registered by ${guardianName} (${guardianContact}); guardian signs at check-in`}
                  </dd>
                </div>
                <div className="flex justify-between gap-2 border-b border-zt-border pb-2">
                  <dt className="font-bold text-zt-muted">Waiver Acceptance</dt>
                  <dd className="font-black text-emerald-400">Accepted (timestamped on submit)</dd>
                </div>
                <div className="flex justify-between gap-2 pt-1">
                  <dt className="font-bold text-zt-muted">Entry Fee</dt>
                  <dd className="font-bold text-zt-text">
                    {meet.listing.entryFeeDisplay || 'Not provided'}; the promoter collects payment
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
          {step === 4 && submitted && (
            <section className="bg-zt-surface border-2 border-emerald-500/60 rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2.5 text-emerald-400">
                <CheckCircle2 className="w-6 h-6 flex-shrink-0" aria-hidden="true" />
                <div>
                  <div className="text-xs font-black uppercase tracking-widest">Registration Submitted</div>
                  <h2 className="text-xl font-black text-zt-text">
                    Status: {submitted.status === 'waitlist' ? 'WAITLISTED' : submitted.status === 'accepted' ? 'ACCEPTED' : 'PENDING'}
                  </h2>
                </div>
              </div>

              <p className="text-xs sm:text-sm text-zt-text-2 leading-relaxed">
                Your request for <strong>{meet.name}</strong> in{' '}
                <strong>{selectedDivision?.name ?? divisionId}</strong> has been recorded as{' '}
                <strong className={submitted.status === 'accepted' ? 'text-emerald-300' : 'text-amber-300'}>{submitted.status === 'waitlist' ? 'waitlisted' : submitted.status}</strong>.
                {submitted.status === 'waitlist'
                  ? ' The promoter will contact you if a spot opens.'
                  : submitted.status === 'accepted'
                    ? ' You are on the roster.'
                    : ' Once the promoter accepts your entry, your name is added to the meet roster.'}
                {emailNote ? ` ${emailNote}` : ''}
              </p>

              {!isLiveBackend() && (
                <p className="text-xs font-bold text-amber-300 bg-amber-500/10 border border-amber-500/40 rounded-xl px-3 py-2">
                  {PREVIEW_NOTICE}
                </p>
              )}

              <div className="bg-zt-inset border border-zt-border rounded-xl p-4 space-y-1.5 text-xs">
                <div>
                  <strong className="text-zt-muted uppercase">Registration ID:</strong>{' '}
                  <code className="font-mono text-zt-text">{submitted.id}</code>
                </div>
                <div>
                  <strong className="text-zt-muted uppercase">Entry Fee &amp; Payment:</strong>{' '}
                  <span className="font-bold text-zt-text">
                    {meet.listing.entryFeeDisplay || 'Standard entry fee'}; the promoter will collect payment directly.
                  </span>
                </div>
                <div>
                  <strong className="text-zt-muted uppercase">Promoter Contact:</strong>{' '}
                  <span className="font-bold text-zt-primary">
                    {meet.promoterDisplayName} ({promoterContactDisplay})
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                {!isLiveBackend() && (
                  <Link
                    href="/promoter"
                    className="px-4 py-2.5 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase"
                  >
                    Open the preview dashboard (same tab)
                  </Link>
                )}
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

function BackToShows() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Link
        href="/shows"
        className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase text-zt-muted hover:text-zt-text"
      >
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
        Back to Strongman Shows
      </Link>
    </div>
  );
}
