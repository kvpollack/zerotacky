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
import { publishMeet, fetchMeetByJoinCode, fetchMeetBySlug, pullChanges, fetchMeetConfig, type MeetConfig } from './meetApi';
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
  since: string | null;  // results watermark for incremental pulls
  configAt?: string | null;  // meets.updated_at last applied on this phone (device role only)
}

export type SyncState = 'off' | 'idle' | 'syncing' | 'offline' | 'error';
export interface SyncStatus {
  state: SyncState;
  pending: number;
  lastSyncAt: number | null;
  error: string | null;
  dropped: number;        // rows the server rejected for good (4xx) and we gave up on; see flush()
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
  status: SyncStatus = { state: 'off', pending: 0, lastSyncAt: null, error: null, dropped: 0 };
  private rerun = false;
  private queue: QueueItem[];
  private known = new Map<string, number>();        // result id -> updatedAt last seen remote/pushed
  private knownAthletes = new Map<string, string>(); // athlete id -> sig last seen remote/pushed
  private busy = false;
  get deviceId(): string { return this.o.deviceId; }
  private readonly o: ControllerOpts;

  constructor(opts: ControllerOpts) {
    this.o = opts;
    this.link = readLink(opts.storage);
    this.queue = readQueue(opts.storage);
    if (this.link) {
      // after a reload, treat current local state as already known so we don't re-push everything
      this.seedKnown(opts.getState());
      this.setStatus({ state: 'idle' });
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
    this.setStatus({ state: link ? 'idle' : 'off', error: null, dropped: 0 });
  }

  unlink(): void { this.setLink(null); }

  // Admin phone: publish (or re-publish) the whole meet. Keeps the remote uuid across re-publishes.
  async publish(extra: Omit<PublishExtra, 'meetId' | 'deviceId'>, publishKey: string): Promise<SyncLink> {
    // Re-publish is authoritative for the roster, so first bring in anything the floor phones added.
    if (this.link && this.link.localMeetId === this.o.getState().meet.id) {
      try { await this.flush(); await this.pull(); } catch { /* publish proceeds with what we have */ }
    }
    const state = this.o.getState();
    const meetId = this.link?.localMeetId === state.meet.id ? this.link.meetId : newMeetUuid();
    this.setStatus({ state: 'syncing', error: null });
    try {
      const out = await publishMeet(this.o.client, state, { ...extra, meetId, deviceId: this.o.deviceId }, publishKey);
      const link: SyncLink = {
        meetId: out.id, localMeetId: state.meet.id, slug: extra.slug, joinCode: out.joinCode, role: 'admin',
        since: this.link?.meetId === out.id ? this.link.since : null,
      };
      this.setLink(link);
      this.seedKnown(state);
      this.setStatus({ state: 'idle', lastSyncAt: this.now() });
      return link;
    } catch (e) {
      this.fail(e);
      throw e;
    }
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
    const link: SyncLink = { meetId: remote.state.meet.id, localMeetId: remote.state.meet.id, slug: remote.slug, joinCode: remote.joinCode ?? '', role, since: remote.latestServerAt, configAt: remote.updatedAt ?? null };
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
    if (!this.link || this.queue.length === 0) return;
    const groups = groupByTable(this.queue);
    const tables = [...SyncController.FLUSH_ORDER, ...Object.keys(groups).filter((t) => !SyncController.FLUSH_ORDER.includes(t))];
    let lastRejection: SyncError | null = null;
    for (const table of tables) {
      const items = groups[table];
      if (!items?.length) continue;
      const onConflict = ON_CONFLICT[table] ?? 'id';
      try {
        await this.writer.upsert(table, items.map((i) => i.row), onConflict);
        this.queue = removeFlushed(this.queue, items);
      } catch (e) {
        if (isNetworkError(e)) { this.persistQueue(); throw e; }
        const err = e as SyncError;
        if (err.status === 401 || err.status === 403) { this.persistQueue(); throw e; }  // bad join code: keep everything
        let dropped = 0;
        for (const item of items) {
          try {
            await this.writer.upsert(table, [item.row], onConflict);
            this.queue = removeFlushed(this.queue, [item]);
          } catch (e2) {
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
    if (!this.link) return;
    const hasPendingAthletes = this.queue.some((q) => q.table === 'athletes');
    const { results, athletes, latestIso, meetUpdatedAt } = await pullChanges(this.o.client, this.link.meetId, this.link.since);
    if (!this.link) return;   // unlinked while awaiting
    const state = this.o.getState();
    const patch: { results?: Result[]; athletes?: Athlete[]; config?: MeetConfig } = {};
    // Admin republished (weights, events, stations, demo flag): judge phones re-read the config. The admin phone
    // is the source of that config, so it only records the stamp.
    if (meetUpdatedAt && meetUpdatedAt !== (this.link.configAt ?? null)) {
      if (this.link.role === 'device') {
        const cfg = await fetchMeetConfig(this.o.client, this.link.meetId);
        if (!this.link) return;
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
          if (this.link) this.setStatus({ state: 'idle', error: this.status.dropped ? this.status.error : null, lastSyncAt: this.now() });
        } catch (e) {
          if (this.link) this.fail(e);
        }
      } while (this.rerun && this.link);
    } finally {
      this.busy = false;
    }
  }

  private fail(e: unknown): void {
    const msg = e instanceof Error ? e.message : String(e);
    this.setStatus({ state: isNetworkError(e) ? 'offline' : 'error', error: msg });
  }
}
