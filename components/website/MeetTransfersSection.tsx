'use client';
// 051 (Kurt 11/9): Account page side of meet transfers. Incoming requests get Accept / Decline; outgoing pending ones
// can be cancelled; anything settled in the last 30 days is listed quietly. Renders nothing when there is nothing.
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Cap, keyClass, textLink } from '@/components/website/sheet';
import { getSupabase } from '@/lib/auth/supabaseBrowser';
import { formatShowDate } from '@/lib/website/showHistory';
import { cancelTransfer, fetchMyTransfers, partyLabel, respondTransfer, TRANSFER_STATUS_LABEL, type MeetTransfer, type MyTransfers } from '@/lib/website/meetTransfers';

const NOTE = 'text-[13px] leading-snug text-ink-muted';
const H2 = 'text-[22px] font-bold leading-tight text-ink';
const SMALL = 'min-h-10 px-3.5 text-[12px] disabled:opacity-40 disabled:cursor-not-allowed';

function MeetLine({ t }: { t: MeetTransfer }) {
  return (
    <div className="min-w-0 flex-1 basis-[16rem] flex flex-col gap-0.5">
      <Cap as="span">{t.meet?.date ? formatShowDate(t.meet.date) : 'Date not set'}{t.meet ? ` · ${t.meet.athletes} ${t.meet.athletes === 1 ? 'athlete' : 'athletes'}` : ''}</Cap>
      {t.meet ? <Link href={`/promoter/${encodeURIComponent(t.meetId)}`} className={`text-[17px] font-bold ${textLink}`}>{t.meet.name}</Link> : <span className="text-[17px] font-bold text-ink">Meet</span>}
    </div>
  );
}

export default function MeetTransfersSection() {
  const [data, setData] = useState<MyTransfers | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    try { setData(await fetchMyTransfers(sb)); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id); setError(null);
    try { await fn(); await load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusyId(null);
  };

  if (!data) return null;
  const sb = getSupabase();
  if (!sb || (data.incoming.length === 0 && data.outgoing.length === 0 && data.settled.length === 0 && !error)) return null;

  return (
    <section aria-labelledby="transfers-heading" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Cap as="span">Meets</Cap>
        <h2 id="transfers-heading" className={H2}>Meet transfers</h2>
        <p className={`${NOTE} max-w-2xl`}>
          A promoter can hand a meet they built to your account. Accepting makes you the owner; they stay on the meet as an admin.
        </p>
      </div>
      {error && <p role="alert" className="text-[13px] font-bold text-pen">{error}</p>}
      {data.incoming.length > 0 && (
        <ul className="zt-block grid-cols-1" aria-label="Transfers waiting on you">
          {data.incoming.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-5">
              <MeetLine t={t} />
              <div className="flex flex-wrap items-center gap-2">
                <span className={NOTE}>From {partyLabel(t.from)}</span>
                <button type="button" className={keyClass('pen', SMALL)} disabled={busyId === t.id} onClick={() => void act(t.id, () => respondTransfer(sb, t.id, true))}>Accept</button>
                <button type="button" className={keyClass('line', SMALL)} disabled={busyId === t.id} onClick={() => void act(t.id, () => respondTransfer(sb, t.id, false))}>Decline</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {data.outgoing.length > 0 && (
        <ul className="zt-block grid-cols-1" aria-label="Transfers you sent">
          {data.outgoing.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-5">
              <MeetLine t={t} />
              <div className="flex flex-wrap items-center gap-2">
                <span className={NOTE}>To {partyLabel(t.to)} · {TRANSFER_STATUS_LABEL[t.status]}</span>
                <button type="button" className={keyClass('line', SMALL)} disabled={busyId === t.id} onClick={() => void act(t.id, () => cancelTransfer(sb, t.id))}>Cancel</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {data.settled.length > 0 && (
        <ul className="flex flex-col gap-1" aria-label="Recent transfers">
          {data.settled.map((t) => (
            <li key={t.id} className={NOTE}>
              {t.meet?.name ?? 'Meet'}: {t.mine ? `to ${partyLabel(t.to)}` : `from ${partyLabel(t.from)}`} · {TRANSFER_STATUS_LABEL[t.status]}
              {t.decidedAt ? ` · ${formatShowDate(t.decidedAt.slice(0, 10))}` : ''}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
