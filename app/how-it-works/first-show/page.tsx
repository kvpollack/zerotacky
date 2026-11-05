import type { Metadata } from 'next';
import Link from 'next/link';
import WebsiteShell from '@/components/website/WebsiteShell';
import { Cap, Key, WebCell, keyClass, textLink } from '@/components/website/sheet';
import { FIRST_SHOW_INTRO, FIRST_SHOW_OUTRO, FIRST_SHOW_STEPS, GUIDE_IMAGE_SIZES } from '@/lib/website/firstShow';
import { canonical } from '@/lib/website/seo';

export const metadata: Metadata = {
  title: 'Set up your first show | ZeroTacky',
  description:
    'A promoter walkthrough: one strongman meet from a blank screen to meet day, with a picture of every screen and what each step changes on the public side.',
  ...canonical('/how-it-works/first-show'),
};

// Kurt 10/21: the promoter guide replaces the demo-centric approach. Copy and screenshots are keyed in
// lib/website/firstShow.ts so a test can check every image exists and every link lands on a real route.
// Hand redraw in the sheet grammar (11/5): each step is one ruled block: number + title cell, text cell, a grey
// "On the public side" cell, then one cell per screenshot. Jump links are small line keys.
const H1 = 'text-[28px] sm:text-[34px] font-bold leading-[1.05] text-ink';
const H2 = 'text-[22px] font-bold leading-tight text-ink';
const LEDE = 'text-[15px] leading-relaxed text-ink max-w-3xl';
const BODY = 'text-[14px] leading-relaxed text-ink';
const JUMP = keyClass('line', 'min-h-10 px-3.5 text-[12px] normal-case tracking-normal');

export default function FirstShowPage() {
  return (
    <WebsiteShell activeNav="how">
      <div className="flex flex-col gap-7">
        <div className="flex flex-col gap-3">
          <Link href="/how-it-works" className="inline-flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-[0.04em] text-ink-muted hover:text-ink no-underline self-start">
            <span aria-hidden="true">←</span> How It Works
          </Link>
          <Cap as="span">Promoter guide</Cap>
          <h1 className={H1}>{FIRST_SHOW_INTRO.title}</h1>
          <p className={LEDE}>{FIRST_SHOW_INTRO.lede}</p>
          <div className="zt-block grid-cols-1 max-w-3xl">
            <WebCell>
              <Cap as="h2">What you need</Cap>
              <ul className="flex flex-col gap-1.5">
                {FIRST_SHOW_INTRO.needs.map((n) => (
                  <li key={n} className={`${BODY} pl-4 relative before:content-['·'] before:absolute before:left-0 before:font-bold before:text-pen`}>{n}</li>
                ))}
              </ul>
            </WebCell>
          </div>
          <nav aria-label="Steps" className="flex flex-wrap gap-2 pt-1">
            {FIRST_SHOW_STEPS.map((s, i) => (
              <a key={s.id} href={`#${s.id}`} className={JUMP}>
                <span className="font-sheet text-pen text-[15px]" aria-hidden="true">{i + 1}</span> {s.title}
              </a>
            ))}
          </nav>
        </div>

        {FIRST_SHOW_STEPS.map((step, i) => (
          <section key={step.id} id={step.id} aria-labelledby={`${step.id}-heading`} className="zt-block grid-cols-1 scroll-mt-24">
            <div className="flex gap-4 items-start px-4 py-4 sm:px-5">
              <span className="font-sheet text-pen text-[34px] leading-none w-10 shrink-0" aria-hidden="true">{i + 1}</span>
              <div className="flex flex-col gap-1 min-w-0 pt-0.5">
                <Cap as="span">{step.where}</Cap>
                <h2 id={`${step.id}-heading`} className={H2}>{step.title}</h2>
              </div>
            </div>
            <WebCell className="gap-3">
              <div className="flex flex-col gap-3 max-w-3xl">
                {step.body.map((p) => (
                  <p key={p} className={BODY}>{p}</p>
                ))}
              </div>
              {step.link && (
                <Link href={step.link.href} className={`text-[13px] ${textLink} self-start`}>{step.link.label} <span aria-hidden="true">→</span></Link>
              )}
            </WebCell>
            <WebCell className="bg-ground">
              <Cap as="span">On the public side</Cap>
              <p className={`${BODY} max-w-3xl`}>{step.publicSide}</p>
            </WebCell>
            {step.images.map((img) => (
              <figure key={img.src} className="flex flex-col gap-2 px-4 py-4 sm:px-5 min-w-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.src}
                  alt={img.alt}
                  width={GUIDE_IMAGE_SIZES[img.src]?.width}
                  height={GUIDE_IMAGE_SIZES[img.src]?.height}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-auto border-2 border-rule"
                />
                {img.caption && <figcaption className="text-[12px] text-ink-muted">{img.caption}</figcaption>}
              </figure>
            ))}
          </section>
        ))}

        <section aria-labelledby="after-heading" className="zt-block grid-cols-1">
          <WebCell pad="lg" className="gap-3">
            <h2 id="after-heading" className={H2}>{FIRST_SHOW_OUTRO.title}</h2>
            <p className={`${BODY} max-w-3xl`}>{FIRST_SHOW_OUTRO.body}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Key href="/promoter" variant="pen">Open My Meets</Key>
              <Key href="/how-it-works#faq" variant="line">Promoter FAQ</Key>
            </div>
          </WebCell>
        </section>
      </div>
    </WebsiteShell>
  );
}
