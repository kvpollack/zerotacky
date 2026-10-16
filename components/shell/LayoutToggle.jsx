'use client';

import { Monitor, Smartphone } from 'lucide-react';

// One-tap switch between the phone layout and the TV / projector layout. Shows the mode you would switch TO.
export default function LayoutToggle({ layout, onToggle, className = '' }) {
  const toTv = layout !== 'tv';
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={layout === 'tv'}
      title={toTv ? 'Switch to TV / projector layout' : 'Switch to phone layout'}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-black uppercase tracking-wider bg-zt-inset border-zt-border text-zt-text-2 hover:text-zt-text active:scale-95 ${className}`}
    >
      {toTv ? <Monitor className="w-3.5 h-3.5" aria-hidden="true" /> : <Smartphone className="w-3.5 h-3.5" aria-hidden="true" />}
      {toTv ? 'TV' : 'Phone'}
    </button>
  );
}
