'use client';

import { useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { resultsToCsv, backupFilename } from '@/lib/export';
import { shareOrDownloadText } from '@/lib/download';

// The one export a promoter reaches for on meet day. Lives above the Advanced Settings bar so it is
// never hidden; the rest of Backup & Export sits inside Advanced (BackupPanel with hideCsv).
export default function ResultsCsvCard({ state }) {
  const [notice, setNotice] = useState(null);
  const count = state.results.length;
  const onCsv = async () => {
    const r = await shareOrDownloadText(`${backupFilename(state)}-results.csv`, resultsToCsv(state), 'text/csv');
    if (r === 'cancelled') return;
    setNotice(r === 'shared' ? 'Results CSV shared' : 'Results CSV downloaded');
    setTimeout(() => setNotice(null), 4000);
  };
  return (
    <div className="bg-zt-surface border border-zt-border rounded-2xl p-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-xs font-extrabold uppercase text-zt-primary">Results</div>
        <div className="text-[11px] font-bold text-zt-muted">
          {notice || `${count} score${count === 1 ? '' : 's'} on this device`}
        </div>
      </div>
      <button
        type="button"
        onClick={onCsv}
        className="flex-shrink-0 py-2.5 px-4 rounded-xl font-black text-xs bg-zt-primary text-zt-on-primary flex items-center gap-1.5 active:scale-95"
      >
        <FileSpreadsheet className="w-4 h-4" aria-hidden="true" /> Results CSV
      </button>
    </div>
  );
}
