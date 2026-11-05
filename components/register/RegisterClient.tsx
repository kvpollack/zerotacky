'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Cap, WebCell, keyClass, textLink } from '@/components/website/sheet';
import { longIsoDate } from '@/lib/website/sheetFormat';
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

// UI transition (11/4, hand redraw after the route sweep): the page is drawn in the sheet grammar instead of leaning on
// the [data-zt-sheet] bridge. Band + facts strip as on the show page, the four steps as one ruled strip (active cell
// filled ink, finished cells in pen), every form as a ruled block of label-over-input cells, keys for the actions
// (pen for the one that moves the athlete forward), text links for back. The flow, ids, roles and copy are unchanged.
const INPUT = 'zt-input w-full';
const BODY = 'text-[15px] leading-snug text-ink';
const NOTE = 'text-[13px] leading-snug text-ink-muted';
const CELL_PAD = 'px-4 py-3 sm:px-5 sm:py-3.5 min-w-0';
const CELL = `flex flex-col gap-1.5 ${CELL_PAD}`;
const FACT_V = 'text-[15px] font-bold leading-snug text-ink';
const FACT_S = 'block text-[13px] font-normal text-ink-muted break-words';
const STEPS: Array<{ s: Step; label: string }> = [
  { s: 1, label: 'Division & info' },
  { s: 2, label: 'Waiver' },
  { s: 3, label: 'Review' },
  { s: 4, label: 'Confirmation' },
];

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
      <div className="max-w-3xl flex flex-col gap-6">
        <BackToShows />
        <section className="zt-block" aria-busy="true">
          <div className={`${CELL} py-6`}><p className={NOTE}>Loading competition…</p></div>
        </section>
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div className="max-w-3xl flex flex-col gap-6">
        <BackToShows />
        <section role="alert" className="zt-block">
          <div className={`${CELL} py-6`}>
            <Cap as="h2">Registration</Cap>
            <h1 className="text-[28px] font-bold leading-tight text-ink">Could not load this competition</h1>
            <p className={`${BODY} font-bold`}>{loadError}</p>
          </div>
        </section>
      </div>
    );
  }

  if (loadState === 'missing' || !meet) {
    return (
      <div className="max-w-3xl flex flex-col gap-6">
        <BackToShows />
        <section className="zt-block">
          <div className={`${CELL} py-6 gap-3`}>
            <Cap as="h2">Registration</Cap>
            <h1 className="text-[28px] font-bold leading-tight text-ink">No competition found for this registration link</h1>
            <p className={BODY}>
              Check the link from the promoter, or browse the shows list.
              {!isLiveBackend() && ' Meets created in the preview dashboard exist only in the browser tab that created them.'}
            </p>
            <Link href="/shows" className={keyClass('ink', 'self-start')}>Browse Shows</Link>
          </div>
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
    <div className="max-w-3xl flex flex-col gap-6">
      <BackToShows />

      {/* Band + facts strip, as on the show page (the slot colour defaults to ink here) */}
      <section aria-label="Competition">
        <div className="bg-slot text-slot-label border-2 border-b-0 border-rule flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-5 sm:px-6 min-h-16 py-3 text-[15px] leading-snug">
          <h1 className="font-normal">
            <span className="font-bold text-xl sm:text-[22px]">{meet.name}</span>
            <span className="opacity-60 mx-3" aria-hidden="true">·</span>
            <span>{meet.date ? longIsoDate(meet.date) : 'Date TBD'}</span>
            <span className="opacity-60 mx-3" aria-hidden="true">·</span>
            <span>{venueDisplay}</span>
          </h1>
          <div className="text-[13px] uppercase tracking-[0.04em]">
            <span>Competition: {life.competitionLabel}</span>
            <span className="opacity-60 mx-3" aria-hidden="true">·</span>
            <span>Registration: {life.registrationLabel}</span>
            {meet.listing.federation && (
              <>
                <span className="opacity-60 mx-3" aria-hidden="true">·</span>
                <span>{meet.listing.federation}</span>
              </>
            )}
          </div>
        </div>
        <div className="zt-block border-t-0 grid-cols-2 sm:grid-cols-4">
          <WebCell pad="sm" className="min-h-[84px] justify-center gap-1 px-4">
            <Cap>Entry fee</Cap>
            <div className={FACT_V}>{meet.listing.entryFeeDisplay || 'Collected by promoter'}</div>
          </WebCell>
          <WebCell pad="sm" className="min-h-[84px] justify-center gap-1 px-4">
            <Cap>Registration deadline</Cap>
            <div className={FACT_V}>{meet.listing.registrationDeadline ? longIsoDate(meet.listing.registrationDeadline) : regOpen ? 'Open until filled' : 'Closed'}</div>
          </WebCell>
          <WebCell pad="sm" className="min-h-[84px] justify-center gap-1 px-4">
            <Cap>Capacity</Cap>
            <div className={FACT_V}>{capacityDisplay}</div>
          </WebCell>
          <WebCell pad="sm" className="min-h-[84px] justify-center gap-1 px-4">
            <Cap>Promoter</Cap>
            <div className={FACT_V}>
              {meet.promoterDisplayName}
              <span className={FACT_S}>{promoterContactDisplay}</span>
            </div>
          </WebCell>
        </div>
      </section>

      {!isLiveBackend() && <p className={`${NOTE} font-bold`}>{PREVIEW_NOTICE}</p>}

      {waiverError ? (
        <section role="alert" className="zt-block">
          <div className={`${CELL} py-6 gap-3`}>
            <Cap as="h2">Registration unavailable</Cap>
            <p className={`${BODY} font-bold`}>{waiverError}</p>
            <p className={NOTE}>
              Athletes must accept the waiver to register, so the form is hidden until the waiver text is available.
              Contact the promoter ({promoterContactDisplay}) in the meantime.
            </p>
          </div>
        </section>
      ) : gate.status === null ? (
        <section className="zt-block">
          <div className={`${CELL} py-6 gap-3`}>
            <Cap as="span">Registration</Cap>
            <h2 className="text-[28px] font-bold leading-tight text-ink">
              {regOpen ? 'Registration is not taking entries' : life.registrationLabel}
            </h2>
            <p className={BODY}>{gate.error}</p>
            <p className={NOTE}>Promoter: {meet.promoterDisplayName} ({promoterContactDisplay}).</p>
            <Link href="/shows" className={keyClass('ink', 'self-start mt-1')}>Browse Other Shows</Link>
          </div>
        </section>
      ) : (
        <>
          {gate.status === 'waitlist' && step < 4 && (
            <p className={`${BODY} font-bold`}>
              {gate.reason === 'full'
                ? `This show is full (${capacityDisplay}). You can still register: your entry goes on the waitlist and the promoter decides if a spot opens.`
                : 'This competition is taking waitlist entries only. Your request will be marked waitlisted and the promoter decides if a spot opens.'}
            </p>
          )}

          {/* Step strip */}
          <ol className="zt-block grid-cols-2 sm:grid-cols-4" aria-label="Registration steps">
            {STEPS.map((item) => {
              const active = step === item.s;
              const done = step > item.s;
              const tone = active ? 'text-sheet' : done ? 'text-pen' : 'text-ink-muted';
              return (
                <li
                  key={item.s}
                  aria-current={active ? 'step' : undefined}
                  style={active ? { background: 'var(--ink)' } : undefined}
                  className={`flex flex-col justify-center gap-0.5 px-4 py-3 min-h-14 ${tone}`}
                >
                  <span className={`text-xs uppercase tracking-[0.06em] ${active ? 'opacity-70' : ''}`}>
                    Step {item.s}{done ? ' · done' : ''}
                  </span>
                  <span className="text-[13px] font-bold uppercase tracking-[0.04em] leading-tight">{item.label}</span>
                </li>
              );
            })}
          </ol>

          {error && (
            <div role="alert" className={`${BODY} font-bold`}>{error}</div>
          )}

          {/* STEP 0: ACCOUNT. Registration is tied to a ZeroTacky account. */}
          {step === 1 && isLiveBackend() && auth.loading && (
            <section className="zt-block">
              <div className={CELL}><p className="text-[13px] uppercase tracking-[0.04em] text-ink-muted">Checking your session…</p></div>
            </section>
          )}
          {step === 1 && needsAccount && !auth.loading && (
            <section aria-labelledby="reg-account-heading" className="zt-block">
              <div className={`${CELL} py-5 gap-3`}>
                <Cap as="span">Step 1</Cap>
                <h2 id="reg-account-heading" className="text-[22px] font-bold leading-tight text-ink">Your ZeroTacky account</h2>
                <p className={`${BODY} max-w-2xl`}>
                  Registering takes a free account. Your entry is tied to it, so you can follow its status on My Meets and
                  every show you compete in builds your record. Create one here, or sign in if you already have one; you
                  stay on this page. Under 18? A parent or guardian creates the account and registers you.
                </p>
              </div>
              <div className={`${CELL} py-5`}>
                <div className="max-w-xl">
                  <SignInForm auth={auth} defaultMode="signup" returnTo={`/register/${slug}`} idPrefix="reg-acct" />
                </div>
              </div>
            </section>
          )}

          {/* STEP 1: DIVISION & ATHLETE DETAILS */}
          {step === 1 && !needsAccount && !(isLiveBackend() && auth.loading) && (
            <form onSubmit={goToStep2} className="flex flex-col gap-4">
              <div className="zt-block grid-cols-1 sm:grid-cols-2">
                <div className={`${CELL} col-span-full py-4 gap-1`}>
                  <Cap as="span">Step 1</Cap>
                  <h2 className="text-[22px] font-bold leading-tight text-ink">Choose division &amp; athlete details</h2>
                  {cardNudge && (
                    <p className={`${NOTE} mt-1`}>
                      This show lists {showFederation}. You have no membership card on your account yet; adding one on your{' '}
                      <Link href="/website/account" className={textLink}>Account page</Link> saves the promoter a
                      question at check-in. Optional; you can register either way.
                    </p>
                  )}
                </div>

                <div className={`${CELL} col-span-full`}>
                  <Cap id="reg-division-label" as="span">Select division / strength group *</Cap>
                  <div role="radiogroup" aria-labelledby="reg-division-label" className="flex flex-col gap-2 mt-0.5">
                    {meet.divisions.map((div, index) => {
                      const selected = div.id === divisionId;
                      const weightSummary = div.targetWeights
                        .filter((t) => t.weight !== null)
                        .map((t) => `${t.eventName}: ${t.weight} lb`)
                        .join(' · ');

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
                          className={keyClass(selected ? 'ink' : 'line', 'w-full min-h-12 flex-col items-start gap-0 leading-tight py-2 text-left')}
                        >
                          <span>{div.name}</span>
                          {weightSummary && (
                            <span className="text-[12px] normal-case font-normal tracking-normal opacity-80">Target weights: {weightSummary}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className={CELL}>
                  <label htmlFor="reg-athlete-name"><Cap as="span">Athlete full name *</Cap></label>
                  <input
                    id="reg-athlete-name"
                    type="text"
                    required
                    value={athleteName}
                    onChange={(e) => setAthleteName(e.target.value)}
                    placeholder="e.g. Jordan Demo"
                    className={INPUT}
                  />
                </div>

                <div className={CELL}>
                  <label htmlFor="reg-athlete-email"><Cap as="span">Email address *</Cap></label>
                  <input
                    id="reg-athlete-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="athlete@example.com"
                    className={INPUT}
                  />
                </div>

                <div className={`${CELL} col-span-full`}>
                  <label htmlFor="reg-emergency-contact"><Cap as="span">Emergency contact (name, relationship &amp; phone) *</Cap></label>
                  <input
                    id="reg-emergency-contact"
                    type="text"
                    required
                    value={emergencyContact}
                    onChange={(e) => setEmergencyContact(e.target.value)}
                    placeholder="e.g. Taylor Demo (Spouse) 717-555-0199"
                    aria-describedby="reg-emergency-help"
                    className={INPUT}
                  />
                  <p id="reg-emergency-help" className={NOTE}>
                    A name and a phone number with at least 7 digits. Only the promoter sees this.
                  </p>
                </div>

                <div role="group" aria-labelledby="reg-dob-label" className={`${CELL} col-span-full`}>
                  <label htmlFor="reg-date-of-birth"><Cap id="reg-dob-label" as="span">Athlete date of birth *</Cap></label>
                  <input
                    id="reg-date-of-birth"
                    type="date"
                    required
                    value={dateOfBirth}
                    max={todayIsoDate()}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    aria-label="Athlete date of birth"
                    aria-describedby="reg-dob-help"
                    className={`${INPUT} sm:w-64`}
                  />
                  <p id="reg-dob-help" className={NOTE}>
                    {ageOnMeetDay === null && 'Only the promoter sees this. Athletes under 18 on competition day are registered by a parent or legal guardian.'}
                    {ageOnMeetDay !== null && ageOnMeetDay < MIN_ATHLETE_AGE && (
                      <span className="text-ink font-bold">
                        Age {Math.max(ageOnMeetDay, 0)} on competition day. Athletes must be at least {MIN_ATHLETE_AGE}. Contact the promoter about younger athletes.
                      </span>
                    )}
                    {isMinor && (
                      <span className="text-ink font-bold">
                        Age {ageOnMeetDay} on competition day. A parent or legal guardian must register the athlete and sign the waiver at check-in.
                      </span>
                    )}
                    {ageOnMeetDay !== null && ageOnMeetDay >= ADULT_AGE && `Age ${ageOnMeetDay} on competition day.`}
                  </p>
                  {isMinor && (
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor="reg-guardian-name"><Cap as="span">Parent / guardian full name *</Cap></label>
                        <input
                          id="reg-guardian-name"
                          type="text"
                          value={guardianName}
                          onChange={(e) => setGuardianName(e.target.value)}
                          placeholder="e.g. Jordan Demo"
                          className={INPUT}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor="reg-guardian-contact"><Cap as="span">Parent / guardian phone or email *</Cap></label>
                        <input
                          id="reg-guardian-contact"
                          type="text"
                          value={guardianContact}
                          onChange={(e) => setGuardianContact(e.target.value)}
                          placeholder="717-555-0100 or guardian@example.com"
                          className={INPUT}
                        />
                      </div>
                      <p className={`sm:col-span-2 ${NOTE}`}>
                        By continuing you confirm you are the athlete&apos;s parent or legal guardian. You will accept the waiver on the
                        athlete&apos;s behalf in the next step and sign it on paper at check-in. The promoter sets the minimum age for
                        this competition. Only the promoter sees these details.
                      </p>
                    </div>
                  )}
                </div>

                <div className={`${CELL} col-span-full`}>
                  <Cap as="span">Entry fee &amp; payment notice</Cap>
                  <p className={BODY}>
                    Entry fee is <strong>{meet.listing.entryFeeDisplay || 'set by the promoter'}</strong>. No
                    online payment is collected on this form; the promoter will collect payment directly.
                  </p>
                </div>
              </div>

              <div className="flex justify-end">
                <button type="submit" className={keyClass('pen')}>Continue to waiver →</button>
              </div>
            </form>
          )}

          {/* STEP 2: FULL WAIVER TEXT & ACCEPTANCE */}
          {step === 2 && (
            <form onSubmit={goToStep3} className="flex flex-col gap-4">
              <div className="zt-block">
                <div className={`${CELL} py-4 gap-1`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <Cap as="span">Step 2</Cap>
                    <Cap as="span">Organizer: {meet.promoterDisplayName}</Cap>
                  </div>
                  <h2 className="text-[22px] font-bold leading-tight text-ink">Assumption of risk &amp; liability waiver</h2>
                </div>

                <div className={`${CELL} py-4 max-h-80 overflow-y-auto`}>
                  {/* same renderer as /legal/waiver; the hash stored with the registration is of the raw file, not of this rendering */}
                  <MarkdownBlocks blocks={parseMarkdown(renderedWaiver)} compact />
                </div>

                <label className={`${CELL_PAD} flex items-start gap-3 cursor-pointer`}>
                  <input
                    type="checkbox"
                    checked={waiverAccepted}
                    onChange={(e) => setWaiverAccepted(e.target.checked)}
                    className="mt-1 w-5 h-5 shrink-0"
                    style={{ accentColor: 'var(--pen)' }}
                  />
                  <span className={`${BODY} font-bold`}>
                    I have read the full Assumption of Risk and Release of Liability Waiver above,
                    understand that competing in strongman involves heavy implements and inherent risk
                    of injury, and agree to its terms for <strong>{meet.name}</strong>.
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setStep(1);
                  }}
                  className={`${textLink} text-[13px]`}
                >
                  ← Back
                </button>
                <button type="submit" className={keyClass('pen')}>Review registration →</button>
              </div>
            </form>
          )}

          {/* STEP 3: REVIEW & SUBMIT */}
          {step === 3 && (
            // A real form like steps 1 and 2 (Astra BR-09): Enter anywhere in the review submits, the key is type=submit.
            <form
              className="flex flex-col gap-4"
              aria-label="Review and submit registration"
              onSubmit={(e) => {
                e.preventDefault();
                if (!submitting) void handleFinalSubmit();
              }}
            >
              <div className="zt-block">
                <div className={`${CELL} py-4 gap-1`}>
                  <Cap as="span">Step 3</Cap>
                  <h2 className="text-[22px] font-bold leading-tight text-ink">Review &amp; submit registration</h2>
                </div>
                <dl className="contents">
                  <ReviewRow label="Competition">{meet.name} ({meet.date ? longIsoDate(meet.date) : 'date TBD'})</ReviewRow>
                  <ReviewRow label="Selected division" pen>{selectedDivision?.name ?? divisionId}</ReviewRow>
                  <ReviewRow label="Athlete name">{athleteName}</ReviewRow>
                  <ReviewRow label="Email">{email}</ReviewRow>
                  <ReviewRow label="Emergency contact">{emergencyContact}</ReviewRow>
                  <ReviewRow label="Date of birth">
                    {dateOfBirth}
                    {ageOnMeetDay !== null && ` (${ageOnMeetDay} on competition day)`}
                    {isMinor && `, registered by ${guardianName} (${guardianContact}); guardian signs at check-in`}
                  </ReviewRow>
                  <ReviewRow label="Waiver acceptance" pen>Accepted (timestamped on submit)</ReviewRow>
                  <ReviewRow label="Entry fee">{meet.listing.entryFeeDisplay || 'Not provided'}; the promoter collects payment</ReviewRow>
                </dl>
              </div>

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setError(null);
                    setStep(2);
                  }}
                  className={`${textLink} text-[13px] disabled:opacity-40`}
                >
                  ← Back to waiver
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={keyClass('pen', 'disabled:opacity-40 disabled:cursor-not-allowed')}
                >
                  {submitting ? 'Submitting…' : 'Submit registration'}
                </button>
              </div>
            </form>
          )}

          {/* STEP 4: CONFIRMATION */}
          {step === 4 && submitted && (
            <section className="zt-block">
              <div className={`${CELL} py-5 gap-1`}>
                <Cap as="span">Registration submitted</Cap>
                <h2 className="text-[28px] font-bold leading-tight text-ink">
                  Status: <span className="text-pen">{submitted.status === 'waitlist' ? 'WAITLISTED' : submitted.status === 'accepted' ? 'ACCEPTED' : 'PENDING'}</span>
                </h2>
                <p className={`${BODY} mt-1`}>
                  Your request for <strong>{meet.name}</strong> in{' '}
                  <strong>{selectedDivision?.name ?? divisionId}</strong> has been recorded as{' '}
                  <strong className="text-pen">{submitted.status === 'waitlist' ? 'waitlisted' : submitted.status}</strong>.
                  {submitted.status === 'waitlist'
                    ? ' The promoter will contact you if a spot opens.'
                    : submitted.status === 'accepted'
                      ? ' You are on the roster.'
                      : ' Once the promoter accepts your entry, your name is added to the meet roster.'}
                  {emailNote ? ` ${emailNote}` : ''}
                </p>
                {!isLiveBackend() && <p className={`${NOTE} font-bold`}>{PREVIEW_NOTICE}</p>}
              </div>

              <dl className="contents">
                <ReviewRow label="Registration ID"><code className="font-mono text-[14px]">{submitted.id}</code></ReviewRow>
                <ReviewRow label="Entry fee &amp; payment">{meet.listing.entryFeeDisplay || 'Standard entry fee'}; the promoter will collect payment directly.</ReviewRow>
                <ReviewRow label="Promoter contact">{meet.promoterDisplayName} ({promoterContactDisplay})</ReviewRow>
              </dl>

              <div className={`${CELL_PAD} flex flex-wrap items-center gap-3 py-4`}>
                <Link href="/shows" className={keyClass('ink')}>Back to Shows</Link>
                {!isLiveBackend() && (
                  <Link href="/promoter" className={keyClass('line')}>Open the preview dashboard (same tab)</Link>
                )}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** One ruled row of the review list: cap on the left, value on the right (pen when it is the athlete's choice). */
function ReviewRow({ label, children, pen }: { label: React.ReactNode; children: React.ReactNode; pen?: boolean }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[180px_minmax(0,1fr)] gap-x-4 gap-y-0.5 px-4 py-2.5 sm:px-5">
      <dt className="text-xs tracking-[0.06em] uppercase text-ink-muted self-center">{label}</dt>
      <dd className={`text-[15px] font-bold leading-snug break-words ${pen ? 'text-pen' : 'text-ink'}`}>{children}</dd>
    </div>
  );
}

function BackToShows() {
  return (
    <div>
      <Link href="/shows" className="inline-flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-[0.04em] text-ink-muted hover:text-ink no-underline">
        <span aria-hidden="true">←</span>
        Back to Strongman Shows
      </Link>
    </div>
  );
}
