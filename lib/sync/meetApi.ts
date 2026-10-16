// Meet-level operations on top of the PostgREST client. Pure except for the network.
import type { AppState, Result } from '../types';
import type { SyncClient } from './client';
import { stateToRows, rowsToState, rowToResult, rowToAthlete, resultToRow, athleteToRow } from './mapping';
import type { MeetRow, DivisionRow, EventRow, AthleteRow, ResultRow, PublishExtra } from './mapping';

export interface LiveStateRow {
  meet_id: string;
  station: string;
  current_event_id: string | null;
  current_division_id: string | null;
  current_athlete_id: string | null;
  lane2_athlete_id: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface RemoteMeet {
  state: AppState;
  slug: string;
  joinCode?: string;       // only present when fetched via join code (zt_meet_by_join_code); the column is not
                           // readable through the public select, nor is admin_pin
  stations: MeetRow['stations'];
  isDemo: boolean;
  latestServerAt: string | null;   // max results.server_at seen; starting pull watermark
  updatedAt: string | null;        // meets.updated_at; config watermark (see pullChanges / fetchMeetConfig)
}

// What a linked judge phone needs when the admin republishes: meet settings + divisions + events.
export interface MeetConfig { meet: AppState['meet']; divisions: AppState['divisions']; events: AppState['events']; updatedAt: string | null }

// Public columns only (join_code and admin_pin are revoked from anon in the schema).
const MEET_COLS = 'id,slug,name,date,run_order_method,tiebreaker_rule,available_plates,collar_weight_per_pair,stations,is_demo,updated_at';

export function latestServerAt(rows: { server_at?: string }[]): string | null {
  let m: string | null = null;
  for (const r of rows) if (r.server_at && (!m || r.server_at > m)) m = r.server_at;
  return m;
}

async function fetchChildren(client: SyncClient, meetId: string) {
  const q = `meet_id=eq.${meetId}`;
  const [divisions, events, athletes, results] = await Promise.all([
    client.select<DivisionRow>('divisions', `${q}&order=sort_order.asc`),
    client.select<EventRow>('events', `${q}&order=event_number.asc`),
    client.select<AthleteRow>('athletes', q),
    client.select<ResultRow>('results', q),
  ]);
  return { divisions, events, athletes, results };
}

function toRemoteMeet(meet: MeetRow, kids: Awaited<ReturnType<typeof fetchChildren>>): RemoteMeet {
  return {
    state: rowsToState({ meet, ...kids }),
    slug: meet.slug,
    joinCode: meet.join_code,
    stations: meet.stations,
    isDemo: meet.is_demo,
    latestServerAt: latestServerAt(kids.results),
    updatedAt: meet.updated_at ?? null,
  };
}

export async function fetchMeetBySlug(client: SyncClient, slug: string): Promise<RemoteMeet | null> {
  const meets = await client.select<MeetRow>('meets', `slug=eq.${encodeURIComponent(slug)}&select=${MEET_COLS}&limit=1`);
  if (meets.length === 0) return null;
  return toRemoteMeet(meets[0], await fetchChildren(client, meets[0].id));
}

// Join code -> full meet row (incl. join_code and admin_pin) via a security-definer RPC, so the codes never
// travel in a public select. Returns null for an unknown code.
export async function fetchMeetByJoinCode(client: SyncClient, code: string): Promise<RemoteMeet | null> {
  const meet = await client.rpc<MeetRow | null>('zt_meet_by_join_code', { p_code: code.trim().toUpperCase() });
  if (!meet || !meet.id) return null;
  return toRemoteMeet(meet, await fetchChildren(client, meet.id));
}

// Publish the full meet (promoter/admin phone). Goes through the zt_publish_meet RPC, which checks the caller
// server-side (a signed-in user via the client's access token, or a legacy publish key), upserts meet + divisions +
// events + athletes (authoritative: stale children are removed) and merges results last-writer-wins. Returns the
// remote meet id and its join code. `publishKey` may be null when the client carries a session token.
export async function publishMeet(client: SyncClient, state: AppState, extra: PublishExtra, publishKey: string | null): Promise<{ id: string; joinCode: string }> {
  const rows = stateToRows(state, extra);
  const out = await client.rpc<{ id: string; join_code: string }>('zt_publish_meet', {
    p_key: publishKey || null,
    p_meet: rows.meet,
    p_divisions: rows.divisions,
    p_events: rows.events,
    p_athletes: rows.athletes,
    p_results: rows.results,
  });
  return { id: out.id, joinCode: out.join_code };
}

const CHILD_KEY = 'meet_id,id';

export async function pushResults(client: SyncClient, meetId: string, results: Result[], deviceId: string): Promise<void> {
  if (results.length === 0) return;
  await client.upsert('results', results.map((r) => resultToRow(r, meetId, deviceId)) as unknown as Record<string, unknown>[], CHILD_KEY);
}

export async function pushAthletes(client: SyncClient, meetId: string, athletes: AppState['athletes']): Promise<void> {
  if (athletes.length === 0) return;
  await client.upsert('athletes', athletes.map((a) => athleteToRow(a, meetId)) as unknown as Record<string, unknown>[], CHILD_KEY);
}

// Incremental pull: results written since `sinceIso` by the server clock (server_at, inclusive: a row that
// shares the watermark's timestamp is re-read rather than missed; mergeResults makes that a no-op), plus the
// full athlete list (small). Client-stamped updated_at is only used for last-writer-wins.
export async function pullChanges(client: SyncClient, meetId: string, sinceIso: string | null) {
  const q = `meet_id=eq.${meetId}` + (sinceIso ? `&server_at=gte.${encodeURIComponent(sinceIso)}` : '');
  const [resultRows, athleteRows, meetRows] = await Promise.all([
    client.select<ResultRow>('results', `${q}&order=server_at.asc`),
    client.select<AthleteRow>('athletes', `meet_id=eq.${meetId}`),
    client.select<{ updated_at: string }>('meets', `id=eq.${meetId}&select=updated_at&limit=1`),
  ]);
  const results = resultRows.map(rowToResult);
  const latestIso = latestServerAt(resultRows) ?? sinceIso;
  return { results, athletes: athleteRows.map(rowToAthlete), latestIso, meetUpdatedAt: meetRows[0]?.updated_at ?? null };
}

// Full config re-read after pullChanges reports a newer meets.updated_at (admin republished weights, events,
// stations...). Public columns only, so admin_pin is absent: callers keep the local one.
export async function fetchMeetConfig(client: SyncClient, meetId: string): Promise<MeetConfig | null> {
  const [meets, divisions, events] = await Promise.all([
    client.select<MeetRow>('meets', `id=eq.${meetId}&select=${MEET_COLS}&limit=1`),
    client.select<DivisionRow>('divisions', `meet_id=eq.${meetId}&order=sort_order.asc`),
    client.select<EventRow>('events', `meet_id=eq.${meetId}&order=event_number.asc`),
  ]);
  if (meets.length === 0) return null;
  const st = rowsToState({ meet: meets[0], divisions, events, athletes: [], results: [] });
  return { meet: st.meet, divisions: st.divisions, events: st.events, updatedAt: meets[0].updated_at ?? null };
}

export async function setLiveState(client: SyncClient, row: Omit<LiveStateRow, 'updated_at'>): Promise<void> {
  await client.upsert('live_state', [{ ...row, updated_at: new Date().toISOString() } as unknown as Record<string, unknown>], 'meet_id,station');
}

export async function getLiveState(client: SyncClient, meetId: string): Promise<LiveStateRow[]> {
  return client.select<LiveStateRow>('live_state', `meet_id=eq.${meetId}`);
}
