'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Camera, Dumbbell, Eye, EyeOff, KeyRound, LogOut, Mail, Play, Save, ShieldCheck, Trash2, Trophy, UserCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/useAuth';
import SignInForm, { takeReturnTo } from '@/components/auth/SignInForm';
import { FAVORITE_LIFT_OPTIONS, MAX_PRS, SOCIAL_KEYS, USERNAME_MAX, athleteProfilePath, normalizeUsername, profileLabel, roleBadges, usernameProblem, type Profile, type ProfilePR, type ProfileSocials } from '@/lib/auth/profile';
import { AVATAR_MAX_BYTES, avatarProblem } from '@/lib/auth/avatar';
import { aboutFromProfile, aboutKey, reconcileAbout, type AboutDraft } from '@/lib/auth/profileDraft';
import { fetchIsAdmin } from '@/lib/website/myGym';
import { getSupabase } from '@/lib/auth/supabaseBrowser';

// Real account page (v2): sign in / create account / magic link, then a profile editor. The three role flags
// are self-declared and only shape what the site shows; meet access is decided by meets.owner_id / meet_members.
const inputCls = 'w-full bg-zt-inset border border-zt-border-strong rounded-lg px-3 py-2 text-sm text-zt-text';
const labelCls = 'block text-[10px] font-extrabold uppercase text-zt-muted mb-1';
const primaryBtn = 'px-4 py-2 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase tracking-wider inline-flex items-center gap-1.5 disabled:opacity-40';
const quietBtn = 'px-3 py-2 rounded-xl bg-zt-surface border border-zt-border-strong text-zt-text font-extrabold text-xs uppercase inline-flex items-center gap-1.5 disabled:opacity-40';

