'use client';

import { ClipboardList, Settings } from 'lucide-react';

export default function EmptyMeetNotice({ roleLock, onGoToSetup }) {
  return (
    <div className="bg-zt-surface border-2 border-zt-border rounded-2xl p-6 text-center space-y-3 my-6 shadow-lg">
      <div className="w-12 h-12 rounded-2xl bg-zt-primary/15 border border-zt-primary/40 text-zt-primary mx-auto flex items-center justify-center">
        <ClipboardList className="w-6 h-6" aria-hidden="true" />
      </div>
      <h2 className="text-lg font-black text-zt-text">
        Add divisions, events and athletes in Meet Setup
      </h2>
      <p className="text-xs font-bold text-zt-muted max-w-sm mx-auto">
        This meet needs at least one division, one event, and one active athlete in the selected
        division before scoring or plate loading can begin.
      </p>
      {roleLock === 'admin' && (
        <button
          type="button"
          onClick={onGoToSetup}
          className="mt-2 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase tracking-wider shadow active:scale-95 transition"
        >
          <Settings className="w-4 h-4" aria-hidden="true" />
          Go to Meet Setup
        </button>
      )}
    </div>
  );
}