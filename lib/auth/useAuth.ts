'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { accountRedirectUrl, getSupabase } from './supabaseBrowser';
import { readSyncEnv } from '@/lib/sync/client';
import { fetchProfile, saveProfile, type Profile, type ProfilePatch } from './profile';
import { avatarPublicUrl, removeAvatar, replaceAvatar } from './avatar';

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
  updatePassword: (newPassword: string, currentPassword?: string) => Promise<void>;
  clearRecovery: () => void;
  signOut: () => Promise<void>;
  updateProfile: (patch: ProfilePatch) => Promise<Profile>;
  refreshProfile: () => Promise<void>;
  // Profile photo (013): upload replaces the previous file and writes avatar_path; remove clears both.
  setAvatar: (file: File) => Promise<Profile>;
  clearAvatar: () => Promise<Profile>;
  avatarUrl: (path: string) => string;
}

const NOT_CONFIGURED = 'Accounts are not configured on this build.';

function message(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

export function useAuth(): AuthState {
  // `configured` comes from NEXT_PUBLIC_ env, inlined at build time, so the server and the first client render agree.
  // `sb` is browser-only. Seeding `loading` from `sb` made the server render the signed-out card while the client's first
  // paint showed the session check, which React reports as hydration error #418 (Astra 10/20 + 10/21, G-L5).
  const configured = !!readSyncEnv();
  const sb = useMemo(() => (typeof window === 'undefined' ? null : getSupabase()), []);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<boolean>(configured);
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
    if (!sb) { setLoading(false); return undefined; }
    let alive = true;
    // Implicit-flow recovery links carry type=recovery AND the session token in the hash; supabase-js strips both once
    // it has the session, so read it here as well as listening for the PASSWORD_RECOVERY event. Astra R-L1 (10/19):
    // type=recovery on its own is not evidence (anyone can type it); the access_token has to be there too.
    if (typeof window !== 'undefined') {
      const h = window.location.hash;
      if (/(^|[#&])type=recovery(&|$)/.test(h) && /(^|[#&])access_token=/.test(h)) setRecovery(true);
    }
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

  // `currentPassword` is required for an ordinary signed-in change (Astra R-L1: phones get shared on meet day, so a
  // live session alone should not be enough to take the account over). A verified recovery session skips it.
  const updatePassword = useCallback(async (newPassword: string, currentPassword?: string) => {
    if (!sb) throw new Error(NOT_CONFIGURED);
    setError(null);
    if (currentPassword !== undefined) {
      const email = session?.user.email;
      if (!email) throw new Error('Sign in again before changing your password.');
      const { error: re } = await sb.auth.signInWithPassword({ email, password: currentPassword });
      if (re) throw new Error('Current password is wrong.');
    }
    const { error: e } = await sb.auth.updateUser({ password: newPassword });
    if (e) throw new Error(e.message);
    setRecovery(false);
  }, [sb, session]);

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

  const setAvatar = useCallback(async (file: File) => {
    if (!sb) throw new Error(NOT_CONFIGURED);
    const uid = userIdRef.current;
    if (!uid) throw new Error('Sign in first.');
    // Astra P-H1: upload, save the path, then remove the old object; a failed save removes the new upload instead.
    let saved: Profile | null = null;
    await replaceAvatar(sb, uid, file, profile?.avatar_path ?? '', async (path) => {
      saved = await saveProfile(sb, uid, { avatar_path: path });
    });
    if (!saved) throw new Error('Photo saved to storage but the profile did not update.');
    setProfile(saved);
    return saved;
  }, [sb, profile?.avatar_path]);

  const clearAvatar = useCallback(async () => {
    if (!sb) throw new Error(NOT_CONFIGURED);
    const uid = userIdRef.current;
    if (!uid) throw new Error('Sign in first.');
    const old = profile?.avatar_path ?? '';
    const p = await saveProfile(sb, uid, { avatar_path: '' });
    setProfile(p);
    await removeAvatar(sb, old).catch(() => undefined);
    return p;
  }, [sb, profile?.avatar_path]);

  const avatarUrl = useCallback((path: string) => (sb ? avatarPublicUrl(sb, path) : ''), [sb]);

  return {
    enabled: configured,
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
    setAvatar,
    clearAvatar,
    avatarUrl,
  };
}
