import { NextResponse } from 'next/server';
import { rpcAsUser } from '@/lib/email/send';
import { readMailEnv, runBroadcast, type RunResult } from '@/lib/email/broadcastRun';
import { siteUrl } from '@/lib/website/siteUrl';

// GET /api/cron/reminders   Authorization: Bearer <CRON_SECRET>   (Vercel adds the header itself when the env var exists)
// -> { ok: true, today, queued: n, runs: RunResult[] } | { error }
//
// 042 (11/5, feature gaps #10). Once a day (vercel.json, 13:00 UTC) zt_queue_due_reminders looks for listed, live meets
// whose date is seven days or one day out, with reminders still on, and queues one reminder broadcast per meet per kind
// to the accepted athletes who have not opted out (a unique index makes a second day's call a no-op). Each queued
// broadcast is then sent the same way a promoter's broadcast is. Any reminder left queued from an earlier day (a
// failed pass) is picked up too.
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function todayInNewYork(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not set; reminders are off.' }, { status: 503 });
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (given !== secret) return NextResponse.json({ error: 'Not allowed.' }, { status: 401 });

  const envRead = readMailEnv(siteUrl().origin);
  if ('missing' in envRead) return NextResponse.json({ error: envRead.missing }, { status: 503 });
  const env = envRead.env;
  const today = todayInNewYork();

  let ids: string[];
  try {
    ids = await rpcAsUser<string[]>(env.supaUrl, env.anon, env.anon, 'zt_queue_due_reminders', { p_today: today, p_key: env.mailKey });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }

  const runs: RunResult[] = [];
  const errors: string[] = [];
  for (const id of ids ?? []) {
    try { runs.push(await runBroadcast(env, env.anon, id)); }
    catch (e) { errors.push(`${id}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  return NextResponse.json({ ok: true, today, queued: (ids ?? []).length, runs, ...(errors.length ? { errors } : {}) });
}
