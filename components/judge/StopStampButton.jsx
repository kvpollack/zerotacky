'use client';

import { useElapsedSeconds } from '@/hooks/useStopwatch';

export default function StopStampButton({ onStamp, subscribe }) {
  const elapsedSeconds = useElapsedSeconds(subscribe);
  return (
    <button
      type="button"
      onClick={onStamp}
      className="w-full py-6 rounded-2xl bg-red-600 text-white shadow-lg active:scale-[0.98] transition flex flex-col items-center gap-1 ring-4 ring-red-600/30"
    >
      <span className="text-xl font-black tracking-wide">STOP &amp; STAMP FINISH TIME</span>
      <span className="font-mono text-3xl font-black tabular-nums">{elapsedSeconds.toFixed(2)}s</span>
    </button>
  );
}
