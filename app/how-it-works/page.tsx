import type { Metadata } from 'next';
import Link from 'next/link';
import { Trophy, Users, ClipboardCheck, HelpCircle } from 'lucide-react';
import WebsiteShell from '@/components/website/WebsiteShell';
import { HOW_IT_WORKS_TRACKS, HOW_IT_WORKS_FAQ } from '@/lib/website/howItWorks';
import { canonical } from '@/lib/website/seo';

export const metadata: Metadata = {
  title: 'How ZeroTacky Works — ZeroTacky',
  description:
    'How promoters build and run a meet, how athletes find, follow and register for shows, and how volunteers and judges join on meet day.',
  ...canonical('/how-it-works'),
};

const ICONS = {
  promoters: <Trophy className="w-4 h-4" aria-hidden="true" />,
  athletes: <Users className="w-4 h-4" aria-hidden="true" />,
  volunteers: <ClipboardCheck className="w-4 h-4" aria-hidden="true" />,
} as const;

// Kurt 10/19: one page that ties the flow together. The steps link into the real screen they describe, and the copy
// lives in lib/website/howItWorks.ts so a test can check every link points at a route that exists.
export default function HowItWorksPage() {
  return (
    <WebsiteShell activeNav="how">
      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-black text-zt-text">How ZeroTacky Works</h1>
        <p className="text-xs sm:text-sm text-zt-text-2 max-w-3xl leading-relaxed">
          One site for the whole meet: the promoter builds it on a phone or laptop, athletes find and enter it here,
          volunteers join with a six-character code on the day, and everyone watches the same live scoreboard. Pick the
          track that fits you.
        </p>
        <nav aria-label="Tracks" className="flex flex-wrap gap-2 pt-1">
          {HOW_IT_WORKS_TRACKS.map((t) => (
            <a key={t.id} href={`#${t.id}`} className="px-3 py-1.5 rounded-xl text-xs font-extrabold uppercase tracking-wide border bg-zt-inset text-zt-text-2 border-zt-border hover:border-zt-border-strong inline-flex items-center gap-1.5">
              {ICONS[t.id]} {t.title}
            </a>
          ))}
          <a href="#faq" className="px-3 py-1.5 rounded-xl text-xs font-extrabold uppercase tracking-wide border bg-zt-inset text-zt-text-2 border-zt-border hover:border-zt-border-strong inline-flex items-center gap-1.5">
            <HelpCircle className="w-4 h-4" aria-hidden="true" /> FAQ
          </a>
        </nav>
      </div>

      {HOW_IT_WORKS_TRACKS.map((track) => (
        <section key={track.id} id={track.id} aria-labelledby={`${track.id}-heading`} className="bg-zt-surface border border-zt-border rounded-2xl p-5 sm:p-6 space-y-4 scroll-mt-24">
          <div className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-zt-primary inline-flex items-center gap-1.5">
              {ICONS[track.id]} {track.kicker}
            </span>
            <h2 id={`${track.id}-heading`} className="text-xl font-black text-zt-text">{track.title}</h2>
            <p className="text-xs sm:text-sm text-zt-text-2 leading-relaxed max-w-3xl">{track.intro}</p>
          </div>
          <ol className="space-y-2.5">
            {track.steps.map((step, i) => (
              <li key={step.title} className="flex gap-3 bg-zt-inset border border-zt-border rounded-xl p-3">
                <span className="w-7 h-7 rounded-full bg-zt-primary text-zt-on-primary font-black text-xs flex items-center justify-center flex-shrink-0" aria-hidden="true">{i + 1}</span>
                <div className="space-y-1 min-w-0">
                  <div className="text-sm font-black text-zt-text">{step.title}</div>
                  <p className="text-xs text-zt-text-2 leading-relaxed">{step.body}</p>
                  {step.link && (
                    <Link href={step.link.href} className="text-xs font-extrabold text-zt-primary underline underline-offset-2">
                      {step.link.label}
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}

      <section id="faq" aria-labelledby="faq-heading" className="bg-zt-surface border border-zt-border rounded-2xl p-5 sm:p-6 space-y-4 scroll-mt-24">
        <div className="space-y-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-zt-primary inline-flex items-center gap-1.5">
            <HelpCircle className="w-4 h-4" aria-hidden="true" /> Common questions
          </span>
          <h2 id="faq-heading" className="text-xl font-black text-zt-text">FAQ</h2>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2">
          {HOW_IT_WORKS_FAQ.map((item) => (
            <div key={item.q} className="bg-zt-inset border border-zt-border rounded-xl p-3 space-y-1">
              <dt className="text-sm font-black text-zt-text">{item.q}</dt>
              <dd className="text-xs text-zt-text-2 leading-relaxed">
                {item.a}
                {item.link && (
                  <>
                    {' '}
                    <Link href={item.link.href} className="font-extrabold text-zt-primary underline underline-offset-2">{item.link.label}</Link>
                  </>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </WebsiteShell>
  );
}
