'use client';
// The pad's clock cell: the only part of the pad that re-renders every frame while the clock runs. Numerals in pen
// once time is on the clock, ink at zero, red pen past the cap. The cap on the right says what the clock is doing.
import React from 'react';
import { useElapsedSeconds } from '@/hooks/useStopwatch';
import { clockWord, formatClock } from './padModel';

export type PadClockProps = {
  subscribe: (fn: (ms: number) => void) => () => void;
  running: boolean;
  capSeconds: number;
  locked: boolean;
  onReset?: () => void;
};

const WORD: Record<ReturnType<typeof clockWord>, string> = { ready: 'Ready', running: 'Running', stopped: 'Stopped', over: 'Over cap' };

export default function PadClock({ subscribe, running, capSeconds, locked, onReset }: PadClockProps) {
  const elapsed = useElapsedSeconds(subscribe);
  const word = clockWord(elapsed, running, capSeconds);
  const colour = word === 'over' ? 'text-redpen' : elapsed > 0 || running ? 'text-pen' : 'text-ink';
  return (
    <div className="flex items-center justify-between gap-2 px-2 min-h-[44px]">
      <span className={`text-[44px] leading-none ${colour}`} aria-live="off" aria-label={`Clock ${formatClock(elapsed)}`}>
        {formatClock(elapsed)}
      </span>
      <span className="text-right text-[12px] leading-tight">
        <span className="block text-ink-muted tracking-[0.04em]">Clock{capSeconds > 0 ? ` · ${capSeconds} s cap` : ''}</span>
        <span className={`block font-bold ${word === 'over' ? 'text-redpen' : 'text-ink'}`}>{WORD[word]}</span>
        {!running && elapsed > 0 && !locked && onReset && (
          <button type="button" onClick={onReset} className="block ml-auto mt-0.5 text-[11px] underline underline-offset-2 text-ink-muted hover:text-ink">
            Reset
          </button>
        )}
      </span>
    </div>
  );
}
