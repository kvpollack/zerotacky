import type { Metadata } from 'next';
import Link from 'next/link';
import WebsiteShell from '@/components/website/WebsiteShell';
import { Cap, Key, SectionCap, keyClass, textLink } from '@/components/website/sheet';
import { HOW_IT_WORKS_TRACKS, HOW_IT_WORKS_FAQ, HOW_FAQ_GROUPS, HOW_IT_WORKS_ROADMAP } from '@/lib/website/howItWorks';
import { canonical } from '@/lib/website/seo';

export const metadata: Metadata = {
  title: 'How ZeroTacky Works | ZeroTacky',
  description:
    'How promoters build and run a meet, how athletes find, follow and register for shows, and how volunteers and judges join on meet day.',
  ...canonical('/how-it-works'),
};

// Kurt 10/19: one page that ties the flow together. The steps link into the real screen they describe, and the copy
// lives in lib/website/howItWorks.ts so a test can check every link points at a route that exists.
// Hand redraw in the sheet grammar (11/5): numbered steps as rows of a ruled block (step number in the sheet face, pen),
// FAQ and roadmap as two-column ruled blocks with a blank filler cell when the count is odd. No icons.
const H1 = 'text-[28px] sm:text-[34px] font-bold leading-[1.05] text-ink';
const H2 = 'text-[22px] font-bold leading-tight text-ink';
const LEDE = 'text-[15px] leading-relaxed text-ink max-w-3xl';
const BODY = 'text-[14px] leading-relaxed text-ink-muted';
const JUMP = keyClass('line', 'min-h-10 px-3.5 text-[12px]');

function Filler({ count }: { count: number }) {
  return count % 2 === 1 ? <div aria-hidden="true" className="hidden sm:block" /> : null;
}

export default function HowItWorksPage() {
  return (
    <WebsiteShell activeNav="how">
      <div className="flex flex-col gap-7">
        <div className="flex flex-col gap-3">
          <h1 className={H1}>How ZeroTacky Works</h1>
          <p className={LEDE}>
            One site for the whole meet: the promoter builds it on a phone or laptop, athletes find and enter it here,
            volunteers join with a six-character code on the day, and everyone watches the same live scoreboard. Pick the
            track that fits you.
          </p>
          <nav aria-label="Tracks" className="flex flex-wrap gap-2 pt-1">
            {HOW_IT_WORKS_TRACKS.map((t) => (
              <a key={t.id} href={`#${t.id}`} className={JUMP}>{t.title}</a>
            ))}
            <a href="#faq" className={JUMP}>FAQ</a>
            <a href="#roadmap" className={JUMP}>What&apos;s coming</a>
          </nav>
        </div>

        {HOW_IT_WORKS_TRACKS.map((track) => (
          <section key={track.id} id={track.id} aria-labelledby={`${track.id}-heading`} className="scroll-mt-24">
            <div className="flex flex-col gap-1.5 mb-3">
              <Cap as="span">{track.kicker}</Cap>
              <h2 id={`${track.id}-heading`} className={H2}>{track.title}</h2>
              <p className={LEDE}>{track.intro}</p>
            </div>
            <ol className="zt-block grid-cols-1">
              {track.steps.map((step, i) => (
                <li key={step.title} className="flex gap-4 px-4 py-3.5 sm:px-5">
                  <span className="font-sheet text-pen text-[26px] leading-none w-8 shrink-0 pt-0.5" aria-hidden="true">{i + 1}</span>
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="text-[15px] font-bold text-ink leading-snug">{step.title}</div>
                    <p className={BODY}>{step.body}</p>
                    {step.link && (
                      <Link href={step.link.href} className={`text-[13px] ${textLink} self-start`}>{step.link.label}</Link>
                    )}
                  </div>
                </li>
              ))}
              {track.id === 'promoters' && (
                <li className="bg-ground flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4 sm:px-5">
                  <div className="flex flex-col gap-0.5 min-w-0 flex-1 basis-[16rem]">
                    <div className="text-[15px] font-bold text-ink leading-snug">Setting up your first show, step by step</div>
                    <p className={BODY}>
                      One meet from a blank screen to posted results, with a picture of every screen and what each change does on
                      the public side.
                    </p>
                  </div>
                  <Key href="/how-it-works/first-show" variant="ink">Read the guide</Key>
                </li>
              )}
            </ol>
          </section>
        ))}

        <section id="faq" aria-labelledby="faq-heading" className="scroll-mt-24 flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Cap as="span">Common questions</Cap>
            <h2 id="faq-heading" className={H2}>FAQ</h2>
          </div>
          {HOW_FAQ_GROUPS.map((group) => {
            const items = HOW_IT_WORKS_FAQ.filter((f) => f.group === group.id);
            if (!items.length) return null;
            return (
              <div key={group.id}>
                <SectionCap>{group.title}</SectionCap>
                <dl className="zt-block grid-cols-1 sm:grid-cols-2">
                  {items.map((item) => (
                    <div key={item.q} className="flex flex-col gap-1 px-4 py-3.5 sm:px-5 min-w-0">
                      <dt className="text-[15px] font-bold text-ink leading-snug">{item.q}</dt>
                      <dd className={BODY}>
                        {item.a}
                        {item.link && (
                          <>
                            {' '}
                            <Link href={item.link.href} className={textLink}>{item.link.label}</Link>
                          </>
                        )}
                      </dd>
                    </div>
                  ))}
                  <Filler count={items.length} />
                </dl>
              </div>
            );
          })}
        </section>

        <section id="roadmap" aria-labelledby="roadmap-heading" className="scroll-mt-24">
          <div className="flex flex-col gap-1.5 mb-3">
            <Cap as="span">Not here yet</Cap>
            <h2 id="roadmap-heading" className={H2}>What&apos;s coming</h2>
            <p className={LEDE}>
              Everything above is live today and free. These are the next pieces, in roughly the order we plan to build them.
            </p>
          </div>
          <ul className="zt-block grid-cols-1 sm:grid-cols-2">
            {HOW_IT_WORKS_ROADMAP.map((item) => (
              <li key={item.title} className="flex flex-col gap-1 px-4 py-3.5 sm:px-5 min-w-0">
                <div className="text-[15px] font-bold text-ink leading-snug">{item.title}</div>
                <p className={BODY}>{item.body}</p>
              </li>
            ))}
            <Filler count={HOW_IT_WORKS_ROADMAP.length} />
          </ul>
        </section>
      </div>
    </WebsiteShell>
  );
}
