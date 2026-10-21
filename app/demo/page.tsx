import type { Metadata } from 'next';
import Link from 'next/link';
import { Play, Calendar, MapPin, ExternalLink } from 'lucide-react';
import WebsiteShell from '@/components/website/WebsiteShell';
import { DEMO_SHOW_PRESETS, DEMO_SHOW_PRESET_BLURBS } from '@/lib/presets';
import { DEMO_SHOW_RECORDS } from '@/lib/website/fixtures';
import { canonical } from '@/lib/website/seo';

export const metadata: Metadata = {
  title: 'Check Out a Demo Show — ZeroTacky',
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
      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-black text-zt-text">Check Out a Demo Show</h1>
        <p className="text-xs sm:text-sm text-zt-text-2 max-w-3xl leading-relaxed">
          Pick a show below and the meet-day scorer opens on this device loaded with it. Every show here is made up, so
          score it, edit it, and poke around freely. If this device already holds a meet you built yourself, the scorer
          asks before replacing it, and a recovery snapshot is saved either way.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {DEMO_SHOW_PRESETS.map((preset) => (
          <article key={preset.id} className="bg-zt-surface border border-zt-border rounded-2xl p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-black text-zt-text leading-tight">{preset.label}</h2>
              <span className="shrink-0 px-2 py-0.5 rounded-md bg-zt-primary/15 text-zt-primary text-[10px] font-black uppercase tracking-wider">
                Demo
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-zt-text-2">
              <span className="inline-flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" aria-hidden="true" /> {formatDate(preset.id)}
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" aria-hidden="true" /> {preset.sublabel}
              </span>
            </div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-zt-secondary">{statusLabel(preset.id)}</p>
            <p className="text-sm text-zt-text-2 leading-relaxed flex-1">{DEMO_SHOW_PRESET_BLURBS[preset.id]}</p>
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <Link
                href={`/scorer?demo=${preset.id}`}
                className="flex-1 px-4 py-3 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase tracking-wider inline-flex items-center justify-center gap-2 hover:opacity-95 transition"
              >
                <Play className="w-4 h-4" aria-hidden="true" /> Open in the Scorer
              </Link>
              {preset.showSlug && (
                <Link
                  href={`/shows/${preset.showSlug}`}
                  className="px-4 py-3 rounded-xl bg-zt-inset border border-zt-border text-zt-text-2 font-extrabold text-xs uppercase tracking-wider inline-flex items-center justify-center gap-2 hover:text-zt-text transition"
                >
                  <ExternalLink className="w-4 h-4" aria-hidden="true" /> Show Page
                </Link>
              )}
            </div>
          </article>
        ))}
      </div>

      <p className="text-xs font-semibold text-zt-muted">
        Ready to run your own? Open the scorer, go to Meet Setup, and tap New Blank Meet. Your meet lives on this device
        until you publish it from the Promoter page.
      </p>
    </WebsiteShell>
  );
}
