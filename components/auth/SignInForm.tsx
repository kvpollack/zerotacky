'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Cap, keyClass, textLink } from '@/components/website/sheet';
import type { AuthState } from '@/lib/auth/useAuth';
import { MIN_ACCOUNT_AGE, dobProblem, latestAllowedDob, parseDob } from '@/lib/auth/age';

// Sign in / create account / magic link, lifted out of AccountClient (10/21) so the registration page can ask for an
// account without sending the athlete away. `returnTo` is remembered only before an email round trip (confirmation,
// magic link, reset): an inline password sign-in needs no return, it stays where it is (Astra HI-M1). The email link
// usually opens in a new tab or the phone's browser, so the value lives in localStorage for an hour, not
// sessionStorage (HI-M2). AccountClient reads and clears it once the session exists and no password recovery is
// pending.
export type SignInMode = 'signin' | 'signup' | 'magic';
export const RETURN_TO_KEY = 'zt_return_to';
const RETURN_TO_TTL_MS = 60 * 60 * 1000;

// Same-origin path or nothing: no scheme, no `//`, no backslashes or control characters, and the browser's own URL
// parser must resolve it to this origin (Astra HI-L1). Returns the normalized path + search + hash.
export function cleanReturnPath(v: string | null | undefined): string | null {
  if (!v || typeof v !== 'string' || !v.startsWith('/') || v.startsWith('//')) return null;
  if (/[\\\u0000-\u001f\u007f]/.test(v)) return null;
  if (typeof window === 'undefined') return v;
  try {
    const u = new URL(v, window.location.origin);
    if (u.origin !== window.location.origin) return null;
    const out = `${u.pathname}${u.search}${u.hash}`;
    if (!out.startsWith('/') || out.startsWith('//')) return null;
    return out;
  } catch { return null; }
}
export function rememberReturnTo(path: string | undefined) {
  const clean = cleanReturnPath(path);
  if (!clean) return;
  try { localStorage.setItem(RETURN_TO_KEY, JSON.stringify({ p: clean, t: Date.now() })); } catch { /* private mode */ }
}
export function clearReturnTo() {
  try { localStorage.removeItem(RETURN_TO_KEY); } catch { /* ignore */ }
}
export function takeReturnTo(): string | null {
  try {
    const raw = localStorage.getItem(RETURN_TO_KEY);
    if (!raw) return null;
    localStorage.removeItem(RETURN_TO_KEY);
    const j = JSON.parse(raw) as { p?: unknown; t?: unknown };
    if (typeof j.t !== 'number' || Date.now() - j.t > RETURN_TO_TTL_MS) return null;
    return cleanReturnPath(typeof j.p === 'string' ? j.p : null);
  } catch { return null; }
}

const INPUT = 'zt-input w-full';
const CELL = 'flex flex-col gap-1.5 px-4 py-3 sm:px-5 sm:py-3.5 min-w-0';
const NOTE = 'text-[13px] leading-snug text-ink-muted';

