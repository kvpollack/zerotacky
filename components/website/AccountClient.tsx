'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Cap, keyClass, textLink } from '@/components/website/sheet';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/useAuth';
import SignInForm, { takeReturnTo } from '@/components/auth/SignInForm';
import { FAVORITE_LIFT_OPTIONS, MAX_PRS, SOCIAL_KEYS, USERNAME_MAX, athleteProfilePath, normalizeUsername, profileLabel, roleBadges, usernameProblem, type Profile, type ProfilePR, type ProfileSocials } from '@/lib/auth/profile';
import { AVATAR_MAX_BYTES, avatarProblem } from '@/lib/auth/avatar';
import { aboutFromProfile, aboutKey, reconcileAbout, type AboutDraft } from '@/lib/auth/profileDraft';
import { fetchIsAdmin } from '@/lib/website/myGym';
import { getSupabase } from '@/lib/auth/supabaseBrowser';
import HostGymPicker from '@/components/promoter/HostGymPicker';
import MembershipCardsSection from '@/components/website/MembershipCardsSection';
import MyClaimsSection from '@/components/website/MyClaimsSection';

// Real account page (v2): sign in / create account / magic link, then a profile editor. The three role flags
// are self-declared and only shape what the site shows; meet access is decided by meets.owner_id / meet_members.
// Hand redraw in the sheet grammar (11/4): ruled .zt-block cells with a cap over each input, pen keys for the one
// primary action per form, line keys for the rest, text links for quiet actions. No icons, no tinted boxes.
const INPUT = 'zt-input w-full';
const CELL = 'flex flex-col gap-1.5 px-4 py-3 sm:px-5 sm:py-3.5 min-w-0';
const NOTE = 'text-[13px] leading-snug text-ink-muted';
const H1 = 'text-[28px] sm:text-[34px] font-bold leading-[1.05] text-ink';
const H2 = 'text-[22px] font-bold leading-tight text-ink';
const CHECK = { accentColor: 'var(--pen)' } as const;

// Notices are plain bold ink: the sheet has no tinted boxes, the words carry the tone.
function Notice({ text }: { text: string; tone: 'ok' | 'warn' }) {
  return <div role="status" className="text-[15px] font-bold text-ink">{text}</div>;
}

function errText(e: unknown): string {
  return e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e);
}

// Set / change password. Used right after a reset link (recovery) and from the signed-in page. Supabase's
// updateUser({ password }) needs a live session, which the reset link provides.
function PasswordPanel({ recovery, busy, onSubmit, onDismiss }: {
  recovery: boolean; busy: boolean; onSubmit: (pw: string, current?: string) => Promise<boolean>; onDismiss?: () => void;
}) {
  const [pw0, setPw0] = useState('');   // current password; asked only for an ordinary signed-in change (R-L1)
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [localErr, setLocalErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalErr(null);
    if (!recovery && pw0.length === 0) { setLocalErr('Enter your current password first.'); return; }
    if (pw1.length < 8) { setLocalErr('Password needs at least 8 characters.'); return; }
    if (pw1 !== pw2) { setLocalErr('The two passwords do not match.'); return; }
    const ok = await onSubmit(pw1, recovery ? undefined : pw0);
    if (ok) { setPw0(''); setPw1(''); setPw2(''); }
  };
  return (
    <section aria-labelledby="pw-heading" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Cap as="span" className={recovery ? 'text-pen' : undefined}>{recovery ? 'Password reset' : 'Password'}</Cap>
        <h2 id="pw-heading" className={H2}>{recovery ? 'Set a new password' : 'Change password'}</h2>
        <p className={`${NOTE} max-w-2xl`}>
          {recovery
            ? 'You arrived from a password reset link. Choose a new password to finish; you are already signed in on this device.'
            : 'Enter your current password, then the new one. You stay signed in here; other devices keep their session until they next refresh.'}
        </p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4 max-w-md">
        <div className="zt-block grid-cols-1">
          {!recovery && (
            <div className={CELL}>
              <label htmlFor="pw-current"><Cap as="span">Current password</Cap></label>
              <input id="pw-current" type="password" required value={pw0} onChange={(e) => setPw0(e.target.value)} className={INPUT} autoComplete="current-password" />
            </div>
          )}
          <div className={CELL}>
            <label htmlFor="pw-new"><Cap as="span">New password (8+ characters)</Cap></label>
            <input id="pw-new" type="password" required minLength={8} value={pw1} onChange={(e) => setPw1(e.target.value)} className={INPUT} autoComplete="new-password" />
          </div>
          <div className={CELL}>
            <label htmlFor="pw-confirm"><Cap as="span">Confirm new password</Cap></label>
            <input id="pw-confirm" type="password" required minLength={8} value={pw2} onChange={(e) => setPw2(e.target.value)} className={INPUT} autoComplete="new-password" />
          </div>
        </div>
        {localErr && <Notice text={localErr} tone="warn" />}
        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" disabled={busy} className={keyClass('pen', 'disabled:opacity-40')}>
            {recovery ? 'Save new password' : 'Update password'}
          </button>
          {onDismiss && (
            <button type="button" disabled={busy} onClick={onDismiss} className={`text-[13px] ${textLink} disabled:opacity-40`}>{recovery ? 'Keep my current password' : 'Cancel'}</button>
          )}
        </div>
      </form>
    </section>
  );
}

