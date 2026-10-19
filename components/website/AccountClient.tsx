'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Dumbbell, LogOut, Mail, Play, Save, ShieldCheck, Trophy, UserCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth/useAuth';
import { profileLabel, roleBadges } from '@/lib/auth/profile';

// Real account page (v2): sign in / create account / magic link, then a profile editor. The three role flags
// are self-declared and only shape what the site shows; meet access is decided by meets.owner_id / meet_members.
type Mode = 'signin' | 'signup' | 'magic';

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

export default function AccountClient() {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null);

  // profile editor
  const [draftName, setDraftName] = useState('');
  const [athlete, setAthlete] = useState(false);
  const [promoter, setPromoter] = useState(false);
  const [gymOwner, setGymOwner] = useState(false);
  useEffect(() => {
    if (!auth.profile) return;
    setDraftName(auth.profile.display_name);
    setAthlete(auth.profile.is_athlete);
    setPromoter(auth.profile.is_promoter);
    setGymOwner(auth.profile.is_gym_owner);
  }, [auth.profile]);

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

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setNotice(null);
    try {
      const msg = await fn();
      if (msg) setNotice({ text: msg, tone: 'ok' });
    } catch (e) {
      setNotice({ text: errText(e), tone: 'warn' });
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
    const submit = (e: React.FormEvent) => {
      e.preventDefault();
      if (mode === 'signin') return run(async () => { await auth.signInWithPassword(email, password); });
      if (mode === 'signup') {
        return run(async () => {
          if (password.length < 8) throw new Error('Password needs at least 8 characters.');
          const r = await auth.signUp(email, password, name || email.split('@')[0]);
          return r === 'check_email' ? `Check ${email.trim()} for a confirmation link, then come back here.` : undefined;
        });
      }
      return run(async () => { await auth.sendMagicLink(email); return `Magic link sent to ${email.trim()}. Open it on this device.`; });
    };
    const tabs: Array<[Mode, string]> = [['signin', 'Sign in'], ['signup', 'Create account'], ['magic', 'Email me a link']];
    return (
      <div className="space-y-6">
        <section className="bg-zt-surface border border-zt-border rounded-2xl p-5 space-y-4 max-w-xl">
          <div className="space-y-1">
            <h1 className="text-xl sm:text-2xl font-black text-zt-text">Your ZeroTacky account</h1>
            <p className="text-xs sm:text-sm text-zt-text-2 leading-relaxed">
              One account covers everything you do in strongman: compete, run shows, list a gym. Promoters publish meets from
              the scorer with this sign-in instead of a shared key.
            </p>
          </div>
          {/* Mode switch. Plain toggle buttons (aria-pressed), not a tablist: one form changes shape below, there are no
              separate panels to associate, and tab roles without arrow-key handling misled assistive tech (Astra B1). */}
          <div role="group" aria-label="Sign-in method" className="grid grid-cols-3 gap-2">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={mode === id}
                onClick={() => { setMode(id); setNotice(null); }}
                className={`py-2 rounded-xl border text-[11px] font-black uppercase ${mode === id ? 'bg-zt-primary/15 border-zt-primary text-zt-text' : 'bg-zt-inset border-zt-border text-zt-text-2'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="space-y-3">
            {mode === 'signup' && (
              <div>
                <label htmlFor="acct-name" className={labelCls}>Display name</label>
                <input id="acct-name" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={80} autoComplete="name" />
              </div>
            )}
            <div>
              <label htmlFor="acct-email" className={labelCls}>Email</label>
              <input id="acct-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} autoComplete="email" />
            </div>
            {mode !== 'magic' && (
              <div>
                <label htmlFor="acct-password" className={labelCls}>Password{mode === 'signup' ? ' (8+ characters)' : ''}</label>
                <input
                  id="acct-password"
                  type="password"
                  required
                  minLength={mode === 'signup' ? 8 : undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputCls}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                />
              </div>
            )}
            {mode === 'signup' && (
              <p className="text-[11px] text-zt-muted">
                By creating an account you agree to the <Link href="/legal/terms" className="text-zt-primary font-bold">Terms of Use</Link> and{' '}
                <Link href="/legal/privacy" className="text-zt-primary font-bold">Privacy Policy</Link>. You must be 13 or older; under 18 needs a
                parent or guardian&apos;s agreement.
              </p>
            )}
            {notice && <Notice {...notice} />}
            <button type="submit" disabled={busy} className={primaryBtn}>
              {mode === 'magic' ? <Mail className="w-3.5 h-3.5" aria-hidden="true" /> : <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />}
              {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send link'}
            </button>
          </form>
          <p className="text-[11px] text-zt-muted">
            Meet-day volunteers do not need an account: judges and pit crew join with the meet code at <Link href="/join" className="text-zt-primary font-bold">/join</Link>.
          </p>
        </section>
      </div>
    );
  }

  const p = auth.profile;
  const badges = roleBadges(p);
  const dirty = p ? draftName !== p.display_name || athlete !== p.is_athlete || promoter !== p.is_promoter || gymOwner !== p.is_gym_owner : false;
  const roleRows: Array<{ id: string; label: string; hint: string; value: boolean; set: (v: boolean) => void; icon: React.ReactNode }> = [
    { id: 'athlete', label: 'Athlete', hint: 'Register for shows and keep your competition history in one place.', value: athlete, set: setAthlete, icon: <UserCheck className="w-4 h-4 text-zt-primary" aria-hidden="true" /> },
    { id: 'promoter', label: 'Promoter', hint: 'Publish and run meets from the scorer. Meets you publish are tied to this account.', value: promoter, set: setPromoter, icon: <Trophy className="w-4 h-4 text-zt-primary" aria-hidden="true" /> },
    { id: 'gym', label: 'Gym owner', hint: 'List your gym, implements and day-pass info for travelling athletes.', value: gymOwner, set: setGymOwner, icon: <Dumbbell className="w-4 h-4 text-zt-secondary" aria-hidden="true" /> },
  ];

  return (
    <div className="space-y-6">
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
          <button type="button" disabled={busy} onClick={() => run(async () => { await auth.signOut(); })} className={quietBtn}>
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" /> Sign out
          </button>
        </div>
        {auth.error && <Notice text={auth.error} tone="warn" />}
      </section>

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
                await auth.updateProfile({ display_name: draftName, is_athlete: athlete, is_promoter: promoter, is_gym_owner: gymOwner });
                return 'Profile saved';
              });
            }}
            className="space-y-4"
          >
            <div className="max-w-md">
              <label htmlFor="profile-name" className={labelCls}>Display name</label>
              <input id="profile-name" value={draftName} onChange={(e) => setDraftName(e.target.value)} className={inputCls} maxLength={80} />
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
            {notice && <Notice {...notice} />}
            <button type="submit" disabled={busy || !dirty} className={primaryBtn}>
              <Save className="w-3.5 h-3.5" aria-hidden="true" /> Save profile
            </button>
          </form>
        )}
      </section>

      <section aria-labelledby="next-heading" className="bg-zt-surface border border-zt-border rounded-2xl p-5 space-y-3">
        <h2 id="next-heading" className="text-base font-black uppercase text-zt-text">Where to next</h2>
        <div className="flex flex-wrap gap-2">
          {p?.is_promoter && (
            <Link href="/promoter" className={primaryBtn}>
              <Trophy className="w-3.5 h-3.5" aria-hidden="true" /> Promoter dashboard
            </Link>
          )}
          <Link href="/scorer" className={primaryBtn}>
            <Play className="w-3.5 h-3.5" aria-hidden="true" /> Meet-day scorer
          </Link>
          <Link href="/shows" className={quietBtn}>Find a show</Link>
          <Link href="/gyms" className={quietBtn}>Find a gym</Link>
        </div>
        <p className="text-[11px] text-zt-muted">
          Publishing from the scorer uses this sign-in. The old promoter key still works for phones that are not signed in.
        </p>
      </section>
    </div>
  );
}
