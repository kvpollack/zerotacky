// Sync controller: everything the hook needs except React. Owns the link (which remote meet this device
// is attached to), the outbound queue, the "known" watermark per result, and the flush/pull cycle.
// No timers in here; the hook decides when to call tick(). Unit-tested in test/controller.test.mjs.
import type { AppState, Athlete, Result } from '../types';
import type { SyncClient } from './client';
import { SyncError } from './client';
import { mergeResults, resultToRow, athleteToRow } from './mapping';
import type { PublishExtra } from './mapping';
import { enqueue, groupByTable, removeFlushed, readQueue, writeQueue } from './queue';
import type { QueueItem } from './queue';
import { publishMeet, fetchMeetByJoinCode, fetchMeetBySlug, pullChanges, fetchMeetConfig, checkAdminPin, type MeetConfig } from './meetApi';
import type { RemoteMeet, LiveStateRow } from './meetApi';

export const LINK_KEY = 'ZEROTACKY_SYNC_LINK_V1';
export const DEVICE_KEY = 'ZEROTACKY_DEVICE_ID_V1';
export const PUBLISH_KEY_KEY = 'ZEROTACKY_PUBLISH_KEY_V1';

export interface SyncLink {
  meetId: string;        // remote uuid
  localMeetId: string;   // state.meet.id this link belongs to; a preset switch drops the link
  slug: string;
  joinCode: string;
  role: 'admin' | 'device';
  // How this phone earned its write authority (Astra A4, 10/17). 'account' links pause when the account signs out;
  // 'key' (legacy publish key) and 'join' (volunteer join code) links are intentionally accountless and keep going.
  // Absent on links written before 10/17: treated as 'key' for admin and 'join' for device.
  auth?: 'account' | 'key' | 'join';
  // Astra gate MED (10/17 pm): the account an 'account' link was published under. A different signed-in user on the
  // same phone does not resume this link's queue; they unlink (or the owner signs back in).
  userId?: string | null;
  since: string | null;  // results watermark for incremental pulls
  configAt?: string | null;  // meets.updated_at last applied on this phone (device role only)
}

export type SyncState = 'off' | 'idle' | 'syncing' | 'offline' | 'error' | 'paused';
export interface SyncStatus {
  state: SyncState;
  pending: number;
  lastSyncAt: number | null;
  error: string | null;
  dropped: number;        // rows the server rejected for good (4xx) and we gave up on; see flush()
  // Astra gate LOW (10/17 pm): the last publish/re-publish refusal. Survives successful ticks (which only clear
  // `error`) until the next publish succeeds, so an auto re-publish the server refused stays visible in Setup.
  publishError?: string | null;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function readLink(storage: StorageLike): SyncLink | null {
  try {
    const raw = storage.getItem(LINK_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v.meetId === 'string' && typeof v.joinCode === 'string' ? (v as SyncLink) : null;
  } catch { return null; }
}
export function writeLink(storage: StorageLike, link: SyncLink | null): void {
  try { if (link) storage.setItem(LINK_KEY, JSON.stringify(link)); else storage.removeItem(LINK_KEY); } catch { /* ignore */ }
}
export function getDeviceId(storage: StorageLike, random: () => string = defaultRandomId): string {
  try {
    const cur = storage.getItem(DEVICE_KEY);
    if (cur) return cur;
    const id = random();
    storage.setItem(DEVICE_KEY, id);
    return id;
  } catch { return random(); }
}
function defaultRandomId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return 'dev-' + c.randomUUID().slice(0, 8);
  return 'dev-' + Math.random().toString(36).slice(2, 10);
}
export function newMeetUuid(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // RFC 4122 v4 fallback
  const h = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) s += '-';
    else if (i === 14) s += '4';
    else if (i === 19) s += h[(Math.random() * 4) | 8];
    else s += h[(Math.random() * 16) | 0];
  }
  return s;
}

// Keep local order for athletes that still exist, append newcomers, drop removed. Pure.
export function mergeAthletes(local: Athlete[], incoming: Athlete[]): { merged: Athlete[]; changed: boolean } {
  const inc = new Map(incoming.map((a) => [a.id, a]));
  const merged: Athlete[] = [];
  let changed = local.length !== incoming.length;
  for (const a of local) {
    const n = inc.get(a.id);
    if (!n) { changed = true; continue; }
    if (athleteSig(n) !== athleteSig(a)) changed = true;
    merged.push(n);
    inc.delete(a.id);
  }
  for (const n of inc.values()) { merged.push(n); changed = true; }
  return { merged: changed ? merged : local, changed };
}

