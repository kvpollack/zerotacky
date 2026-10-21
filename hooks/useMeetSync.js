'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createSyncClient, readSyncEnv } from '@/lib/sync/client';
import { SyncController, getDeviceId, mergeAthletes, PUBLISH_KEY_KEY } from '@/lib/sync/controller';
import { mergeResults } from '@/lib/sync/mapping';
import { useAuth } from '@/lib/auth/useAuth';
import { profileLabel } from '@/lib/auth/profile';

// React glue for lib/sync/controller.ts. Owns the timers; the controller owns the logic.
//   - every local change to results/athletes is diffed into the outbound queue, then flushed ~0.6 s later
//   - a 3 s poll (only while the tab is visible) flushes anything pending and pulls what other phones wrote
//   - judge/admin phones publish their station's "up now" to live_state (debounced), but only while the
//     Judge Pad tab is open, so an admin phone parked on Setup never fights the station's judge
//   - admin phones that can publish (signed-in account, or a legacy publish key) auto re-publish when meet config
//     (divisions, events, weights) or roster membership changes; the server may refuse (scored athlete, accepted
//     registration, cap) and the refusal shows in the Sync panel while the next pull restores the roster
//   - v2: a signed-in promoter's JWT rides on every call (controller.setAccessToken), so publishing needs no key
// Returns status 'off' when NEXT_PUBLIC_SUPABASE_* is not configured; the app then works exactly as before.
export const POLL_MS = 3000;
const PUSH_DEBOUNCE_MS = 600;
const LIVE_DEBOUNCE_MS = 400;
const REPUBLISH_DEBOUNCE_MS = 1500;

export const OFF_STATUS = { state: 'off', pending: 0, lastSyncAt: null, error: null };

export function slugFor(meet) {
  const base = meet.slug || meet.name || 'meet';
  return String(base).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'meet';
}

// What to hand zt_publish_meet as p_key: the saved key when there is one, else null. Signed out, null is refused by
// the server. Signed in, null means "use auth.uid()", and a key alongside the JWT claims an ownerless meet that was
// published with that key before accounts existed (006; Astra gate HIGH, 10/17 pm). Before this the signed-in
// phone always sent null and the claim the server asked for could not be made from the UI.
export function keyToSend(signedIn, publishKey) {
  void signedIn;
  return publishKey || null;
}

