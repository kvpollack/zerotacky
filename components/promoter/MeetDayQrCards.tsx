'use client';

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Printer, QrCode } from 'lucide-react';

// Kurt 10/19: printable QR codes for the gym wall. One for the join link (code already in it) and one for the live
// scoreboard. Generated in the browser with the qrcode package; nothing leaves the phone to make them.
export interface QrItem {
  key: string;
  title: string;
  hint: string;
  url: string;
}

async function toSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, width: 240 });
}

export default function MeetDayQrCards({ meetName, items }: { meetName: string; items: QrItem[] }) {
  const [svgs, setSvgs] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pairs = await Promise.all(items.map(async (it) => [it.key, await toSvg(it.url)] as const));
        if (!cancelled) setSvgs(Object.fromEntries(pairs));
      } catch (e) {
        if (!cancelled) setFailed(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [items]);

  const print = () => {
    const w = window.open('', '_blank', 'noopener,width=900,height=1200');
    if (!w) return;
    const cards = items
      .map((it) => `
        <section>
          <h2>${escapeHtml(it.title)}</h2>
          <div class="qr">${svgs[it.key] ?? ''}</div>
          <p class="hint">${escapeHtml(it.hint)}</p>
          <p class="url">${escapeHtml(it.url)}</p>
        </section>`)
      .join('');
    w.document.write(`<!doctype html><html><head><title>${escapeHtml(meetName)} QR codes</title>
      <style>
        body{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0;color:#111}
        h1{font-size:28px;margin:24px 32px 0}
        section{page-break-after:always;padding:32px;text-align:center}
        section:last-child{page-break-after:auto}
        h2{font-size:34px;margin:0 0 16px}
        .qr svg{width:70vw;max-width:560px;height:auto}
        .hint{font-size:22px;margin:16px 0 8px}
        .url{font-size:16px;color:#555;word-break:break-all}
      </style></head><body><h1>${escapeHtml(meetName)}</h1>${cards}
      <script>window.onload=function(){window.print();}</script></body></html>`);
    w.document.close();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-extrabold uppercase text-zt-muted flex items-center gap-1.5">
          <QrCode className="w-3.5 h-3.5" aria-hidden="true" /> QR codes for the gym wall
        </div>
        <button
          type="button"
          onClick={print}
          disabled={Object.keys(svgs).length !== items.length}
          className="px-3 py-1.5 rounded-lg bg-zt-surface border border-zt-border-strong text-zt-text font-extrabold text-[11px] uppercase inline-flex items-center gap-1.5 disabled:opacity-40"
        >
          <Printer className="w-3.5 h-3.5" aria-hidden="true" /> Print both
        </button>
      </div>
      {failed && <p role="alert" className="text-xs font-bold text-zt-danger-text">Could not draw the QR codes: {failed}</p>}
      <div className="grid sm:grid-cols-2 gap-3">
        {items.map((it) => (
          <figure key={it.key} className="bg-white rounded-2xl p-4 flex flex-col items-center gap-2 border border-zt-border">
            {svgs[it.key] ? (
              <div
                className="w-full max-w-[220px]"
                role="img"
                aria-label={`QR code for ${it.title}`}
                dangerouslySetInnerHTML={{ __html: svgs[it.key] }}
              />
            ) : (
              <div className="w-[220px] h-[220px] rounded bg-zt-inset animate-pulse" aria-hidden="true" />
            )}
            <figcaption className="text-center space-y-0.5">
              <div className="text-sm font-black text-neutral-900">{it.title}</div>
              <div className="text-[11px] font-semibold text-neutral-600">{it.hint}</div>
            </figcaption>
          </figure>
        ))}
      </div>
      <p className="text-[11px] text-zt-muted">
        Print both on one sheet each and tape them up by the sign-in table and the platform. The join QR carries the current code; print again after you rotate it.
      </p>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