// Shows the claims-queue link only to zt_admins rows; the page itself refuses everyone else, this is just tidiness.
function AdminLink() {
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    let alive = true;
    void fetchIsAdmin(sb).then((v) => { if (alive) setAdmin(v); });
    return () => { alive = false; };
  }, []);
  if (!admin) return null;
  return (
    <>
      <Link href="/website/admin/claims" className={keyClass('line')}>Gym claims queue</Link>
      <Link href="/website/admin/shows" className={keyClass('line')}>Show listings queue</Link>
    </>
  );
}

export default function AccountClient() {
  const auth = useAuth();
  const router = useRouter();
  // Back to where the sign-in started (the registration page, 10/21): SignInForm remembers it before any email round
  // trip, so a confirmation or magic link that lands here carries on to the show instead of stranding the athlete.
  // Recovery first (Astra HI-M1): a reset link lands here with auth.recovery true, and Set a new password must win;
  // the return target is consumed once recovery clears (password saved or dismissed).
  useEffect(() => {
    if (!auth.user || auth.recovery) return;
    const back = takeReturnTo();
    if (back && back !== '/website/account') router.replace(back);
  }, [auth.user, auth.recovery, router]);
  // A dead email link (expired, or already used, often by a mail scanner or a second click) comes back from Supabase
  // with ?error=...&error_code=otp_expired or the same in the hash. Say so instead of showing a bare sign-in form
  // (Kurt 10/21, after clicking a stale confirmation email).
  const [linkError, setLinkError] = useState<string | null>(null);
  useEffect(() => {
    const read = (q: string) => new URLSearchParams(q.replace(/^[#?]/, ''));
    const h = read(window.location.hash), q = read(window.location.search);
    const code = h.get('error_code') || q.get('error_code');
    const desc = h.get('error_description') || q.get('error_description');
    if (!code && !desc && !h.get('error') && !q.get('error')) return;
    setLinkError(code === 'otp_expired'
      ? 'That email link has expired or was already used. Request a new one below and open the newest email.'
      : `That email link did not work${desc ? `: ${desc.replace(/\+/g, ' ')}` : ''}. Request a new one below.`);
    window.history.replaceState(null, '', window.location.pathname);
  }, []);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // profile editor
  const [draftName, setDraftName] = useState('');
  const [athlete, setAthlete] = useState(false);
  const [promoter, setPromoter] = useState(false);
  const [gymOwner, setGymOwner] = useState(false);
  const [about, setAbout] = useState<AboutDraft | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // Public profile (020): username saves on its own (RPC), the visibility switch saves right away too.
  const [draftUsername, setDraftUsername] = useState('');
  const [usernameBusy, setUsernameBusy] = useState(false);
  const [usernameNote, setUsernameNote] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null);
  // Reconcile drafts field by field (Astra AD-M1, 10/21). The username form and the visibility switch save on their own
  // and replace auth.profile; resetting every draft on that change threw away unsaved edits in the main form. Now a
  // draft only follows the profile when its own stored value changed (or the account changed).
  const prevProfileRef = useRef<Profile | null>(null);
  useEffect(() => {
    const next = auth.profile;
    if (!next) { prevProfileRef.current = null; return; }
    const prev = prevProfileRef.current;
    prevProfileRef.current = next;
    const fresh = !prev || prev.id !== next.id;
    if (fresh || prev.username !== next.username) setDraftUsername(next.username ?? '');
    if (fresh || prev.display_name !== next.display_name) setDraftName(next.display_name);
    if (fresh || prev.is_athlete !== next.is_athlete) setAthlete(next.is_athlete);
    if (fresh || prev.is_promoter !== next.is_promoter) setPromoter(next.is_promoter);
    if (fresh || prev.is_gym_owner !== next.is_gym_owner) setGymOwner(next.is_gym_owner);
    // About you reconciles member by member (Astra AD-M1 retest): a saved home gym in another tab must not reset an
    // unsaved location here. PR rows and social links are their own members.
    if (fresh) setAbout(aboutFromProfile(next));
    else setAbout((cur) => reconcileAbout(cur, prev, next));
  }, [auth.profile]);
  const patchAbout = (patch: Partial<AboutDraft>) => setAbout((a) => (a ? { ...a, ...patch } : a));
  const patchPR = (i: number, patch: Partial<ProfilePR>) => setAbout((a) => {
    if (!a) return a;
    const prs = a.prs.map((pr, j) => (j === i ? { ...pr, ...patch } : pr));
    return { ...a, prs };
  });
  const patchSocial = (key: keyof ProfileSocials, value: string) => setAbout((a) => (a ? { ...a, socials: { ...a.socials, [key]: value } } : a));

  const onPickAvatar = async (file: File | undefined) => {
    if (!file) return;
    const problem = avatarProblem(file);
    if (problem) { setNotice({ text: problem, tone: 'warn' }); return; }
    setAvatarBusy(true);
    setNotice(null);
    try {
      await auth.setAvatar(file);
      setNotice({ text: 'Photo updated', tone: 'ok' });
    } catch (e) {
      setNotice({ text: errText(e), tone: 'warn' });
    } finally {
      setAvatarBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // Supabase puts auth errors (expired link, etc.) in the URL hash.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const h = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const desc = h.get('error_description');
    if (desc) {
      setNotice({ text: desc.replace(/\+/g, ' '), tone: 'warn' });
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  const run = async (fn: () => Promise<string | void>): Promise<boolean> => {
    setBusy(true);
    setNotice(null);
    try {
      const msg = await fn();
      if (msg) setNotice({ text: msg, tone: 'ok' });
      return true;
    } catch (e) {
      setNotice({ text: errText(e), tone: 'warn' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (!auth.enabled) {
    return (
      <section className="flex flex-col gap-2">
        <Cap as="span">Account</Cap>
        <h1 className={H1}>Account</h1>
        <p className={`${NOTE} max-w-2xl`}>Accounts are not configured on this build. The scorer still works offline from <Link href="/scorer" className={textLink}>/scorer</Link>.</p>
      </section>
    );
  }

  if (auth.loading) {
    return (
      <section className="zt-block grid-cols-1">
        <div className={`${CELL} py-6`}><Cap as="span">Checking your session…</Cap></div>
      </section>
    );
  }

  if (!auth.user) {
    return (
      <div className="flex flex-col gap-6 max-w-xl">
        <div className="flex flex-col gap-2">
          <Cap as="span">Account · sign in</Cap>
          <h1 className={H1}>Your ZeroTacky account</h1>
          <p className={`text-[15px] leading-relaxed text-ink`}>
            One account covers everything you do in strongman, whether you compete, run shows or list a gym. If you
            promote, the meets you publish belong to this account and follow you from phone to phone.
          </p>
        </div>
        {linkError && <Notice text={linkError} tone="warn" />}
        <SignInForm auth={auth} />
        <p className={NOTE}>
          Meet-day volunteers do not need an account: judges and pit crew join with the meet code on <Link href="/join" className={textLink}>Join a Meet</Link>.
        </p>
      </div>
    );
  }

  const p = auth.profile;
  const badges = roleBadges(p);
  const aboutDirty = p && about ? aboutKey(about) !== aboutKey(aboutFromProfile(p)) : false;
  const dirty = p ? draftName !== p.display_name || athlete !== p.is_athlete || promoter !== p.is_promoter || gymOwner !== p.is_gym_owner || aboutDirty : false;
  const avatarSrc = p?.avatar_path ? auth.avatarUrl(p.avatar_path) : '';
  const roleRows: Array<{ id: string; label: string; hint: string; value: boolean; set: (v: boolean) => void }> = [
    { id: 'athlete', label: 'Athlete', hint: 'Register for shows and keep your competition history in one place.', value: athlete, set: setAthlete },
    { id: 'promoter', label: 'Promoter', hint: 'Publish and run meets from the scorer and the My Meets page. A meet you publish belongs to this account, so only you can change it and it is still there if you switch phones.', value: promoter, set: setPromoter },
    { id: 'gym', label: 'Gym owner', hint: 'Claim your gym in the directory, then edit implements and day-pass info from My Gym.', value: gymOwner, set: setGymOwner },
  ];

  const passwordPanel = (auth.recovery || showPassword) ? (
    <PasswordPanel
      recovery={auth.recovery}
      busy={busy}
      onSubmit={(pw, current) => run(async () => {
        await auth.updatePassword(pw, current);
        setShowPassword(false);
        return 'Password updated. Use it next time you sign in.';
      })}
      onDismiss={() => { auth.clearRecovery(); setShowPassword(false); }}
    />
  ) : null;

  return (
    <div className="flex flex-col gap-10">
      {auth.recovery && passwordPanel}
      {notice && auth.recovery && <Notice {...notice} />}

      {/* Identity strip */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="flex flex-col gap-1 min-w-0">
            <Cap as="span">Signed in{badges.length > 0 ? ` · ${badges.join(' · ')}` : ''}</Cap>
            <h1 className={`${H1} break-words`}>{profileLabel(p, auth.user.email)}</h1>
            <div className="text-[13px] text-ink-muted break-all">{auth.user.email}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!auth.recovery && (
              <button type="button" disabled={busy} aria-pressed={showPassword} onClick={() => { setShowPassword((v) => !v); setNotice(null); }} className={keyClass(showPassword ? 'ink' : 'line', 'disabled:opacity-40')}>
                {showPassword ? 'Close' : 'Change password'}
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => run(async () => { await auth.signOut(); })} className={keyClass('line', 'disabled:opacity-40')}>
              Sign out
            </button>
          </div>
        </div>
        {auth.error && <Notice text={auth.error} tone="warn" />}
      </section>
      {!auth.recovery && passwordPanel}

      {/* Profile */}
      <section aria-labelledby="profile-heading" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Cap as="span">Profile</Cap>
          <h2 id="profile-heading" className={H2}>Profile</h2>
          <p className={NOTE}>Pick everything that applies. Most people in this sport wear more than one hat.</p>
        </div>
        {!p ? (
          <div className="zt-block grid-cols-1"><div className={`${CELL} py-6`}><Cap as="span">Loading profile…</Cap></div></div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await auth.updateProfile({ display_name: draftName, is_athlete: athlete, is_promoter: promoter, is_gym_owner: gymOwner, ...(about ?? {}) });
                return 'Profile saved';
              });
            }}
            className="flex flex-col gap-4"
          >
            <div className="zt-block grid-cols-1 md:grid-cols-[auto_minmax(0,1fr)]">
              <div className={CELL}>
                <Cap as="span">Photo</Cap>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 border-2 border-rule overflow-hidden flex items-center justify-center shrink-0" aria-hidden={!avatarSrc}>
                    {avatarSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarSrc} alt="Your profile photo" className="w-full h-full object-cover" />
                    ) : (
                      <span className="font-sheet text-[24px] text-ink-muted" aria-hidden="true">—</span>
                    )}
                  </div>
                  <div className="flex flex-col items-start gap-1.5">
                    <input ref={fileRef} id="profile-photo" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={avatarBusy || busy} onChange={(e) => void onPickAvatar(e.target.files?.[0])} />
                    <label htmlFor="profile-photo" className={keyClass('line', `cursor-pointer ${avatarBusy || busy ? 'opacity-40 pointer-events-none' : ''}`)}>
                      {avatarBusy ? 'Uploading…' : avatarSrc ? 'Change photo' : 'Add photo'}
                    </label>
                    {avatarSrc && (
                      <button type="button" disabled={avatarBusy || busy} className={`text-[13px] ${textLink} disabled:opacity-40`} onClick={() => run(async () => { await auth.clearAvatar(); return 'Photo removed'; })}>
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                <div className={NOTE}>JPG, PNG, or WebP under {Math.round(AVATAR_MAX_BYTES / 1024 / 1024)} MB. Saves right away.</div>
              </div>
              <div className={CELL}>
                <label htmlFor="profile-name"><Cap as="span">Display name</Cap></label>
                <input id="profile-name" value={draftName} onChange={(e) => setDraftName(e.target.value)} className={INPUT} maxLength={80} />
              </div>
            </div>

            <div className="zt-block grid-cols-1 md:grid-cols-3">
              <div className={`${CELL} col-span-full py-2.5`}><Cap as="span">Roles</Cap></div>
              {roleRows.map((r) => (
                <label key={r.id} className={`${CELL} cursor-pointer`}>
                  <span className="flex items-center gap-2.5">
                    <input type="checkbox" checked={r.value} onChange={(e) => r.set(e.target.checked)} className="w-5 h-5 shrink-0" style={CHECK} />
                    <span className={`text-[17px] font-bold leading-tight ${r.value ? 'text-pen' : 'text-ink'}`}>{r.label}</span>
                  </span>
                  <span className={NOTE}>{r.hint}</span>
                </label>
              ))}
            </div>

            {about && (
              <fieldset className="flex flex-col gap-4 min-w-0">
                <legend className="sr-only">About you</legend>
                <div className="flex flex-col gap-1 pt-2">
                  <Cap as="span">About you · all optional</Cap>
                  <h3 className="text-[19px] font-bold leading-tight text-ink">About you</h3>
                  <p className={NOTE}>Shows here, and on your public athlete page if you turn that on below.</p>
                </div>

                <div className="zt-block grid-cols-1 md:grid-cols-2">
                  <div className={CELL}>
                    <label htmlFor="about-lift"><Cap as="span">Favorite lift</Cap></label>
                    <select id="about-lift" value={about.favorite_lift} onChange={(e) => patchAbout({ favorite_lift: e.target.value })} className={INPUT}>
                      <option value="">Pick one</option>
                      {FAVORITE_LIFT_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className={CELL}>
                    <label htmlFor="about-lift-note"><Cap as="span">More about it</Cap></label>
                    <input id="about-lift-note" value={about.favorite_lift_note} onChange={(e) => patchAbout({ favorite_lift_note: e.target.value })} className={INPUT} maxLength={120} placeholder="Variation, your best, or why you love it" />
                  </div>
                  <div className={CELL}>
                    <label htmlFor="about-location"><Cap as="span">Location</Cap></label>
                    <input id="about-location" value={about.location} onChange={(e) => patchAbout({ location: e.target.value })} className={INPUT} maxLength={80} placeholder="City, State" />
                  </div>
                  <div className={CELL}>
                    <label htmlFor="about-gym"><Cap as="span">Home gym</Cap></label>
                    <input id="about-gym" value={about.home_gym_name} onChange={(e) => patchAbout({ home_gym_name: e.target.value })} className={INPUT} maxLength={80} placeholder="Where you train" />
                  </div>
                  {/* 029: link the home gym to its Gym Directory listing; the public page shows the gym as a link. Picking a gym
                      also fills the name above so the text and the link agree; clearing keeps the typed name. */}
                  <div className={`${CELL} md:col-span-2`}>
                    <HostGymPicker
                      value={about.home_gym_id ?? ''}
                      onChange={(g) => patchAbout(g ? { home_gym_id: g.id, home_gym_name: g.name.slice(0, 80) } : { home_gym_id: null })}
                      id="about-gym-directory"
                      label="Home gym in the Gym Directory"
                      help="Optional. Links your public profile to the gym's page. Not listed? Just type the name above."
                      clearLabel="Clear directory gym"
                      offlineNote="Home gym link: connects your profile to a Gym Directory listing when the live backend is on."
                    />
                  </div>
                </div>

                <div className="zt-block grid-cols-2">
                  <div className={`${CELL} col-span-full py-2.5`}><Cap as="span">Personal records · up to {MAX_PRS}</Cap></div>
                  {about.prs.map((pr, i) => (
                    <React.Fragment key={i}>
                      <div className={CELL}>
                        <input aria-label={`PR ${i + 1} lift`} value={pr.lift} onChange={(e) => patchPR(i, { lift: e.target.value })} className={INPUT} maxLength={40} placeholder={i === 0 ? 'Lift (Log press)' : 'Lift'} />
                      </div>
                      <div className={CELL}>
                        <input aria-label={`PR ${i + 1} result`} value={pr.value} onChange={(e) => patchPR(i, { value: e.target.value })} className={`${INPUT} font-sheet`} maxLength={40} placeholder={i === 0 ? 'Result (275 lb)' : 'Result'} />
                      </div>
                    </React.Fragment>
                  ))}
                </div>

                <div className="zt-block grid-cols-1">
                  <div className={`${CELL} col-span-full py-2.5`}><Cap as="span">Coaching</Cap></div>
                  <div className={`${CELL} gap-2.5`}>
                    <label className="flex items-center gap-2.5 text-[17px] font-bold text-ink cursor-pointer">
                      <input type="checkbox" checked={about.is_trainer} onChange={(e) => patchAbout({ is_trainer: e.target.checked, ...(e.target.checked ? {} : { trainer_in_person: false, trainer_online: false }) })} className="w-5 h-5 shrink-0" style={CHECK} />
                      I coach or train other people
                    </label>
                    {about.is_trainer && (
                      <div className="pl-8 flex flex-col gap-2">
                        <label className="flex items-center gap-2.5 text-[15px] font-bold text-ink cursor-pointer">
                          <input type="checkbox" checked={about.trainer_in_person} onChange={(e) => patchAbout({ trainer_in_person: e.target.checked })} className="w-5 h-5 shrink-0" style={CHECK} />
                          In-person clients
                        </label>
                        <label className="flex items-center gap-2.5 text-[15px] font-bold text-ink cursor-pointer">
                          <input type="checkbox" checked={about.trainer_online} onChange={(e) => patchAbout({ trainer_online: e.target.checked })} className="w-5 h-5 shrink-0" style={CHECK} />
                          Online clients
                        </label>
                        <p className={NOTE}>With a public profile (below) you are listed under <Link href="/trainers" className={textLink}>Trainers</Link> as well as Athletes.</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="zt-block grid-cols-1 md:grid-cols-2">
                  <div className={`${CELL} col-span-full py-2.5`}><Cap as="span">Social handles you want to show</Cap></div>
                  {SOCIAL_KEYS.map((sk) => (
                    <div key={sk.key} className={CELL}>
                      <label htmlFor={`about-social-${sk.key}`}><Cap as="span">{sk.label}</Cap></label>
                      <input id={`about-social-${sk.key}`} aria-label={sk.label} value={about.socials[sk.key] ?? ''} onChange={(e) => patchSocial(sk.key, e.target.value)} className={INPUT} maxLength={200} placeholder={sk.placeholder} inputMode={sk.key === 'website' ? 'url' : 'text'} />
                    </div>
                  ))}
                  <p className={`${CELL} col-span-full py-2.5 ${NOTE}`}>Paste a handle or a profile link; either works.</p>
                </div>
              </fieldset>
            )}

            {notice && <Notice {...notice} />}
            <button type="submit" disabled={busy || avatarBusy || !dirty} className={keyClass('pen', 'self-start disabled:opacity-40')}>
              Save profile
            </button>
          </form>
        )}
      </section>

      <MembershipCardsSection userId={auth.user.id} />

      <MyClaimsSection />

      {p && (
        <section aria-labelledby="public-heading" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Cap as="span">
              Public profile · <span className={p.is_public && p.username ? 'text-pen' : undefined}>{p.is_public && p.username ? 'Listed' : 'Private'}</span>
            </Cap>
            <h2 id="public-heading" className={H2}>Public profile</h2>
            <p className={`${NOTE} max-w-2xl`}>
              Off by default. Turn it on and your display name, photo, roles, location, home gym, favorite lift, PRs and social
              handles above show at your own page and in the <Link href="/athletes" className={textLink}>Athletes</Link> list.
              Your email never shows. You need a username first; it is the address of your page.
            </p>
          </div>

          <form
            className="zt-block grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] max-w-2xl"
            onSubmit={async (e) => {
              e.preventDefault();
              const u = normalizeUsername(draftUsername);
              const problem = usernameProblem(u);
              if (problem) { setUsernameNote({ text: problem, tone: 'warn' }); return; }
              setUsernameBusy(true);
              setUsernameNote(null);
              try {
                const next = await auth.setUsername(u || null);
                setUsernameNote({ text: next?.username ? `Your page is zerotacky.com${athleteProfilePath(next.username)}` : 'Username cleared. Your profile is private again.', tone: 'ok' });
              } catch (err) {
                setUsernameNote({ text: err instanceof Error ? err.message : String(err), tone: 'warn' });
              } finally {
                setUsernameBusy(false);
              }
            }}
          >
            <div className={CELL}>
              <label htmlFor="profile-username"><Cap as="span">Username</Cap></label>
              <div className="flex items-center gap-2">
                <span className="text-[17px] font-bold text-ink-muted">@</span>
                <input id="profile-username" value={draftUsername} onChange={(e) => setDraftUsername(e.target.value)} className={INPUT} maxLength={USERNAME_MAX} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="yourname" />
              </div>
              <div className={NOTE}>3 to 30 characters, lowercase letters, numbers and underscores. If you change it, the old one is held for 30 days so nobody else can grab it right away. Promoters use it to link your results to this page (Show History).</div>
            </div>
            <div className={`${CELL} justify-end`}>
              <button type="submit" disabled={usernameBusy || normalizeUsername(draftUsername) === (p.username ?? '')} className={keyClass('line', 'disabled:opacity-40')}>
                {usernameBusy ? 'Saving…' : p.username ? 'Change username' : 'Set username'}
              </button>
            </div>
            <label className={`${CELL} col-span-full flex-row items-start gap-3 ${p.username ? 'cursor-pointer' : 'opacity-60'}`}>
              <input
                type="checkbox"
                checked={p.is_public}
                disabled={!p.username || busy || usernameBusy}
                onChange={(e) => {
                  const on = e.target.checked;
                  setUsernameBusy(true);
                  setUsernameNote(null);
                  auth.updateProfile({ is_public: on })
                    .then(() => setUsernameNote({ text: on ? 'Your profile is public.' : 'Your profile is private.', tone: 'ok' }))
                    .catch((err) => setUsernameNote({ text: err instanceof Error ? err.message : String(err), tone: 'warn' }))
                    .finally(() => setUsernameBusy(false));
                }}
                className="w-5 h-5 mt-0.5 shrink-0"
                style={CHECK}
              />
              <span className="flex flex-col gap-0.5 min-w-0">
                <span className={`text-[17px] font-bold leading-tight ${p.is_public ? 'text-pen' : 'text-ink'}`}>Show my profile publicly</span>
                <span className={NOTE}>
                  {p.username
                    ? (p.is_public ? <>Live at <Link href={athleteProfilePath(p.username)} className={textLink}>{athleteProfilePath(p.username)}</Link>. Turn it off any time; the page disappears right away.</> : 'Saves as soon as you tick it. Unsaved edits in the form above stay put until you save them.')
                    : 'Set a username first.'}
                </span>
              </span>
            </label>
          </form>
          {usernameNote && <Notice {...usernameNote} />}
        </section>
      )}

      <section aria-labelledby="next-heading" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Cap as="span">Where to next</Cap>
          <h2 id="next-heading" className={H2}>Where to next</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/promoter" className={keyClass('ink')}>My Meets</Link>
          <Link href="/scorer" className={keyClass('ink')}>Meet-day scorer</Link>
          <Link href="/website/account/gym" className={keyClass('line')}>My Gym</Link>
          <Link href="/shows" className={keyClass('line')}>Find a show</Link>
          <Link href="/gyms" className={keyClass('line')}>Find a gym</Link>
          <AdminLink />
        </div>
        <p className={NOTE}>
          Publishing from the scorer uses this sign-in. Judges and pit crew do not sign in; they join with the meet code.
        </p>
      </section>
    </div>
  );
}