export function useMeetSync({ state, setState, applyNewState, roleLock, station, live, activeTab = 'judge' }) {
  const env = useMemo(() => readSyncEnv(), []);
  const stateRef = useRef(state);
  stateRef.current = state;
  const ctlRef = useRef(null);
  const [status, setStatus] = useState(OFF_STATUS);
  const [link, setLink] = useState(null);
  const [publishKey, setPublishKeyState] = useState('');
  const timers = useRef({});
  const auth = useAuth();
  const accessToken = auth.session?.access_token ?? null;
  const userId = auth.session?.user?.id ?? auth.user?.id ?? null;
  const signedIn = !!accessToken;
  // 10/21 (Kurt): the publish key is retired from the UI. Publishing needs a signed-in account; a key already saved on
  // this phone still rides along (keyToSend) so a meet published with it before accounts existed is claimed, not refused.
  const canPublish = signedIn;
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const setPublishKey = useCallback((k) => {
    setPublishKeyState(k);
    try { if (k) localStorage.setItem(PUBLISH_KEY_KEY, k); else localStorage.removeItem(PUBLISH_KEY_KEY); } catch (e) { /* ignore */ }
  }, []);

  // Controller lifetime = component lifetime.
  useEffect(() => {
    if (!env) return undefined;
    const ctl = new SyncController({
      client: createSyncClient(env),
      storage: localStorage,
      deviceId: getDeviceId(localStorage),
      getState: () => stateRef.current,
      onIncoming: (patch) =>
        setState((prev) => {
          let next = prev;
          if (patch.results) {
            const { merged, changed } = mergeResults(prev.results, patch.results);
            if (changed) next = { ...next, results: merged };
          }
          // Athletes have no per-row clock, so only apply the server's roster if nothing changed locally since the
          // controller took its snapshot; otherwise skip this round and let the next pull reconcile.
          if (patch.athletes && prev.athletes === stateRef.current.athletes) {
            const { merged, changed } = mergeAthletes(prev.athletes, patch.athletes);
            if (changed) next = { ...next, athletes: merged };
          }
          // Admin republished the meet config. Keep this phone's id and PIN (public columns omit admin_pin; a joined
          // phone has none and keeps none, so `adminPin` stays absent rather than becoming undefined-as-key).
          if (patch.config) {
            const { meet, divisions, events } = patch.config;
            const { adminPin: _drop, ...meetPublic } = meet;
            void _drop;
            next = {
              ...next,
              meet: { ...prev.meet, ...meetPublic, id: prev.meet.id },
              divisions,
              events,
            };
          }
          return next;
        }),
      onStatus: (s, l) => {
        setStatus(s);
        setLink(l);
      },
    });
    ctl.setAccessToken(tokenRef.current, userIdRef.current);
    ctlRef.current = ctl;
    setStatus(ctl.status);
    setLink(ctl.link);
    try { setPublishKeyState(localStorage.getItem(PUBLISH_KEY_KEY) || ''); } catch (e) { /* ignore */ }
    return () => {
      ctlRef.current = null;
      Object.values(timers.current).forEach(clearTimeout);
    };
  }, [env, setState]);

  // Hand the account token to the controller on sign-in, refresh and sign-out.
  useEffect(() => {
    ctlRef.current?.setAccessToken(accessToken, userId);
  }, [accessToken, userId]);

  const debounce = useCallback((key, ms, fn) => {
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(fn, ms);
  }, []);

  const syncNow = useCallback(() => ctlRef.current?.tick(), []);

  // Outbound: diff on every results/athletes change.
  useEffect(() => {
    const ctl = ctlRef.current;
    if (!ctl || !ctl.link) return;
    if (ctl.noteLocalChange() > 0) debounce('push', PUSH_DEBOUNCE_MS, syncNow);
  }, [state.results, state.athletes, state.meet.id, debounce, syncNow]);

  // Poll while linked and visible; also on tab focus and when the network comes back.
  const linked = !!link;
  useEffect(() => {
    if (!linked) return undefined;
    const tick = () => { if (document.visibilityState === 'visible') syncNow(); };
    const id = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('online', tick);
    window.addEventListener('focus', tick);
    tick();
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('online', tick);
      window.removeEventListener('focus', tick);
    };
  }, [linked, syncNow]);

  // Live "up now" for this station (judge/admin phones only).
  const liveEventId = live?.eventId ?? null;
  const liveDivisionId = live?.divisionId ?? null;
  const liveAthleteId = live?.athleteId ?? null;
  const liveLane2Id = live?.lane2AthleteId ?? null;
  useEffect(() => {
    if (!linked || !station || station === 'ALL') return;
    if (roleLock !== 'judge' && roleLock !== 'admin') return;
    if (activeTab !== 'judge') return;
    debounce('live', LIVE_DEBOUNCE_MS, () => {
      ctlRef.current?.setLive({
        station,
        current_event_id: liveEventId,
        current_division_id: liveDivisionId,
        current_athlete_id: liveAthleteId,
        lane2_athlete_id: liveLane2Id || null,
      });
      syncNow();
    });
  }, [linked, roleLock, station, activeTab, liveEventId, liveDivisionId, liveAthleteId, liveLane2Id, debounce, syncNow]);

  // Admin auto re-publish on config change (weights, events, divisions, stations) and on roster membership (R5, Astra
  // rehearsal 10/17): athlete edits travel through the queue, but a removed athlete leaves the server only through
  // zt_publish_meet, so the ids are in the signature (not the rows: a pit-crew rack-height edit is not a republish).
  const configSig = JSON.stringify({ m: state.meet, d: state.divisions, e: state.events, a: state.athletes.map((x) => x.id) });
  const prevSig = useRef(configSig);
  useEffect(() => {
    if (prevSig.current === configSig) return;   // key paste, StrictMode double-run, etc. are not config changes
    prevSig.current = configSig;
    const ctl = ctlRef.current;
    if (!ctl?.link || ctl.link.role !== 'admin' || !canPublish) return;
    debounce('republish', REPUBLISH_DEBOUNCE_MS, () => {
      const meet = stateRef.current.meet;
      // The controller records a refusal in status.publishError (shown in the Sync panel); nothing else to do here.
      ctlRef.current?.publish({ slug: ctlRef.current.link?.slug || slugFor(meet), stations: meet.stations, isDemo: !!meet.isDemo }, keyToSend(signedIn, publishKey)).catch(() => {});
    });
  }, [configSig, publishKey, canPublish, signedIn, debounce]);

  const publish = useCallback(async (opts = {}) => {
    const ctl = ctlRef.current;
    if (!ctl) throw new Error('Sync is not configured on this build.');
    const key = opts.publishKey ?? publishKey;
    if (!signedIn) throw new Error('Sign in to your ZeroTacky account to publish this meet.');
    const meet = stateRef.current.meet;
    // Signed in: the server records this account as owner / member. A saved key goes along too, so a meet that was
    // published with the key before accounts existed is claimed by this account (006) instead of being refused.
    const out = await ctl.publish({ slug: opts.slug || slugFor(meet), stations: meet.stations, isDemo: !!meet.isDemo }, keyToSend(signedIn, key));
    return out;
  }, [publishKey, signedIn]);

  // Linked phone: server-side admin PIN check (007). Resolves null when not linked (useRoleLock then uses local state).
  const checkAdminPin = useCallback(async (pin) => {
    const ctl = ctlRef.current;
    if (!ctl?.link) return null;
    return ctl.checkAdminPin(pin);
  }, []);

  const joinByCode = useCallback(async (code) => {
    const ctl = ctlRef.current;
    if (!ctl) throw new Error('Sync is not configured on this build.');
    const remote = await ctl.lookupJoinCode(code);
    if (!remote) throw new Error('No meet with that code.');
    applyNewState(remote.state, 'join meet');
    ctl.attach(remote, 'device');
    return remote;
  }, [applyNewState]);

  const unlink = useCallback(() => ctlRef.current?.unlink(), []);

  return {
    enabled: !!env,
    status,
    link,
    publish,
    checkAdminPin,
    joinByCode,
    unlink,
    syncNow,
    publishKey,
    setPublishKey,
    canPublish,
    account: signedIn ? { email: auth.user?.email ?? null, label: profileLabel(auth.profile, auth.user?.email), loading: auth.loading } : null,
    deviceId: ctlRef.current?.deviceId ?? null,
  };
}
