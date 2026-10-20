// Minimal PostgREST client over fetch. No SDK: adding one would require regenerating pnpm-lock.yaml,
// which no machine in this project can do. Every call carries the anon key; judge/pit-crew devices
// also carry the meet join code in `x-zt-join`, which the RLS policies check server-side.

export interface SyncConfig {
  url: string;          // https://xxxx.supabase.co
  anonKey: string;
  joinCode?: string;
  grantToken?: string;  // 011: judge grant issued by zt_check_admin_pin; results/live_state writes need it (x-zt-grant)
  accessToken?: string; // signed-in promoter's Supabase JWT (v2); falls back to anon key
  fetchImpl?: typeof fetch;
}

export class SyncError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface SyncClient {
  select<T = Record<string, unknown>>(table: string, query: string): Promise<T[]>;
  upsert<T extends Record<string, unknown>>(table: string, rows: T[], onConflict: string): Promise<void>;
  insert<T extends Record<string, unknown>>(table: string, rows: T[]): Promise<T[]>;
  update<T extends Record<string, unknown>>(table: string, query: string, patch: Partial<T>): Promise<void>;
  del(table: string, query: string): Promise<void>;
  rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T>;
  withJoinCode(code: string, grantToken?: string | null): SyncClient;
  withAccessToken(token: string | null | undefined): SyncClient; // v2: signed-in promoter; null = back to anon
}

export function readSyncEnv(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url: url.replace(/\/+$/, ''), anonKey };
}

export function createSyncClient(cfg: SyncConfig): SyncClient {
  const maybeFetch = cfg.fetchImpl ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined);
  if (!maybeFetch) throw new Error('fetch is not available');
  const f: typeof fetch = maybeFetch;
  const base = cfg.url.replace(/\/+$/, '');

  const headers = (extra: Record<string, string> = {}) => {
    const h: Record<string, string> = {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${cfg.accessToken ?? cfg.anonKey}`,
      'Content-Type': 'application/json',
      ...extra,
    };
    if (cfg.joinCode) h['x-zt-join'] = cfg.joinCode;
    if (cfg.grantToken) h['x-zt-grant'] = cfg.grantToken;
    return h;
  };

  async function call<T>(path: string, init: RequestInit): Promise<T> {
    const res = await f(`${base}${path}`, init);
    if (!res.ok) {
      let msg = `${res.status} ${res.statusText}`;
      try {
        const body = await res.json();
        if (body?.message) msg = `${res.status}: ${body.message}`;
      } catch {
        // non-JSON error body
      }
      throw new SyncError(res.status, msg);
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  const client: SyncClient = {
    select: (table, query) => call(`/rest/v1/${table}?${query}`, { method: 'GET', headers: headers() }),
    upsert: (table, rows, onConflict) =>
      call(`/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
        method: 'POST',
        headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify(rows),
      }),
    insert: (table, rows) =>
      call(`/rest/v1/${table}`, { method: 'POST', headers: headers({ Prefer: 'return=representation' }), body: JSON.stringify(rows) }),
    update: (table, query, patch) =>
      call(`/rest/v1/${table}?${query}`, { method: 'PATCH', headers: headers({ Prefer: 'return=minimal' }), body: JSON.stringify(patch) }),
    del: (table, query) => call(`/rest/v1/${table}?${query}`, { method: 'DELETE', headers: headers({ Prefer: 'return=minimal' }) }),
    rpc: (fn, args) => call(`/rest/v1/rpc/${fn}`, { method: 'POST', headers: headers(), body: JSON.stringify(args) }),
    withJoinCode: (code, grantToken) => createSyncClient({ ...cfg, joinCode: code, grantToken: grantToken ?? undefined }),
    withAccessToken: (token) => createSyncClient({ ...cfg, accessToken: token || undefined }),
  };
  return client;
}
