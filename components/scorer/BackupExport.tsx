'use client';
// Phase 5 (11/2): Backup & Export in the sheet grammar (port of setup/BackupPanel.jsx + ResultsCsvCard.jsx). Lives
// under Standings now (approved mockup scorer_results.html). Everything here is recoverable by design: import and
// restore snapshot the current state first (useMeetState.replaceState).
import React, { useRef, useState } from 'react';
import { exportStateJson, parseImportedState, resultsToCsv, standingsText, backupFilename } from '@/lib/export';
import { shareOrDownloadText, copyText } from '@/lib/download';
import { RuledBlock } from '@/components/sheet';
import { CAP, Key, Note, Row, Sec, Toast } from './parts';

type Snapshot = { at: number; results: number; reason: string; state: { meet: { name: string } } };
type State = { meet: { name: string }; results: unknown[] };

function fmtTime(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function BackupExport({ state, snapshots, importMeetState, restoreSnapshot }: {
  state: State;
  snapshots: Snapshot[];
  importMeetState: (parsed: unknown) => void;
  restoreSnapshot: (snap: Snapshot) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null);
  const [pendingImport, setPendingImport] = useState<{ name: string; parsed: { meet: { name: string }; results: unknown[] } } | null>(null);
  const [pendingRestore, setPendingRestore] = useState<number | null>(null);
  const [showSnapshots, setShowSnapshots] = useState(false);

  const say = (text: string, tone: 'ok' | 'warn' = 'ok') => {
    setNotice({ text, tone });
    setTimeout(() => setNotice(null), 4000);
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = state as any;
  const onBackup = async () => {
    const r = await shareOrDownloadText(`${backupFilename(s)}.json`, exportStateJson(s), 'application/json');
    if (r !== 'cancelled') say(r === 'shared' ? 'Backup shared' : 'Backup downloaded');
  };
  const onCsv = async () => {
    const r = await shareOrDownloadText(`${backupFilename(s)}-results.csv`, resultsToCsv(s), 'text/csv');
    if (r !== 'cancelled') say(r === 'shared' ? 'Results CSV shared' : 'Results CSV downloaded');
  };
  const onCopyStandings = async () => {
    const ok = await copyText(standingsText(s));
    say(ok ? 'Standings copied to clipboard' : 'Clipboard blocked; use Backup instead', ok ? 'ok' : 'warn');
  };
  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = parseImportedState(await file.text());
      setPendingImport({ name: file.name, parsed });
    } catch (err) {
      say(`Import failed: ${(err as Error).message}`, 'warn');
    }
  };
  const n = state.results.length;

  return (
    <>
      <Sec right={`${n} score${n === 1 ? '' : 's'} on this device`}>Backup &amp; Export</Sec>
      <Row cols={3}>
        <Key variant="pen" onClick={onCsv}>Results CSV</Key>
        <Key onClick={onBackup}>Backup (JSON)</Key>
        <Key onClick={onCopyStandings}>Copy Standings</Key>
      </Row>
      <Row>
        <Key onClick={() => fileRef.current?.click()}>Restore from File</Key>
        <Key onClick={() => setShowSnapshots((v) => !v)} aria-expanded={showSnapshots}>Auto-snapshots ({snapshots.length})</Key>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={onPickFile} className="hidden" />
      </Row>

      {pendingImport && (
        <RuledBlock columns="minmax(0,1fr)" className="!border-redpen">
          <div className="p-2 text-[11px] normal-case leading-snug">
            Replace this device&apos;s meet with <b>{pendingImport.parsed.meet.name}</b> from {pendingImport.name} ({pendingImport.parsed.results.length} scores)? Current state is snapshotted first.
          </div>
          <div className="p-2 grid grid-cols-2 gap-2">
            <Key variant="red" onClick={() => { importMeetState(pendingImport.parsed); setPendingImport(null); say('Meet restored from file'); }}>Replace &amp; Restore</Key>
            <Key onClick={() => setPendingImport(null)}>Cancel</Key>
          </div>
        </RuledBlock>
      )}

      {showSnapshots && (
        snapshots.length === 0 ? (
          <Note>None yet. One is taken when scores change (at most every minute) and before any reset or restore.</Note>
        ) : (
          <RuledBlock columns="minmax(0,1fr) auto">
            {snapshots.map((snap) => (
              <React.Fragment key={snap.at}>
                <div className="px-2 py-1 min-w-0">
                  <div className="text-[12px] font-bold whitespace-nowrap overflow-hidden text-ellipsis">{snap.state.meet.name}</div>
                  <div className={`text-[9px] ${CAP}`}>{fmtTime(snap.at)} &middot; {snap.results} scores &middot; {snap.reason}</div>
                </div>
                <div className="px-1.5 flex items-center gap-1.5">
                  {pendingRestore === snap.at ? (
                    <>
                      <Key variant="red" size="sm" onClick={() => { restoreSnapshot(snap); setPendingRestore(null); setShowSnapshots(false); say('Snapshot restored'); }}>Confirm</Key>
                      <Key size="sm" onClick={() => setPendingRestore(null)}>No</Key>
                    </>
                  ) : (
                    <Key size="sm" onClick={() => setPendingRestore(snap.at)}>Restore</Key>
                  )}
                </div>
              </React.Fragment>
            ))}
          </RuledBlock>
        )
      )}

      {notice && <Toast cap="Notice" tone={notice.tone === 'warn' ? 'red' : 'pen'}>{notice.text}</Toast>}
    </>
  );
}
