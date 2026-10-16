'use client';

import { useRef, useState } from 'react';
import { Download, Upload, FileSpreadsheet, ClipboardCopy, History, ShieldCheck } from 'lucide-react';
import { exportStateJson, parseImportedState, resultsToCsv, standingsText, backupFilename } from '@/lib/export';
import { shareOrDownloadText, copyText } from '@/lib/download';

function fmtTime(ms) {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// Backup / export / restore. Everything here is recoverable by design: import and restore
// take a snapshot of the current state first (see useMeetState.replaceState).
// hideCsv: the Results CSV button is rendered on its own card by MeetSetup (always visible), so skip it here.
export default function BackupPanel({ state, snapshots, importMeetState, restoreSnapshot, hideCsv = false }) {
  const fileRef = useRef(null);
  const [notice, setNotice] = useState(null);
  const [pendingImport, setPendingImport] = useState(null);
  const [pendingRestore, setPendingRestore] = useState(null);
  const [showSnapshots, setShowSnapshots] = useState(false);

  const say = (text, tone = 'ok') => {
    setNotice({ text, tone });
    setTimeout(() => setNotice(null), 4000);
  };

  const onBackup = async () => {
    const r = await shareOrDownloadText(`${backupFilename(state)}.json`, exportStateJson(state), 'application/json');
    if (r !== 'cancelled') say(r === 'shared' ? 'Backup shared' : 'Backup downloaded');
  };
  const onCsv = async () => {
    const r = await shareOrDownloadText(`${backupFilename(state)}-results.csv`, resultsToCsv(state), 'text/csv');
    if (r !== 'cancelled') say(r === 'shared' ? 'Results CSV shared' : 'Results CSV downloaded');
  };
  const onCopyStandings = async () => {
    const ok = await copyText(standingsText(state));
    say(ok ? 'Standings copied to clipboard' : 'Clipboard blocked; use Backup instead', ok ? 'ok' : 'warn');
  };
  const onPickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = parseImportedState(await file.text());
      setPendingImport({ name: file.name, parsed });
    } catch (err) {
      say(`Import failed: ${err.message}`, 'warn');
    }
  };

  return (
    <div className="pt-2 border-t border-zt-border space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-extrabold uppercase text-zt-primary flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
          Backup &amp; Export
        </span>
        <span className="text-[10px] font-bold text-zt-muted">
          {state.results.length} score{state.results.length === 1 ? '' : 's'} on this device
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onBackup} className="py-2.5 px-2 rounded-xl font-black text-xs bg-zt-primary text-zt-on-primary flex items-center justify-center gap-1.5 active:scale-95">
          <Download className="w-4 h-4" aria-hidden="true" /> Backup (JSON)
        </button>
        {!hideCsv && (
          <button type="button" onClick={onCsv} className="py-2.5 px-2 rounded-xl font-black text-xs bg-zt-surface border border-zt-primary/60 text-zt-text flex items-center justify-center gap-1.5 active:scale-95">
            <FileSpreadsheet className="w-4 h-4" aria-hidden="true" /> Results CSV
          </button>
        )}
        <button type="button" onClick={onCopyStandings} className="py-2.5 px-2 rounded-xl font-black text-xs bg-zt-surface border border-zt-border-strong text-zt-text flex items-center justify-center gap-1.5 active:scale-95">
          <ClipboardCopy className="w-4 h-4" aria-hidden="true" /> Copy Standings
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className="py-2.5 px-2 rounded-xl font-black text-xs bg-zt-surface border border-zt-border-strong text-zt-text flex items-center justify-center gap-1.5 active:scale-95">
          <Upload className="w-4 h-4" aria-hidden="true" /> Restore from File
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={onPickFile} className="hidden" />
      </div>

      {pendingImport && (
        <div className="p-3 rounded-xl bg-zt-danger/10 border border-zt-danger/60 space-y-2">
          <p className="text-xs font-bold text-zt-danger-text">
            Replace this device&apos;s meet with <span className="font-black">{pendingImport.parsed.meet.name}</span> from{' '}
            {pendingImport.name} ({pendingImport.parsed.results.length} scores)? Current state is snapshotted first.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => { importMeetState(pendingImport.parsed); setPendingImport(null); say('Meet restored from file'); }} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-black text-xs uppercase">
              Replace &amp; Restore
            </button>
            <button type="button" onClick={() => setPendingImport(null)} className="px-4 py-2.5 rounded-xl bg-zt-surface-2 text-zt-text-2 font-bold text-xs uppercase">
              Cancel
            </button>
          </div>
        </div>
      )}

      <button type="button" onClick={() => setShowSnapshots((v) => !v)} className="w-full text-left text-[11px] font-extrabold uppercase text-zt-muted flex items-center gap-1.5">
        <History className="w-3.5 h-3.5" aria-hidden="true" />
        Auto-snapshots ({snapshots.length})
      </button>
      {showSnapshots && (
        <div className="space-y-1.5">
          {snapshots.length === 0 && <p className="text-xs font-bold text-zt-muted">None yet. One is taken when scores change (at most every minute) and before any reset or restore.</p>}
          {snapshots.map((snap) => (
            <div key={snap.at} className="flex items-center justify-between gap-2 bg-zt-inset border border-zt-border rounded-xl px-3 py-2">
              <div className="min-w-0">
                <div className="text-xs font-black text-zt-text truncate">{snap.state.meet.name}</div>
                <div className="text-[10px] font-bold text-zt-muted">{fmtTime(snap.at)} • {snap.results} scores • {snap.reason}</div>
              </div>
              {pendingRestore === snap.at ? (
                <div className="flex gap-1.5 flex-shrink-0">
                  <button type="button" onClick={() => { restoreSnapshot(snap); setPendingRestore(null); setShowSnapshots(false); say('Snapshot restored'); }} className="px-2.5 py-1.5 rounded-lg bg-red-600 text-white font-black text-[10px] uppercase">Confirm</button>
                  <button type="button" onClick={() => setPendingRestore(null)} className="px-2 py-1.5 rounded-lg bg-zt-surface-2 text-zt-text-2 font-bold text-[10px] uppercase">No</button>
                </div>
              ) : (
                <button type="button" onClick={() => setPendingRestore(snap.at)} className="px-2.5 py-1.5 rounded-lg bg-zt-surface border border-zt-border-strong text-zt-text font-black text-[10px] uppercase flex-shrink-0">Restore</button>
              )}
            </div>
          ))}
        </div>
      )}

      {notice && (
        <div className={`text-xs font-bold px-3 py-2 rounded-xl border ${notice.tone === 'warn' ? 'bg-zt-danger/10 border-zt-danger/60 text-zt-danger-text' : 'bg-zt-success/15 border-zt-success/40 text-zt-success-text'}`}>
          {notice.text}
        </div>
      )}
    </div>
  );
}
