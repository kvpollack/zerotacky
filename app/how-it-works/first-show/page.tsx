import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Eye, Trophy } from 'lucide-react';
import WebsiteShell from '@/components/website/WebsiteShell';
import { FIRST_SHOW_INTRO, FIRST_SHOW_OUTRO, FIRST_SHOW_STEPS } from '@/lib/website/firstShow';
import { canonical } from '@/lib/website/seo';

export const metadata: Metadata = {
  title: 'Set up your first show — ZeroTacky',
  description:
    'A promoter walkthrough: one strongman meet from a blank screen to meet day, with a picture of every screen and what each step changes on the public side.',
  ...canonical('/how-it-works/first-show'),
};

// Kurt 10/21: the promoter guide replaces the demo-centric approach. Copy and screenshots are keyed in
// lib/website/firstShow.ts so a test can check every image exists and every link lands on a real route.
export default function FirstShowPage() {
  return (
    <WebsiteShell activeNav="how">
      <div className="space-y-3">
        <Link href="/how-it-works" className="inline-flex items-center gap-1.5 text-xs font-extrabold text-zt-text-2 hover:text-zt-text">
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> How It Works
        </Link>
        <span className="block text-[10px] font-black uppercase tracking-widest text-zt-primary">
          <Trophy className="w-4 h-4 inline-block mr-1.5 -mt-0.5" aria-hidden="true" /> Promoter guide
        </span>
        <h1 className="text-2xl sm:text-3xl font-black text-zt-text">{FIRST_SHOW_INTRO.title}</h1>
        <p className="text-xs sm:text-sm text-zt-text-2 max-w-3xl leading-relaxed">{FIRST_SHOW_INTRO.lede}</p>
        <div className="bg-zt-surface border border-zt-border rounded-2xl p-4 sm:p-5 space-y-2 max-w-3xl">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-zt-muted">What you need</h2>
          <ul className="space-y-1.5">
            {FIRST_SHOW_INTRO.needs.map((n) => (
              <li key={n} className="text-xs text-zt-text-2 leading-relaxed pl-4 relative before:content-[''] before:absolute before:left-0 before:top-[0.55em] before:w-1.5 before:h-1.5 before:rounded-full before:bg-zt-primary">
                {n}
              </li>
            ))}
          </ul>
        </div>
        <nav aria-label="Steps" className="flex flex-wrap gap-2 pt-1">
          {FIRST_SHOW_STEPS.map((s, i) => (
            <a key={s.id} href={`#${s.id}`} className="px-3 py-1.5 rounded-xl text-xs font-extrabold border bg-zt-inset text-zt-text-2 border-zt-border hover:border-zt-border-strong inline-flex items-center gap-1.5">
              <span className="text-zt-primary">{i + 1}</span> {s.title}
            </a>
          ))}
        </nav>
      </div>

      {FIRST_SHOW_STEPS.map((step, i) => (
        <section key={step.id} id={step.id} aria-labelledby={`${step.id}-heading`} className="bg-zt-surface border border-zt-border rounded-2xl p-5 sm:p-6 space-y-4 scroll-mt-24">
          <div className="flex gap-3 items-start">
            <span className="w-8 h-8 rounded-full bg-zt-primary text-zt-on-primary font-black text-sm flex items-center justify-center flex-shrink-0" aria-hidden="true">{i + 1}</span>
            <div className="space-y-1 min-w-0">
              <span className="text-[10px] font-black uppercase tracking-widest text-zt-muted">{step.where}</span>
              <h2 id={`${step.id}-heading`} className="text-xl font-black text-zt-text">{step.title}</h2>
            </div>
          </div>
          <div className="space-y-5">
            <div className="space-y-3 max-w-3xl">
              {step.body.map((p) => (
                <p key={p} className="text-xs sm:text-sm text-zt-text-2 leading-relaxed">{p}</p>
              ))}
              <div className="bg-zt-inset border border-zt-border rounded-xl p-3 space-y-1">
                <div className="text-[10px] font-black uppercase tracking-widest text-zt-primary inline-flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5" aria-hidden="true" /> On the public side
                </div>
                <p className="text-xs text-zt-text-2 leading-relaxed">{step.publicSide}</p>
              </div>
              {step.link && (
                <Link href={step.link.href} className="inline-flex items-center gap-1 text-xs font-extrabold text-zt-primary underline underline-offset-2">
                  {step.link.label} <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </Link>
              )}
            </div>
            <div className="space-y-4 min-w-0">
              {step.images.map((img) => (
                <figure key={img.src} className="space-y-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.src}
                    alt={img.alt}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-auto rounded-xl border border-zt-border bg-zt-bg"
                  />
                  {img.caption && <figcaption className="text-[11px] text-zt-muted">{img.caption}</figcaption>}
                </figure>
              ))}
            </div>
          </div>
        </section>
      ))}

      <section aria-labelledby="after-heading" className="bg-zt-primary/10 border border-zt-primary/40 rounded-2xl p-5 sm:p-6 space-y-2">
        <h2 id="after-heading" className="text-xl font-black text-zt-text">{FIRST_SHOW_OUTRO.title}</h2>
        <p className="text-xs sm:text-sm text-zt-text-2 leading-relaxed max-w-3xl">{FIRST_SHOW_OUTRO.body}</p>
        <div className="flex flex-wrap gap-3 pt-1">
          <Link href="/promoter" className="px-4 py-2 rounded-xl bg-zt-primary text-zt-on-primary text-xs font-black uppercase tracking-wide">Open My Meets</Link>
          <Link href="/how-it-works#faq" className="px-4 py-2 rounded-xl border border-zt-border bg-zt-inset text-zt-text-2 text-xs font-black uppercase tracking-wide">Promoter FAQ</Link>
        </div>
      </section>
    </WebsiteShell>
  );
}
