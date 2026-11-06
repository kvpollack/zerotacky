import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { rpcAsUser } from '@/lib/email/send';
import { readMailEnv, runBroadcast, type RunResult } from '@/lib/email/broadcastRun';
import { siteUrl } from '@/lib/website/siteUrl';

// GET /api/cron/reminders   Authorization: Bearer <CRON_SECRET>   (Vercel adds the header itself when the env var exists)
// -> { ok: true, today, queued: n, runs: RunResult[], stopped?: 'time_budget' } | { error }
//
// 042 (11/5, feature gaps #10), hardened 043. Once a day (vercel.json, 13:00 UTC) zt_queue_due_reminders looks for
// listed, live meets whose date is seven days or one day out, with reminders still on, and queues one reminder per meet
// per kind to the accepted athletes who have not opted out (unique index + ON CONFLICT: a second call is a no-op). Each
// queued broadcast is then sent in chunks with p_server = true (the only way a null uid is accepted, BC-01). A reminder
// still holding queued rows from the last day (transient failure, time budget) is picked up too; its meet is rechecked
// at claim (BC-06). One time budget covers the whole pass (BC-08); what is left waits for the next day.
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const BUDGET_MS = 240_000;

function todayInNewYork(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function secretMatches(given: string, secret: string): boolean {
  const a = Buffer.from(given); const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  const started = Date.now();
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not set; reminders are off.' }, { status: 503 });
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!secretMatches(given, secret)) return NextResponse.json({ error: 'Not allowed.' }, { status: 401 });

  const envRead = readMailEnv(siteUrl().origin);
  if ('missing' in envRead) return NextResponse.json({ error: envRead.missing }, { status: 503 });
  const env = envRead.env;
  const today = todayInNewYork();

  let ids: string[];
  try {
    ids = await rpcAsUser<string[]>(env.supaUrl, env.anon, env.anon, 'zt_queue_due_reminders', { p_today: today, p_key: env.mailKey });
  } catch (e) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 200) }, { status: 502 });
  }

  const runs: RunResult[] = [];
  const errors: string[] = [];
  let stopped: 'time_budget' | undefined;
  for (const id of ids ?? []) {
    if (Date.now() > started + BUDGET_MS) { stopped = 'time_budget'; break; }
    try { runs.push(await runBroadcast(env, env.anon, id, { server: true, deadlineMs: started + BUDGET_MS })); }
    catch (e) { errors.push(`${id}: ${(e instanceof Error ? e.message : String(e)).slice(0, 160)}`); }
  }
  return NextResponse.json({ ok: true, today, queued: (ids ?? []).length, runs, ...(stopped ? { stopped } : {}), ...(errors.length ? { errors } : {}) });
}
