'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { accountRedirectUrl, getSupabase } from './supabaseBrowser';
import { fetchProfile, saveProfile, type Profile, type ProfilePatch } from './profile';

// Session + profile for the current tab. `enabled` is false on builds without Supabase env, in which case
// everything is null and the actions throw a plain message. Token refreshes flow through onAuthStateChange,
// so anything holding `session.access_token` (live sync) sees the new one without a reload.
export interface AuthState {
  enabled: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  error: string | null;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<'signed_in' | 'check_email'>;
  sendMagicLink: (email: string) => Promise<void>;
  // Password reset (Kurt 10/19): the email link lands on /website/account with a recovery session; `recovery` is true
  // until updatePassword succeeds or clearRecovery runs, so the page can lead with "Set a new password".
  recovery: boolean;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  clearRecovery: () => void;
  signOut: () => Promise<void>;
  updateProfile: (patch: ProfilePatch) => Promise<Profile>;
  refreshProfile: () => Promise<void>;
}

const NOT_CONFIGURED = 'Accounts are not configured on this build.';

function message(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

export function useAuth(): AuthState {
  const sb = useMemo(() => (typeof window === 'undefined' ? null : getSupabase()), []);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<boolean>(!!sb);
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<boolean>(false);
  const userIdRef = useRef<string | null>(null);

  const loadProfile = useCallback(async (userId: string | null) => {
    if (!sb || !userId) { setProfile(null); return; }
    try {
      const p = await fetchProfile(sb, userId);
      if (userIdRef.current === userId) setProfile(p);
    } catch (e) {
      setError(message(e));
    }
  }, [sb]);

  useEffect(() => {
    if (!sb) return undefined;
    let alive = true;
    // Implicit-flow recovery links carry type=recovery in the hash; supabase-js strips it once it has the session,
    // so read it here as well as listening for the PASSWORD_RECOVERY event.
    if (typeof window !== 'undefined' && /(^|[#&])type=recovery(&|$)/.test(window.location.hash)) setRecovery(true);
    sb.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      userIdRef.current = data.session?.user.id ?? null;
      loadProfile(userIdRef.current).finally(() => { if (alive) setLoading(false); });
    });
    const { data: sub } = sb.auth.onAuthStateChange((event, s) => {
      if (!alive) return;
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') setRecovery(false);
      setSession(s);
      const uid = s?.user.id ?? null;
      if (uid !== userIdRef.current) {
        userIdRef.current = uid;
        setProfile(null);
        void loadProfile(uid);
      }
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [sb, loadProfile]);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    if (!sb) throw new Error(NOT_CONFIGURED);
    setError(null);
    const { error: e } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (e) throw new Error(e.message);
  }, [sb]);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    if (!sb) throw new Error(NOT_CONFIGURED);
    setError(null);
    const { data, error: e } = await sb.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: displayName.trim() }, emailRedirectTo: accountRedirectUrl() },
    });
    if (e) throw new Error(e.message);
    return data.session ? 'signed_in' : 'check_email';
  }, [sb]);

  const sendMagicLink = useCallback(async (email: string) => {
    if (!sb) throw new Error(NOT_CONFIGURED);
    setError(null);
    const { error: e } = await sb.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: accountRedirectUrl() } });
    if (e) throw new Error(e.message);
  }, [sb]);

  const sendPasswordReset = useCallback(async (email: string) => {
    if (!sb) throw new Error(NOT_CONFIGURED);
    setError(null);
    const { error: e } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: accountRedirectUrl() });
    if (e) throw new Error(e.message);
  }, [sb]);

  const updatePassword = useCallback(async (newPassword: string) => {
    if (!sb) throw new Error(NOT_CONFIGURED);
    setError(null);
    const { error: e } = await sb.auth.updateUser({ password: newPassword });
    if (e) throw new Error(e.message);
    setRecovery(false);
  }, [sb]);

  const clearRecovery = useCallback(() => setRecovery(false), []);

  const signOut = useCallback(async () => {
    if (!sb) return;
    const { error: e } = await sb.auth.signOut();
    if (e) throw new Error(e.message);
  }, [sb]);

  const updateProfile = useCallback(async (patch: ProfilePatch) => {
    if (!sb) throw new Error(NOT_CONFIGURED);
    const uid = userIdRef.current;
    if (!uid) throw new Error('Sign in first.');
    const p = await saveProfile(sb, uid, patch);
    setProfile(p);
    return p;
  }, [sb]);

  const refreshProfile = useCallback(() => loadProfile(userIdRef.current), [loadProfile]);

  return {
    enabled: !!sb,
    loading,
    session,
    user: session?.user ?? null,
    profile,
    error,
    signInWithPassword,
    signUp,
    sendMagicLink,
    recovery,
    sendPasswordReset,
    updatePassword,
    clearRecovery,
    signOut,
    updateProfile,
    refreshProfile,
  };
}
