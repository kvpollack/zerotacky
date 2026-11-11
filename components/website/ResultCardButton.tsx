'use client';

// "Share card" on a standings row or a profile history row (11/10 night): fetches the PNG from
// /shows/<slug>/card/<athleteId>?size=… and hands it to the phone's share sheet (Web Share API with files, which is
// what puts it into Instagram), or downloads it where files cannot be shared (desktop browsers, Firefox).
import { useState } from 'react';
import { KeyButton } from './sheet';
import { RESULT_CARD_SIZES, resultCardHref, type ResultCardSize } from '@/lib/website/resultCard';

interface Props {
  slug: string;
  athleteId: string;
  athleteName: string;
  meetName: string;
  className?: string;
  /** 'row' = compact key inside a table cell; 'block' = full-width strip on the profile */
  layout?: 'row' | 'block';
}

const SIZES: ResultCardSize[] = ['square', 'story', 'link'];

export function canShareFiles(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
  try {
    const probe = new File([new Uint8Array([137, 80, 78, 71])], 'probe.png', { type: 'image/png' });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/** The three size keys plus the note. Used inline by the button below and by ShowDetailClient in a full-width row
 *  under the athlete's standings row (a table cell is too narrow for it on a phone). */
export function ResultCardSizes({ slug, athleteId, athleteName, meetName, compact = true }: Omit<Props, 'className' | 'layout'> & { compact?: boolean }) {
  const [busy, setBusy] = useState<ResultCardSize | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function run(size: ResultCardSize) {
    setBusy(size); setNote(null);
    try {
      const href = resultCardHref(slug, athleteId, size);
      const res = await fetch(href, { cache: 'no-store' });
      if (!res.ok) throw new Error(`card ${res.status}`);
      const blob = await res.blob();
      const file = new File([blob], `${slug}-${size}.png`, { type: 'image/png' });
      if (canShareFiles() && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: `${athleteName} at ${meetName}`, text: `${athleteName}'s result at ${meetName} on ZeroTacky` });
          setNote('Shared.');
        } catch (e) {
          if ((e as { name?: string })?.name === 'AbortError') { setNote(null); } else { throw e; }
        }
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = file.name; a.rel = 'noopener';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        setNote('Downloaded. Post it from your camera roll or files.');
      }
    } catch {
      setNote('Could not build the card. Try again in a moment.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div id={`card-sizes-${athleteId}`} className="flex flex-col gap-1.5" data-testid="result-card-sizes">
      <div className="flex flex-wrap gap-1.5">
        {SIZES.map((size) => {
          const meta = RESULT_CARD_SIZES[size];
          return (
            <KeyButton
              key={size}
              variant="ink"
              disabled={busy !== null}
              className={compact ? '!min-h-8 !px-2.5 !text-[11px] whitespace-nowrap' : '!min-h-10 !px-4 !text-[12px]'}
              onClick={() => run(size)}
              title={`${meta.hint} · ${meta.width}×${meta.height}`}
              data-testid={`result-card-${size}`}
            >
              {busy === size ? 'Preparing…' : `${meta.label} ${meta.width}×${meta.height}`}
            </KeyButton>
          );
        })}
      </div>
      <p className="text-[11px] text-ink-muted" data-testid="result-card-note">
        {note ?? 'Opens the share sheet on a phone (Instagram, Messages, Facebook). Downloads the PNG on a computer.'}
        {' '}
        <a href={resultCardHref(slug, athleteId, 'square')} target="_blank" rel="noopener" className="underline">Preview</a>
      </p>
    </div>
  );
}

/** Toggle key that opens the size strip in place (profile history rows). */
export default function ResultCardButton({ slug, athleteId, athleteName, meetName, className = '', layout = 'row' }: Props) {
  const [open, setOpen] = useState(false);
  const compact = layout === 'row';
  return (
    <div className={`flex flex-col gap-1.5 ${compact ? 'items-start' : ''} ${className}`}>
      <ResultCardToggle open={open} onToggle={() => setOpen((v) => !v)} athleteId={athleteId} compact={compact} />
      {open && <ResultCardSizes slug={slug} athleteId={athleteId} athleteName={athleteName} meetName={meetName} compact={compact} />}
    </div>
  );
}

export function ResultCardToggle({ open, onToggle, athleteId, compact = true }: { open: boolean; onToggle: () => void; athleteId: string; compact?: boolean }) {
  return (
    <KeyButton
      variant={open ? 'ink' : 'line'}
      aria-expanded={open}
      aria-controls={`card-sizes-${athleteId}`}
      className={compact ? '!min-h-8 !px-2.5 !text-[11px] whitespace-nowrap' : '!min-h-10 !px-4 !text-[12px]'}
      onClick={onToggle}
      data-testid="result-card-toggle"
    >
      {open ? 'Close' : 'Share card'}
    </KeyButton>
  );
}
