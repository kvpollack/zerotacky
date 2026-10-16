'use client';

import { Timer } from 'lucide-react';
import { useElapsedSeconds } from '@/hooks/useStopwatch';

// The only component that re-renders every frame while the clock runs.
export default function MasterClock({ timeCapSeconds, timerRunning, toggle, resetStopwatch, subscribe }) {
  const elapsedSeconds = useElapsedSeconds(subscribe);
  return (
    <div className="bg-zt-surface border border-zt-border rounded-2xl p-3.5 flex items-center justify-between">
      <div>
        <div className="flex items-center gap-1.5 text-[11px] uppercase font-extrabold text-zt-muted">
          <Timer className="w-3.5 h-3.5 text-zt-primary" />
          <span>Master Clock ({timeCapSeconds}s Cap)</span>
        </div>
        <div
          className={`text-4xl font-mono font-black tracking-tight ${
            elapsedSeconds >= timeCapSeconds
              ? 'text-red-500'
              : timerRunning
              ? 'text-zt-success-text'
              : 'text-zt-text'
          }`}
        >
          {elapsedSeconds.toFixed(2)}s
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={toggle}
          className={`px-5 py-3.5 rounded-xl font-black text-sm tracking-wide shadow active:scale-95 transition ${
            timerRunning ? 'bg-red-600 text-white' : 'bg-emerald-500 text-emerald-950'
          }`}
        >
          {timerRunning ? 'STOP' : 'START'}
        </button>
        <button
          onClick={resetStopwatch}
          className="px-3.5 py-3.5 rounded-xl font-extrabold text-xs bg-zt-surface-2 text-zt-text-2 active:scale-95"
        >
          RESET
        </button>
      </div>
    </div>
  );
}