export function athleteSig(a: Athlete): string {
  const o = a as unknown as Record<string, unknown>;
  return JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
}

export function isNetworkError(e: unknown): boolean {
  if (e instanceof SyncError) return e.status >= 500 || e.status === 0;
  return true; // TypeError: Failed to fetch, AbortError, etc.
}

export interface ControllerOpts {
  client: SyncClient;
  storage: StorageLike;
  deviceId: string;
  getState: () => AppState;
  onIncoming: (patch: { results?: Result[]; athletes?: Athlete[]; config?: MeetConfig }) => void;
  onStatus?: (s: SyncStatus, link: SyncLink | null) => void;
  now?: () => number;
}

const ON_CONFLICT: Record<string, string> = { results: 'meet_id,id', athletes: 'meet_id,id', live_state: 'meet_id,station' };

export class SyncController {
  link: SyncLink | null;
  status: SyncStatus = { state: 'off', pending: 0, lastSyncAt: null, error: null, dropped: 0, publishError: null };
  private rerun = false;
  private queue: QueueItem[];
  private known = new Map<string, number>();        // result id -> updatedAt last seen remote/pushed
  private knownAthletes = new Map<string, string>(); // athlete id -> sig last seen remote/pushed
  private busy = false;
  // Astra A4: bumped on every token change. Work that started under an older generation does not update the link,
  // the queue, the watermarks or local state when it completes.
  private session = 0;
  private accessToken: string | null = null;
  private userId: string | null = null;
  get deviceId(): string { return this.o.deviceId; }
  private o: ControllerOpts;

  constructor(opts: ControllerOpts) {
    this.o = opts;
    this.link = readLink(opts.storage);
    this.queue = readQueue(opts.storage);
    if (this.link) {
      // after a reload, treat current local state as already known so we don't re-push everything
      this.seedKnown(opts.getState());
      this.setStatus({ state: 'idle' });
      this.refreshPaused();   // an account link with no token yet shows paused until setAccessToken() arrives
    }
  }

  private now(): number { return (this.o.now ?? Date.now)(); }