function Notice({ text, tone }: { text: string; tone: 'ok' | 'warn' }) {
  return (
    <div
      role="status"
      className={`text-xs font-bold rounded-lg px-3 py-2 ${tone === 'warn' ? 'bg-zt-danger/10 text-zt-danger-text border border-zt-danger/50' : 'bg-zt-inset text-zt-text-2 border border-zt-border'}`}
    >
      {text}
    </div>
  );
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
    <section
      aria-labelledby="pw-heading"
      className={`rounded-2xl p-5 space-y-3 border ${recovery ? 'bg-zt-primary/10 border-zt-primary' : 'bg-zt-surface border-zt-border'}`}
    >
      <div className="space-y-1">
        <h2 id="pw-heading" className="text-base font-black uppercase text-zt-text flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-zt-primary" aria-hidden="true" />
          {recovery ? 'Set a new password' : 'Change password'}
        </h2>
        <p className="text-xs text-zt-muted">
          {recovery
            ? 'You arrived from a password reset link. Choose a new password to finish; you are already signed in on this device.'
            : 'Enter your current password, then the new one. You stay signed in here; other devices keep their session until they next refresh.'}
        </p>
      </div>
      <form onSubmit={submit} className="space-y-3 max-w-md">
        {!recovery && (
          <div>
            <label htmlFor="pw-current" className={labelCls}>Current password</label>
            <input id="pw-current" type="password" required value={pw0} onChange={(e) => setPw0(e.target.value)} className={inputCls} autoComplete="current-password" />
          </div>
        )}
        <div>
          <label htmlFor="pw-new" className={labelCls}>New password (8+ characters)</label>
          <input id="pw-new" type="password" required minLength={8} value={pw1} onChange={(e) => setPw1(e.target.value)} className={inputCls} autoComplete="new-password" />
        </div>
        <div>
          <label htmlFor="pw-confirm" className={labelCls}>Confirm new password</label>
          <input id="pw-confirm" type="password" required minLength={8} value={pw2} onChange={(e) => setPw2(e.target.value)} className={inputCls} autoComplete="new-password" />
        </div>
        {localErr && <Notice text={localErr} tone="warn" />}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className={primaryBtn}>
            <KeyRound className="w-3.5 h-3.5" aria-hidden="true" /> {recovery ? 'Save new password' : 'Update password'}
          </button>
          {onDismiss && (
            <button type="button" disabled={busy} onClick={onDismiss} className={quietBtn}>{recovery ? 'Keep my current password' : 'Cancel'}</button>
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
    <Link href="/website/admin/claims" className={quietBtn}>
      <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" /> Gym claims queue
    </Link>
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
      <section className="bg-zt-surface border border-zt-border rounded-2xl p-5 space-y-2">
        <h1 className="text-xl font-black text-zt-text">Account</h1>
        <p className="text-sm text-zt-text-2">Accounts are not configured on this build. The scorer still works offline from <Link href="/scorer" className="text-zt-primary font-bold">/scorer</Link>.</p>
      </section>
    );
  }

  if (auth.loading) {
    return (
      <section className="bg-zt-surface border border-zt-border rounded-2xl p-5">
        <div className="text-xs font-bold uppercase text-zt-muted">Checking your session…</div>
      </section>
    );
  }

  if (!auth.user) {
    return (
      <div className="space-y-6">
        <section className="bg-zt-surface border border-zt-border rounded-2xl p-5 space-y-4 max-w-xl">
          <div className="space-y-1">
            <h1 className="text-xl sm:text-2xl font-black text-zt-text">Your ZeroTacky account</h1>
            <p className="text-xs sm:text-sm text-zt-text-2 leading-relaxed">
              One account covers everything you do in strongman, whether you compete, run shows or list a gym. If you
              promote, the meets you publish belong to this account and follow you from phone to phone.
            </p>
          </div>
          <SignInForm auth={auth} />
          <p className="text-[11px] text-zt-muted">
            Meet-day volunteers do not need an account: judges and pit crew join with the meet code on <Link href="/join" className="text-zt-primary font-bold underline">Join a Meet</Link>.
          </p>
        </section>
      </div>
    );
  }

  const p = auth.profile;
  const badges = roleBadges(p);
  const aboutDirty = p && about ? aboutKey(about) !== aboutKey(aboutFromProfile(p)) : false;
  const dirty = p ? draftName !== p.display_name || athlete !== p.is_athlete || promoter !== p.is_promoter || gymOwner !== p.is_gym_owner || aboutDirty : false;
  const avatarSrc = p?.avatar_path ? auth.avatarUrl(p.avatar_path) : '';
  const roleRows: Array<{ id: string; label: string; hint: string; value: boolean; set: (v: boolean) => void; icon: React.ReactNode }> = [
    { id: 'athlete', label: 'Athlete', hint: 'Register for shows and keep your competition history in one place.', value: athlete, set: setAthlete, icon: <UserCheck className="w-4 h-4 text-zt-primary" aria-hidden="true" /> },
    { id: 'promoter', label: 'Promoter', hint: 'Publish and run meets from the scorer and the My Meets page. A meet you publish belongs to this account, so only you can change it and it is still there if you switch phones.', value: promoter, set: setPromoter, icon: <Trophy className="w-4 h-4 text-zt-primary" aria-hidden="true" /> },
    { id: 'gym', label: 'Gym owner', hint: 'Claim your gym in the directory, then edit implements and day-pass info from My Gym.', value: gymOwner, set: setGymOwner, icon: <Dumbbell className="w-4 h-4 text-zt-secondary" aria-hidden="true" /> },
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
    <div className="space-y-6">
      {auth.recovery && passwordPanel}
      {notice && auth.recovery && <Notice {...notice} />}
      <section className="bg-zt-surface border border-zt-border rounded-2xl p-5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-xs font-black uppercase tracking-wider text-zt-primary">Signed in</div>
            <h1 className="text-xl sm:text-2xl font-black text-zt-text">{profileLabel(p, auth.user.email)}</h1>
            <div className="text-xs font-bold text-zt-muted">{auth.user.email}</div>
            {badges.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {badges.map((b) => (
                  <span key={b} className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-zt-inset border border-zt-border text-zt-primary">{b}</span>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {!auth.recovery && (
              <button type="button" disabled={busy} aria-pressed={showPassword} onClick={() => { setShowPassword((v) => !v); setNotice(null); }} className={quietBtn}>
                <KeyRound className="w-3.5 h-3.5" aria-hidden="true" /> Change password
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => run(async () => { await auth.signOut(); })} className={quietBtn}>
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" /> Sign out
            </button>
          </div>
        </div>
        {auth.error && <Notice text={auth.error} tone="warn" />}
      </section>
      {!auth.recovery && passwordPanel}

      <section aria-labelledby="profile-heading" className="bg-zt-surface border border-zt-border rounded-2xl p-5 space-y-4">
        <div className="border-b border-zt-border pb-3">
          <h2 id="profile-heading" className="text-base font-black uppercase text-zt-text">Profile</h2>
          <p className="text-xs text-zt-muted">Pick everything that applies. Most people in this sport wear more than one hat.</p>
        </div>
        {!p ? (
          <div className="text-xs font-bold text-zt-muted">Loading profile…</div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await auth.updateProfile({ display_name: draftName, is_athlete: athlete, is_promoter: promoter, is_gym_owner: gymOwner, ...(about ?? {}) });
                return 'Profile saved';
              });
            }}
            className="space-y-4"
          >
            <div className="flex flex-wrap items-start gap-4">
              <div className="space-y-1.5">
                <div className={labelCls}>Photo</div>
                <div className="flex items-center gap-2.5">
                  <div className="w-16 h-16 rounded-full overflow-hidden bg-zt-inset border border-zt-border-strong flex items-center justify-center" aria-hidden={!avatarSrc}>
                    {avatarSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarSrc} alt="Your profile photo" className="w-full h-full object-cover" />
                    ) : (
                      <Camera className="w-5 h-5 text-zt-muted" aria-hidden="true" />
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <input ref={fileRef} id="profile-photo" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={avatarBusy || busy} onChange={(e) => void onPickAvatar(e.target.files?.[0])} />
                    <label htmlFor="profile-photo" className={`${quietBtn} cursor-pointer ${avatarBusy || busy ? 'opacity-40 pointer-events-none' : ''}`}>
                      <Camera className="w-3.5 h-3.5" aria-hidden="true" /> {avatarBusy ? 'Uploading…' : avatarSrc ? 'Change photo' : 'Add photo'}
                    </label>
                    {avatarSrc && (
                      <button type="button" disabled={avatarBusy || busy} className="text-[11px] font-bold text-zt-muted hover:text-zt-danger-text inline-flex items-center gap-1 text-left" onClick={() => run(async () => { await auth.clearAvatar(); return 'Photo removed'; })}>
                        <Trash2 className="w-3 h-3" aria-hidden="true" /> Remove
                      </button>
                    )}
                  </div>
                </div>
                <div className="text-[10px] text-zt-muted">JPG, PNG, or WebP under {Math.round(AVATAR_MAX_BYTES / 1024 / 1024)} MB. Saves right away.</div>
              </div>
              <div className="flex-1 min-w-[14rem] max-w-md">
                <label htmlFor="profile-name" className={labelCls}>Display name</label>
                <input id="profile-name" value={draftName} onChange={(e) => setDraftName(e.target.value)} className={inputCls} maxLength={80} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {roleRows.map((r) => (
                <label
                  key={r.id}
                  className={`p-3.5 rounded-xl border cursor-pointer transition ${r.value ? 'bg-zt-primary/15 border-zt-primary text-zt-text ring-1 ring-zt-primary' : 'bg-zt-inset border-zt-border text-zt-text-2 hover:border-zt-border-strong'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-black text-zt-text">{r.icon}{r.label}</span>
                    <input type="checkbox" checked={r.value} onChange={(e) => r.set(e.target.checked)} className="w-4 h-4 accent-[var(--zt-primary)]" />
                  </div>
                  <div className="text-[11px] text-zt-muted mt-1 leading-snug">{r.hint}</div>
                </label>
              ))}
            </div>

            {about && (
              <fieldset className="space-y-4 border-t border-zt-border pt-4">
                <legend className="sr-only">About you</legend>
                <div>
                  <h3 className="text-sm font-black uppercase text-zt-text">About you</h3>
                  <p className="text-[11px] text-zt-muted">All optional. Shows here, and on your public athlete page if you turn that on below.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="about-lift" className={labelCls}>Favorite lift</label>
                    <select id="about-lift" value={about.favorite_lift} onChange={(e) => patchAbout({ favorite_lift: e.target.value })} className={inputCls}>
                      <option value="">Pick one</option>
                      {FAVORITE_LIFT_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="about-lift-note" className={labelCls}>More about it</label>
                    <input id="about-lift-note" value={about.favorite_lift_note} onChange={(e) => patchAbout({ favorite_lift_note: e.target.value })} className={inputCls} maxLength={120} placeholder="Variation, your best, or why you love it" />
                  </div>
                  <div>
                    <label htmlFor="about-location" className={labelCls}>Location</label>
                    <input id="about-location" value={about.location} onChange={(e) => patchAbout({ location: e.target.value })} className={inputCls} maxLength={80} placeholder="City, State" />
                  </div>
                  <div>
                    <label htmlFor="about-gym" className={labelCls}>Home gym</label>
                    <input id="about-gym" value={about.home_gym_name} onChange={(e) => patchAbout({ home_gym_name: e.target.value })} className={inputCls} maxLength={80} placeholder="Where you train" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className={labelCls}>Personal records (up to {MAX_PRS})</div>
                  {about.prs.map((pr, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr] gap-2 max-w-md">
                      <input aria-label={`PR ${i + 1} lift`} value={pr.lift} onChange={(e) => patchPR(i, { lift: e.target.value })} className={inputCls} maxLength={40} placeholder={i === 0 ? 'Lift (Log press)' : 'Lift'} />
                      <input aria-label={`PR ${i + 1} result`} value={pr.value} onChange={(e) => patchPR(i, { value: e.target.value })} className={inputCls} maxLength={40} placeholder={i === 0 ? 'Result (275 lb)' : 'Result'} />
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <label className={`flex items-center gap-2 text-xs font-black text-zt-text cursor-pointer`}>
                    <input type="checkbox" checked={about.is_trainer} onChange={(e) => patchAbout({ is_trainer: e.target.checked, ...(e.target.checked ? {} : { trainer_in_person: false, trainer_online: false }) })} className="w-4 h-4 accent-[var(--zt-primary)]" />
                    I coach or train other people
                  </label>
                  {about.is_trainer && (
                    <div className="pl-6 space-y-1.5">
                      <label className="flex items-center gap-2 text-xs font-bold text-zt-text-2 cursor-pointer">
                        <input type="checkbox" checked={about.trainer_in_person} onChange={(e) => patchAbout({ trainer_in_person: e.target.checked })} className="w-4 h-4 accent-[var(--zt-primary)]" />
                        In-person clients
                      </label>
                      <label className="flex items-center gap-2 text-xs font-bold text-zt-text-2 cursor-pointer">
                        <input type="checkbox" checked={about.trainer_online} onChange={(e) => patchAbout({ trainer_online: e.target.checked })} className="w-4 h-4 accent-[var(--zt-primary)]" />
                        Online clients
                      </label>
                      <p className="text-[11px] text-zt-muted">You can save your coaching details here. Other people cannot find them in a directory yet; that is on the roadmap.</p>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <div className={labelCls}>Social handles you want to show</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {SOCIAL_KEYS.map((sk) => (
                      <div key={sk.key} className="flex items-center gap-2">
                        <span className="w-20 shrink-0 text-[11px] font-black uppercase text-zt-muted">{sk.label}</span>
                        <input aria-label={sk.label} value={about.socials[sk.key] ?? ''} onChange={(e) => patchSocial(sk.key, e.target.value)} className={inputCls} maxLength={200} placeholder={sk.placeholder} inputMode={sk.key === 'website' ? 'url' : 'text'} />
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-zt-muted">Paste a handle or a profile link; either works.</p>
                </div>
              </fieldset>
            )}

            {notice && <Notice {...notice} />}
            <button type="submit" disabled={busy || avatarBusy || !dirty} className={primaryBtn}>
              <Save className="w-3.5 h-3.5" aria-hidden="true" /> Save profile
            </button>
          </form>
        )}
      </section>

      {p && (
        <section aria-labelledby="public-heading" className="bg-zt-surface border border-zt-border rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="public-heading" className="text-base font-black uppercase text-zt-text">Public profile</h2>
            {p.is_public && p.username ? (
              <span className="text-[10px] font-black uppercase px-2 py-1 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 inline-flex items-center gap-1"><Eye className="w-3 h-3" aria-hidden="true" /> Listed</span>
            ) : (
              <span className="text-[10px] font-black uppercase px-2 py-1 rounded bg-zt-inset text-zt-muted border border-zt-border inline-flex items-center gap-1"><EyeOff className="w-3 h-3" aria-hidden="true" /> Private</span>
            )}
          </div>
          <p className="text-xs text-zt-text-2">
            Off by default. Turn it on and your display name, photo, roles, location, home gym, favorite lift, PRs and social
            handles above show at your own page and in the <Link href="/athletes" className="font-bold text-zt-primary hover:underline">Athletes</Link> list.
            Your email never shows. You need a username first; it is the address of your page.
          </p>

          <form
            className="flex flex-col sm:flex-row sm:items-end gap-2 max-w-lg"
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
            <div className="flex-1">
              <label htmlFor="profile-username" className={labelCls}>Username</label>
              <div className="flex items-center gap-1">
                <span className="text-sm font-black text-zt-muted">@</span>
                <input id="profile-username" value={draftUsername} onChange={(e) => setDraftUsername(e.target.value)} className={inputCls} maxLength={USERNAME_MAX} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="yourname" />
              </div>
              <div className="text-[10px] text-zt-muted mt-1">3 to 30 characters, lowercase letters, numbers and underscores. If you change it, the old one is held for 30 days so nobody else can grab it right away.</div>
            </div>
            <button type="submit" disabled={usernameBusy || normalizeUsername(draftUsername) === (p.username ?? '')} className={quietBtn}>
              {usernameBusy ? 'Saving…' : p.username ? 'Change username' : 'Set username'}
            </button>
          </form>
          <label className={`flex items-start gap-3 p-3.5 rounded-xl border max-w-lg ${p.username ? 'cursor-pointer' : 'opacity-60'} ${p.is_public ? 'bg-zt-primary/15 border-zt-primary' : 'bg-zt-inset border-zt-border'}`}>
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
              className="w-4 h-4 mt-0.5 accent-[var(--zt-primary)]"
            />
            <span className="text-xs">
              <span className="block font-black text-zt-text">Show my profile publicly</span>
              <span className="block text-zt-muted mt-0.5">
                {p.username
                  ? (p.is_public ? <>Live at <Link href={athleteProfilePath(p.username)} className="underline hover:text-zt-text">{athleteProfilePath(p.username)}</Link>. Turn it off any time; the page disappears right away.</> : 'Saves as soon as you tick it. Unsaved edits in the form above stay put until you save them.')
                  : 'Set a username first.'}
              </span>
            </span>
          </label>
          {usernameNote && <Notice {...usernameNote} />}
        </section>
      )}

      <section aria-labelledby="next-heading" className="bg-zt-surface border border-zt-border rounded-2xl p-5 space-y-3">
        <h2 id="next-heading" className="text-base font-black uppercase text-zt-text">Where to next</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/promoter" className={primaryBtn}>
            <Trophy className="w-3.5 h-3.5" aria-hidden="true" /> My Meets
          </Link>
          <Link href="/scorer" className={primaryBtn}>
            <Play className="w-3.5 h-3.5" aria-hidden="true" /> Meet-day scorer
          </Link>
          <Link href="/website/account/gym" className={quietBtn}>
            <Dumbbell className="w-3.5 h-3.5" aria-hidden="true" /> My Gym
          </Link>
          <Link href="/shows" className={quietBtn}>Find a show</Link>
          <Link href="/gyms" className={quietBtn}>Find a gym</Link>
          <AdminLink />
        </div>
        <p className="text-[11px] text-zt-muted">
          Publishing from the scorer uses this sign-in. Judges and pit crew do not sign in; they join with the meet code.
        </p>
      </section>
    </div>
  );
}
