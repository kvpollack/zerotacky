'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Mail, ShieldCheck } from 'lucide-react';
import type { AuthState } from '@/lib/auth/useAuth';

// Sign in / create account / magic link, lifted out of AccountClient (10/21) so the registration page can ask for an
// account without sending the athlete away. `returnTo` is remembered in sessionStorage before any email round trip
// (confirmation, magic link, reset) so the Account page can bring them back; AccountClient reads and clears it.
export type SignInMode = 'signin' | 'signup' | 'magic';
export const RETURN_TO_KEY = 'zt_return_to';

export function rememberReturnTo(path: string | undefined) {
  if (!path || !path.startsWith('/')) return;
  try { sessionStorage.setItem(RETURN_TO_KEY, path); } catch { /* private mode */ }
}
export function takeReturnTo(): string | null {
  try {
    const v = sessionStorage.getItem(RETURN_TO_KEY);
    if (v) sessionStorage.removeItem(RETURN_TO_KEY);
    return v && v.startsWith('/') && !v.startsWith('//') ? v : null;
  } catch { return null; }
}

const inputCls = 'w-full bg-zt-inset border border-zt-border-strong rounded-lg px-3 py-2 text-sm text-zt-text';
const labelCls = 'block text-[10px] font-extrabold uppercase text-zt-muted mb-1';
const primaryBtn = 'px-4 py-2 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase tracking-wider inline-flex items-center gap-1.5 disabled:opacity-40';

function Notice({ text, tone }: { text: string; tone: 'ok' | 'warn' }) {
  return (
    <div role="status" className={`text-xs font-bold rounded-lg px-3 py-2 ${tone === 'warn' ? 'bg-zt-danger/10 text-zt-danger-text border border-zt-danger/50' : 'bg-zt-inset text-zt-text-2 border border-zt-border'}`}>
      {text}
    </div>
  );
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
    rememberReturnTo(returnTo);
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
  const tabs: Array<[SignInMode, string]> = [['signin', 'Sign in'], ['signup', 'Create account'], ['magic', 'Email me a link']];

  return (
    <div className="space-y-4">
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
            <label htmlFor={`${idPrefix}-name`} className={labelCls}>Display name</label>
            <input id={`${idPrefix}-name`} value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={80} autoComplete="name" />
          </div>
        )}
        <div>
          <label htmlFor={`${idPrefix}-email`} className={labelCls}>Email</label>
          <input id={`${idPrefix}-email`} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} autoComplete="email" />
        </div>
        {mode !== 'magic' && (
          <div>
            <label htmlFor={`${idPrefix}-password`} className={labelCls}>Password{mode === 'signup' ? ' (8+ characters)' : ''}</label>
            <input
              id={`${idPrefix}-password`}
              type="password"
              required
              minLength={mode === 'signup' ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
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
                  return `Reset link sent to ${email.trim()}. Open it on this device; it brings you back to set a new password.`;
                })}
                className="mt-1.5 text-[11px] font-bold text-zt-primary underline underline-offset-2"
              >
                Forgot password?
              </button>
            )}
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
    </div>
  );
}