  private setStatus(patch: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...patch, pending: this.queue.length };
    this.o.onStatus?.(this.status, this.link);
  }

  private seedKnown(state: AppState): void {
    this.known.clear();
    this.knownAthletes.clear();
    for (const r of state.results) this.known.set(r.id, r.updatedAt ?? 0);
    for (const a of state.athletes) this.knownAthletes.set(a.id, athleteSig(a));
  }

  private get writer(): SyncClient {
    return this.link ? this.o.client.withJoinCode(this.link.joinCode) : this.o.client;
  }

  private persistQueue(): void { writeQueue(this.o.storage, this.queue); }

  // ---- linking ----
  private setLink(link: SyncLink | null): void {
    this.link = link;
    writeLink(this.o.storage, link);
    if (!link) { this.queue = []; this.persistQueue(); this.known.clear(); this.knownAthletes.clear(); }
    this.setStatus({ state: link ? 'idle' : 'off', error: null, dropped: 0, publishError: null });
  }

  unlink(): void { this.setLink(null); }

  // v2: signed-in promoter. Every later call (publish, pushes, pulls) carries the user's JWT instead of the anon
  // key, so zt_publish_meet sees auth.uid() and the RLS member policies apply. null drops back to anon.
  // Astra A4: a token change invalidates everything in flight (session generation), and signing out of an
  // account-published link pauses it: unsent work stays queued, nothing is sent or applied until a token is back.
  // `userId` is the signed-in user's id when known. An 'account' link remembers the id it was published under
  // and stays paused for any other account (Astra gate MED). Callers that do not know the id pass nothing; the
  // link is then bound on its next publish.
  setAccessToken(token: string | null, userId: string | null = null): void {
    const changed = (token ?? null) !== this.accessToken || (userId ?? null) !== this.userId;
    this.accessToken = token ?? null;
    this.userId = token ? (userId ?? null) : null;
    this.o = { ...this.o, client: this.o.client.withAccessToken(token) };
    if (!changed) return;
    this.session++;
    this.refreshPaused();
  }

  // 'account' links need a token from the account that published them; everything else is accountless by design.
  get paused(): boolean {
    if (!this.link || this.linkAuth(this.link) !== 'account') return false;
    if (this.accessToken === null) return true;
    return this.otherAccount;
  }

  // Signed in, but not as the account this link belongs to (both ids known and different).
  private get otherAccount(): boolean {
    return !!this.link && !!this.link.userId && !!this.userId && this.link.userId !== this.userId;
  }

  linkAuth(link: SyncLink): NonNullable<SyncLink['auth']> {
    return link.auth ?? (link.role === 'admin' ? 'key' : 'join');
  }

  private refreshPaused(): void {
    if (!this.link) return;
    if (this.paused) {
      this.setStatus({
        state: 'paused',
        error: this.otherAccount
          ? 'This meet was published from a different ZeroTacky account. Sign in as that account to resume syncing, or unlink this phone. Scores stay on this phone meanwhile.'
          : 'Signed out. This meet was published from your account; sign back in to resume syncing. Scores stay on this phone meanwhile.',
      });
    } else if (this.status.state === 'paused') this.setStatus({ state: 'idle', error: null });
  }

  // Admin phone: publish (or re-publish) the whole meet. Keeps the remote uuid across re-publishes.
  // `publishKey` is null when the phone is signed in (setAccessToken) and the server should use auth.uid(). A signed-in
  // phone that also holds a key sends both: that is how an ownerless meet published with the key is claimed (006).
  async publish(extra: Omit<PublishExtra, 'meetId' | 'deviceId'>, publishKey: string | null): Promise<SyncLink> {
    // Re-publish is authoritative for the roster, so first bring in anything the floor phones added.
    if (this.link && this.link.localMeetId === this.o.getState().meet.id) {
      try { await this.flush(); await this.pull(); } catch { /* publish proceeds with what we have */ }
    }
    const state = this.o.getState();
    const meetId = this.link?.localMeetId === state.meet.id ? this.link.meetId : newMeetUuid();
    if (publishKey === null && this.accessToken === null) throw new Error('Sign in to your ZeroTacky account (or enter a publish key) first.');
    if (publishKey === null && this.otherAccount) throw new Error('This meet was published from a different ZeroTacky account. Sign in as that account, or unlink this phone and publish again.');
    const gen = this.session;
    this.setStatus({ state: 'syncing', error: null });
    try {
      const out = await publishMeet(this.o.client, state, { ...extra, meetId, deviceId: this.o.deviceId }, publishKey);
      if (gen !== this.session) throw new Error('Sign-in changed while publishing; this phone was not linked. Publish again.');
      const link: SyncLink = {
        meetId: out.id, localMeetId: state.meet.id, slug: extra.slug, joinCode: out.joinCode, role: 'admin',
        auth: publishKey === null ? 'account' : 'key',
        userId: this.accessToken ? this.userId : null,
        since: this.link?.meetId === out.id ? this.link.since : null,
      };
      this.setLink(link);
      this.seedKnown(state);
      this.setStatus({ state: 'idle', lastSyncAt: this.now(), publishError: null });
      return link;
    } catch (e) {
      this.fail(e);
      this.setStatus({ publishError: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  }

  // Joined phone: ask the server whether `pin` is this meet's admin PIN (zt_check_admin_pin, 007). The join RPC no
  // longer returns admin_pin, so this is the only way a volunteer phone can unlock admin controls.
  async checkAdminPin(pin: string): Promise<boolean> {
    if (!this.link) return false;
    return checkAdminPin(this.o.client, this.link.joinCode, pin);
  }

  // Judge / pit-crew phone: trade a join code for the meet. Caller applies `remote.state` to the app,
  // then calls attach(). Two steps so the hook can run its normal "replace state" path in between.
  async lookupJoinCode(code: string): Promise<RemoteMeet | null> {
    this.setStatus({ state: 'syncing', error: null });
    try {
      const remote = await fetchMeetByJoinCode(this.o.client, code.trim().toUpperCase());
      this.setStatus({ state: this.link ? 'idle' : 'off' });
      return remote;
    } catch (e) { this.fail(e); throw e; }
  }

  async lookupSlug(slug: string): Promise<RemoteMeet | null> {
    return fetchMeetBySlug(this.o.client, slug);
  }

  attach(remote: RemoteMeet, role: SyncLink['role'] = 'device'): SyncLink {
    const link: SyncLink = { meetId: remote.state.meet.id, localMeetId: remote.state.meet.id, slug: remote.slug, joinCode: remote.joinCode ?? '', role, auth: 'join', since: remote.latestServerAt, configAt: remote.updatedAt ?? null };
    this.setLink(link);
    this.seedKnown(remote.state);
    this.setStatus({ state: 'idle', lastSyncAt: this.now() });
    return link;
  }

  // ---- outbound ----
  // Diff local state against the watermark and queue what changed. Cheap; call on every state change.
  noteLocalChange(): number {
    if (!this.link) return 0;
    const state = this.o.getState();
    if (state.meet.id !== this.link.localMeetId) { this.unlink(); return 0; }
    let added = 0;
    // Results we knew about that vanished locally (reset, snapshot restore): rewind the pull watermark so the
    // next pull brings the server's copies back instead of leaving this phone short.
    const localIds = new Set(state.results.map((r) => r.id));
    let vanished = false;
    for (const id of Array.from(this.known.keys())) if (!localIds.has(id)) { this.known.delete(id); vanished = true; }
    if (vanished && this.link.since) { this.link = { ...this.link, since: null }; writeLink(this.o.storage, this.link); }
    for (const r of state.results) {
      const seen = this.known.get(r.id) ?? -1;
      if ((r.updatedAt ?? 0) > seen) {
        this.queue = enqueue(this.queue, { table: 'results', id: r.id, row: resultToRow(r, this.link.meetId, this.o.deviceId) as unknown as Record<string, unknown> }, this.now());
        this.known.set(r.id, r.updatedAt ?? 0);
        added++;
      }
    }
    for (const a of state.athletes) {
      const sig = athleteSig(a);
      if (this.knownAthletes.get(a.id) !== sig) {
        this.queue = enqueue(this.queue, { table: 'athletes', id: a.id, row: athleteToRow(a, this.link.meetId) as unknown as Record<string, unknown> }, this.now());
        this.knownAthletes.set(a.id, sig);
        added++;
      }
    }
    if (added) { this.persistQueue(); this.setStatus({}); }
    return added;
  }

  setLive(row: Omit<LiveStateRow, 'updated_at' | 'meet_id' | 'updated_by'>): void {
    if (!this.link) return;
    const full = { ...row, meet_id: this.link.meetId, updated_by: this.o.deviceId, updated_at: new Date(this.now()).toISOString() };
    this.queue = enqueue(this.queue, { table: 'live_state', id: `${this.link.meetId}:${row.station}`, row: full }, this.now());
    this.persistQueue();
    this.setStatus({});
  }

  // Parents before children so FK checks pass (athlete row before its result).
  private static FLUSH_ORDER = ['athletes', 'results', 'live_state'];

  // Push the queue, one upsert per table. If a batch is rejected with a 4xx (an FK to a row the admin
  // deleted, a bad payload), retry row by row and drop the rows that still fail: one poisoned row must not
  // freeze the phone. Network errors propagate (the queue is kept for the next tick).
  async flush(): Promise<void> {
    if (!this.link || this.queue.length === 0 || this.paused) return;
    const gen = this.session;
    const groups = groupByTable(this.queue);
    const tables = [...SyncController.FLUSH_ORDER, ...Object.keys(groups).filter((t) => !SyncController.FLUSH_ORDER.includes(t))];
    let lastRejection: SyncError | null = null;
    for (const table of tables) {
      const items = groups[table];
      if (!items?.length) continue;
      const onConflict = ON_CONFLICT[table] ?? 'id';
      try {
        await this.writer.upsert(table, items.map((i) => i.row), onConflict);
        if (gen !== this.session) return;   // signed in/out meanwhile: upserts are idempotent, leave the queue for the next session
        this.queue = removeFlushed(this.queue, items);
      } catch (e) {
        if (gen !== this.session) return;
        if (isNetworkError(e)) { this.persistQueue(); throw e; }
        const err = e as SyncError;
        if (err.status === 401 || err.status === 403) { this.persistQueue(); throw e; }  // bad join code: keep everything
        let dropped = 0;
        for (const item of items) {
          try {
            await this.writer.upsert(table, [item.row], onConflict);
            if (gen !== this.session) return;
            this.queue = removeFlushed(this.queue, [item]);
          } catch (e2) {
            if (gen !== this.session) return;
            if (isNetworkError(e2)) { this.persistQueue(); throw e2; }
            this.queue = removeFlushed(this.queue, [item]);
            dropped++;
            lastRejection = e2 as SyncError;
          }
        }
        if (dropped) this.status = { ...this.status, dropped: this.status.dropped + dropped };
      }
      this.persistQueue();
    }
    if (lastRejection) this.setStatus({ error: `server rejected ${this.status.dropped} row(s): ${lastRejection.message}` });
  }

  // ---- inbound ----
  async pull(): Promise<void> {
    if (!this.link || this.paused) return;
    const gen = this.session;
    const hasPendingAthletes = this.queue.some((q) => q.table === 'athletes');
    const { results, athletes, latestIso, meetUpdatedAt } = await pullChanges(this.o.client, this.link.meetId, this.link.since);
    if (!this.link || gen !== this.session) return;   // unlinked or re-authenticated while awaiting
    const state = this.o.getState();
    const patch: { results?: Result[]; athletes?: Athlete[]; config?: MeetConfig } = {};
    // Admin republished (weights, events, stations, demo flag): judge phones re-read the config. The admin phone
    // is the source of that config, so it only records the stamp.
    if (meetUpdatedAt && meetUpdatedAt !== (this.link.configAt ?? null)) {
      if (this.link.role === 'device') {
        const cfg = await fetchMeetConfig(this.o.client, this.link.meetId);
        if (!this.link || gen !== this.session) return;
        if (cfg) patch.config = cfg;
      }
      this.link = { ...this.link, configAt: meetUpdatedAt }; writeLink(this.o.storage, this.link);
    }
    if (results.length) {
      const { merged, changed } = mergeResults(state.results, results);
      for (const r of results) this.known.set(r.id, Math.max(this.known.get(r.id) ?? 0, r.updatedAt ?? 0));
      if (changed) patch.results = merged;
    }
    // An empty roster from the server (meet missing, wiped, or a bad filter) never erases a local one.
    if (!hasPendingAthletes && (athletes.length > 0 || state.athletes.length === 0)) {
      const { merged, changed } = mergeAthletes(state.athletes, athletes);
      if (changed) {
        patch.athletes = merged;
        for (const a of merged) this.knownAthletes.set(a.id, athleteSig(a));
      }
    }
    if (patch.results || patch.athletes || patch.config) this.o.onIncoming(patch);
    if (latestIso !== this.link.since) { this.link = { ...this.link, since: latestIso }; writeLink(this.o.storage, this.link); }
  }

  // One cycle: push what we have, then pull what others wrote. Never overlaps itself; a tick requested
  // while one is running makes it go round once more.
  async tick(): Promise<void> {
    if (!this.link) return;
    if (this.paused) { this.refreshPaused(); return; }
    if (this.busy) { this.rerun = true; return; }
    this.busy = true;
    try {
      do {
        this.rerun = false;
        this.setStatus({ state: 'syncing' });
        try {
          let flushError: unknown = null;
          try { await this.flush(); } catch (e) { flushError = e; }
          if (flushError && isNetworkError(flushError)) throw flushError;
          await this.pull();                       // a rejected write must not stop us reading
          if (flushError) throw flushError;
          if (this.link && !this.paused) this.setStatus({ state: 'idle', error: this.status.dropped ? this.status.error : null, lastSyncAt: this.now() });
        } catch (e) {
          if (this.link && !this.paused) this.fail(e);
        }
      } while (this.rerun && this.link && !this.paused);
    } finally {
      this.busy = false;
    }
  }

  private fail(e: unknown): void {
    const msg = e instanceof Error ? e.message : String(e);
    this.setStatus({ state: isNetworkError(e) ? 'offline' : 'error', error: msg });
  }
}