// Notices are plain bold ink: the sheet has no tinted boxes. Warnings read the same as confirmations; the words carry it.
function Notice({ text }: { text: string; tone: 'ok' | 'warn' }) {
  return <div role="status" className="text-[15px] font-bold text-ink">{text}</div>;
}
function errText(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

export default function SignInForm({ auth, defaultMode = 'signin', returnTo, idPrefix = 'acct' }: {
  auth: AuthState;
  defaultMode?: SignInMode;
  returnTo?: string;
  idPrefix?: string;
}) {
  const [mode, setMode] = useState<SignInMode>(defaultMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null);

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

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'signin') return run(async () => { clearReturnTo(); await auth.signInWithPassword(email, password); });
    if (mode === 'signup') {
      return run(async () => {
        if (password.length < 8) throw new Error('Password needs at least 8 characters.');
        const dobErr = dobProblem(dob);
        if (dobErr) throw new Error(dobErr);
        rememberReturnTo(returnTo);
        const r = await auth.signUp(email, password, name || email.split('@')[0], parseDob(dob) ?? undefined);
        if (r === 'signed_in') clearReturnTo();
        return r === 'check_email' ? `Check ${email.trim()} for a confirmation link. Opening it signs you in and brings you back here.` : undefined;
      });
    }
    return run(async () => { rememberReturnTo(returnTo); await auth.sendMagicLink(email); return `Magic link sent to ${email.trim()}. Opening it signs you in and brings you back here.`; });
  };
  const tabs: Array<[SignInMode, string]> = [['signin', 'Sign in'], ['signup', 'Create account'], ['magic', 'Email me a link']];

  return (
    <div className="flex flex-col gap-4">
      {/* Mode switch. Plain toggle buttons (aria-pressed), not a tablist: one form changes shape below, there are no
          separate panels to associate, and tab roles without arrow-key handling misled assistive tech (Astra B1).
          Three ruled cells; the active one is filled ink like the nav. */}
      <div role="group" aria-label="Sign-in method" className="zt-block grid-cols-3">
        {tabs.map(([id, label]) => {
          const on = mode === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              onClick={() => { setMode(id); setNotice(null); }}
              style={on ? { background: 'var(--ink)' } : undefined}
              className={`min-h-[44px] px-2 py-2 text-[12px] sm:text-[13px] font-bold uppercase tracking-[0.04em] leading-tight ${on ? 'text-sheet' : 'text-ink hover:text-pen'}`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="zt-block grid-cols-1">
          {mode === 'signup' && (
            <div className={CELL}>
              <label htmlFor={`${idPrefix}-name`}><Cap as="span">Display name</Cap></label>
              <input id={`${idPrefix}-name`} value={name} onChange={(e) => setName(e.target.value)} className={INPUT} maxLength={80} autoComplete="name" />
            </div>
          )}
          {mode === 'signup' && (
            <div className={CELL}>
              <label htmlFor={`${idPrefix}-dob`}><Cap as="span">Date of birth</Cap></label>
              <input
                id={`${idPrefix}-dob`}
                type="date"
                required
                value={dob}
                max={latestAllowedDob()}
                onChange={(e) => setDob(e.target.value)}
                className={INPUT}
                autoComplete="bday"
                aria-describedby={`${idPrefix}-dob-note`}
              />
              <span id={`${idPrefix}-dob-note`} className={NOTE}>Accounts are for ages {MIN_ACCOUNT_AGE} and up. Not shown on your profile.</span>
            </div>
          )}
          <div className={CELL}>
            <label htmlFor={`${idPrefix}-email`}><Cap as="span">Email</Cap></label>
            <input id={`${idPrefix}-email`} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} autoComplete="email" />
          </div>
          {mode !== 'magic' && (
            <div className={CELL}>
              <label htmlFor={`${idPrefix}-password`}><Cap as="span">Password{mode === 'signup' ? ' (8+ characters)' : ''}</Cap></label>
              <input
                id={`${idPrefix}-password`}
                type="password"
                required
                minLength={mode === 'signup' ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={INPUT}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
              {mode === 'signin' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(async () => {
                    if (!email.trim()) throw new Error('Enter your email above first, then tap Forgot password.');
                    rememberReturnTo(returnTo);
                    await auth.sendPasswordReset(email);
                    return `Reset link sent to ${email.trim()}. It opens the Account page to set a new password${returnTo ? ', then brings you back here' : ''}.`;
                  })}
                  className={`self-start text-[13px] ${textLink}`}
                >
                  Forgot password?
                </button>
              )}
            </div>
          )}
        </div>
        {mode === 'signup' && (
          <p className={NOTE}>
            By creating an account you agree to the <Link href="/legal/terms" className={textLink}>Terms of Use</Link> and{' '}
            <Link href="/legal/privacy" className={textLink}>Privacy Policy</Link>. You must be {MIN_ACCOUNT_AGE} or older; under 18 needs a
            parent or guardian&apos;s agreement.
          </p>
        )}
        {notice && <Notice {...notice} />}
        <button type="submit" disabled={busy} className={keyClass('pen', 'self-start disabled:opacity-40')}>
          {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send link'}
        </button>
      </form>
    </div>
  );
}
