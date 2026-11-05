import type { Metadata } from 'next';
import Link from 'next/link';
import WebsiteShell from '@/components/website/WebsiteShell';
import { Cap, Key } from '@/components/website/sheet';
import { DEMO_SHOW_PRESETS, DEMO_SHOW_PRESET_BLURBS } from '@/lib/presets';
import { DEMO_SHOW_RECORDS } from '@/lib/website/fixtures';
import { canonical } from '@/lib/website/seo';

export const metadata: Metadata = {
  title: 'Check Out a Demo Show | ZeroTacky',
  description:
    'Open the meet-day scorer loaded with a made-up strongman show: upcoming, in progress, or finished. Score it, edit it, and see how a meet runs.',
  ...canonical('/demo'),
};

// Kurt 10/19: the demo chooser moved here from Meet Setup step 6 so the website is explicit that "run a meet" opens a
// demo. Only the fictional /shows fixtures are offered; the real Strongfest preset stays inside the scorer.
function statusLabel(id: string): string {
  const r = DEMO_SHOW_RECORDS.find((x) => x.id === id);
  if (!r) return 'Demo';
  if (r.competitionStatus === 'live') return 'In progress';
  if (r.competitionStatus === 'completed') return r.resultsStatus === 'final' ? 'Finished, final results' : 'Finished, provisional results';
  return 'Upcoming, nothing scored yet';
}

function formatDate(id: string): string {
  const r = DEMO_SHOW_RECORDS.find((x) => x.id === id);
  if (!r) return '';
  const [y, m, d] = r.date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function DemoChooserPage() {
  return (
    <WebsiteShell>
      {/* Hand redraw in the sheet grammar (11/5, sweep item 5): each demo show is a ruled block with keys at the foot. */}
      <div className="flex flex-col gap-3">
        <h1 className="text-[28px] sm:text-[34px] font-bold leading-[1.05] text-ink">Check Out a Demo Show</h1>
        <p className="text-[15px] leading-relaxed text-ink max-w-3xl">
          Pick a show below and the meet-day scorer opens on this device loaded with it. Every show here is made up, so
          score it, edit it, and poke around freely. If this device already holds a meet you built yourself, the scorer
          asks before replacing it, and a recovery snapshot is saved either way.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {DEMO_SHOW_PRESETS.map((preset) => (
          <article key={preset.id} className="zt-block grid-cols-1 grid-rows-[auto_1fr_auto]">
            <div className="flex flex-col gap-1 px-4 py-3 sm:px-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-[22px] font-bold leading-tight text-ink">{preset.label}</h2>
                <span className="shrink-0 inline-flex items-center border-2 border-dashed border-rule px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.04em] text-ink-muted">Demo</span>
              </div>
              <Cap as="span">{formatDate(preset.id)} · {preset.sublabel} · {statusLabel(preset.id)}</Cap>
            </div>
            <p className="px-4 py-3 sm:px-5 text-[15px] leading-relaxed text-ink">{DEMO_SHOW_PRESET_BLURBS[preset.id]}</p>
            <div className="flex flex-col sm:flex-row gap-2 px-4 py-3 sm:px-5">
              <Key href={`/scorer?demo=${preset.id}`} variant="pen" className="flex-1">Open in the Scorer</Key>
              {preset.showSlug && <Key href={`/shows/${preset.showSlug}`} variant="line">Show page</Key>}
            </div>
          </article>
        ))}
      </div>

      <p className="text-[13px] leading-snug text-ink-muted">
        Ready to run your own? Open the scorer, go to Meet Setup, and tap New Blank Meet. Your meet lives on this device
        until you publish it from the Promoter page.
      </p>
    </WebsiteShell>
  );
}
