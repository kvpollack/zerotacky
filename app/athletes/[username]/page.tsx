import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import WebsiteShell from '@/components/website/WebsiteShell';
import { Cap, SectionCap, WebCell, textLink } from '@/components/website/sheet';
import { getAthleteShowHistory, getProfileLinks, getPublicAthleteByUsername } from '@/lib/website/data';
import { formatPlace, formatShowDate } from '@/lib/website/showHistory';
import { competitionStatusLabel, splitShows } from '@/lib/website/profileLinks';
import { SOCIAL_KEYS, socialUrl } from '@/lib/auth/profile';
import { athleteJsonLd, canonical } from '@/lib/website/seo';
import JsonLd from '@/components/website/JsonLd';

// Profiles change when people edit them; 60 s keeps the page close to live without a query per visit.
export const revalidate = 60;

// Hand redraw in the sheet grammar (11/5): identity band + facts strip like the show page, then one ruled block per
// section (PRs, show history, shows they run, gyms, links). No icons, no floating cards; podium places in pen.
const NUM = 'font-sheet text-pen';
const FACT_V = 'text-[15px] font-bold leading-snug text-ink';
const FACT_S = 'block text-[13px] font-normal text-ink-muted';
const NOTE = 'text-[13px] leading-snug text-ink-muted';
const ROW_TITLE = 'text-[15px] font-bold leading-snug text-ink no-underline hover:text-pen break-words';
const CHIP = 'inline-flex items-center border-2 border-rule px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.04em] text-ink';

interface AthletePageProps {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: AthletePageProps): Promise<Metadata> {
  const { username } = await params;
  const res = await getPublicAthleteByUsername(username);
  if (!res.data) return { title: 'Athlete Not Found | ZeroTacky' };
  const a = res.data;
  return {
    title: `${a.displayName} (@${a.username}) | ZeroTacky`,
    description: [a.badges.join(', '), a.location, a.favoriteLift ? `Favorite lift: ${a.favoriteLift}` : ''].filter(Boolean).join(' • ') || `${a.displayName} on ZeroTacky.`,
    ...(a.avatarUrl ? { openGraph: { images: [{ url: a.avatarUrl }] } } : {}),
    ...canonical(`/athletes/${a.username}`),
  };
}

function initials(name: string): string {
  const parts = name.replace(/^@/, '').split(/[\s_.-]+/).filter(Boolean);
  const s = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? '?').slice(0, 2);
  return s.toUpperCase();
}

export default async function AthleteProfilePage({ params }: AthletePageProps) {
  const { username } = await params;
  const res = await getPublicAthleteByUsername(username);
  const a = res.data;
  if (!a) notFound();
  const [historyRes, linksRes] = await Promise.all([getAthleteShowHistory(a.username), getProfileLinks(a.username)]);
  const history = historyRes.data ?? [];
  const links = linksRes.data ?? { homeGym: null, shows: [], gyms: [] };
  // 029: the directory row wins over the free text when both are set; a gym that left the directory falls back to the text.
  const homeGymLabel = links.homeGym?.name || a.homeGymName;
  const { upcoming: showsUpcoming, past: showsPast } = splitShows(links.shows);
  const showsRun = [...showsUpcoming, ...showsPast];
  const podiums = history.filter((h) => h.place != null && h.place <= 3 && !h.withdrawn).length;

  const socials = SOCIAL_KEYS.map((sk) => ({ ...sk, value: a.socials[sk.key] ?? '', href: a.socials[sk.key] ? socialUrl(sk.key, a.socials[sk.key] as string) : '' })).filter((s) => s.value && s.href);

  return (
    <WebsiteShell activeNav="athletes">
      <JsonLd data={athleteJsonLd(a)} />
      <div className="flex flex-col gap-7">
        <div>
          <Link href="/athletes" className="inline-flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-[0.04em] text-ink-muted hover:text-ink no-underline">
            <span aria-hidden="true">←</span>
            Back to Athletes
          </Link>
        </div>

        {/* Identity band + facts strip */}
        <div>
          <header className="border-2 border-b-0 border-rule bg-sheet flex items-stretch">
            <div className="w-24 h-24 sm:w-28 sm:h-28 shrink-0 border-r-2 border-rule bg-ground flex items-center justify-center overflow-hidden">
              {a.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.avatarUrl} alt={`${a.displayName}'s profile photo`} className="w-full h-full object-cover" />
              ) : (
                <span aria-hidden="true" className={`${NUM} text-[34px] leading-none`}>{initials(a.displayName)}</span>
              )}
            </div>
            <div className="min-w-0 flex flex-col justify-center gap-1.5 px-5 sm:px-7 py-3">
              <Cap as="span">@{a.username}</Cap>
              <h1 className="text-[28px] sm:text-[34px] font-bold leading-[1.05] text-ink break-words">{a.displayName}</h1>
              {a.badges.length > 0 && (
                <ul className="flex flex-wrap gap-1.5 pt-0.5" aria-label="Roles">
                  {a.badges.map((b) => (
                    <li key={b} className={CHIP}>{b}</li>
                  ))}
                </ul>
              )}
            </div>
          </header>

          <section aria-label="Athlete facts" className="zt-block grid-cols-2 lg:grid-cols-4">
            <WebCell pad="sm" className="min-h-[84px] justify-center gap-1 px-4">
              <Cap>Location</Cap>
              <div className={a.location ? FACT_V : `${FACT_V} text-ink-muted font-normal`}>{a.location || 'Not provided'}</div>
            </WebCell>
            <WebCell pad="sm" className="min-h-[84px] justify-center gap-1 px-4">
              <Cap>Home gym</Cap>
              {homeGymLabel ? (
                <div className={FACT_V}>
                  {links.homeGym ? (
                    <Link href={`/gyms/${links.homeGym.slug}`} className={`${textLink} font-bold`}>{links.homeGym.name}</Link>
                  ) : (
                    homeGymLabel
                  )}
                  {links.homeGym && (links.homeGym.city || links.homeGym.state) && (
                    <span className={FACT_S}>{[links.homeGym.city, links.homeGym.state].filter(Boolean).join(', ')} · in the Gym Directory</span>
                  )}
                </div>
              ) : (
                <div className={`${FACT_V} text-ink-muted font-normal`}>Not provided</div>
              )}
            </WebCell>
            <WebCell pad="sm" className="min-h-[84px] justify-center gap-1 px-4">
              <Cap>Favorite lift</Cap>
              {a.favoriteLift ? (
                <div className={FACT_V}>
                  {a.favoriteLift}
                  {a.favoriteLiftNote && <span className={FACT_S}>{a.favoriteLiftNote}</span>}
                </div>
              ) : (
                <div className={`${FACT_V} text-ink-muted font-normal`}>Not provided</div>
              )}
            </WebCell>
            <WebCell pad="sm" className="min-h-[84px] justify-center gap-1 px-4">
              <Cap>Shows on record</Cap>
              <div className={`${NUM} text-[28px] leading-none`}>
                {history.length}
                {podiums > 0 && <span className="font-sans text-[13px] text-ink-muted"> · {podiums} podium{podiums === 1 ? '' : 's'}</span>}
              </div>
            </WebCell>
          </section>
        </div>

        {a.prs.length > 0 && (
          <section aria-labelledby="prs-heading">
            <SectionCap id="prs-heading" aside={<span className={NOTE}>Self-reported</span>}>PRs</SectionCap>
            <dl className="zt-block grid-cols-1">
              {a.prs.map((pr, i) => (
                <div key={i} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 sm:px-5">
                  <dt className="text-[15px] font-bold text-ink">{pr.lift || 'Lift'}</dt>
                  <dd className="text-[18px] font-bold leading-none text-pen shrink-0">{pr.value || '—'}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {history.length > 0 && (
          <section aria-labelledby="history-heading">
            <SectionCap id="history-heading" aside={<span className={`${NOTE} hidden sm:inline`}>Official results, marked final by the promoter</span>}>Show history</SectionCap>
            <ol className="zt-block grid-cols-1">
              {history.map((h) => {
                const placeLabel = formatPlace(h);
                const podium = h.place != null && h.place <= 3 && !h.withdrawn;
                return (
                  <li key={h.meetId} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-5">
                    <div className="min-w-0 flex-1 basis-[14rem] flex flex-col gap-0.5">
                      <Cap as="span">{formatShowDate(h.date)}{h.venue ? ` · ${h.venue}` : ''}</Cap>
                      <Link href={h.href} className={ROW_TITLE}>{h.name}</Link>
                      <div className="text-[13px] text-ink-muted">
                        {h.divisionName}
                        {h.athleteName !== a.displayName ? ` · entered as ${h.athleteName}` : ''}
                      </div>
                    </div>
                    <div className="shrink-0 flex flex-col gap-0.5 sm:text-right">
                      <div className={`text-[20px] font-bold leading-none ${podium ? 'text-pen' : 'text-ink'}`}>{placeLabel}</div>
                      {h.place != null && !h.withdrawn && (
                        <div className="text-[12px] text-ink-muted">
                          {h.totalPoints} pts · {h.eventWins} event {h.eventWins === 1 ? 'win' : 'wins'} of {h.eventCount}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
            <p className={`${NOTE} mt-2 sm:hidden`}>Official results from shows scored on ZeroTacky and marked final by the promoter.</p>
          </section>
        )}

        {showsRun.length > 0 && (
          <section aria-labelledby="shows-run-heading">
            <SectionCap id="shows-run-heading" aside={<span className={`${NOTE} hidden sm:inline`}>Listed shows this account owns</span>}>Shows they run</SectionCap>
            <ul className="zt-block grid-cols-1">
              {showsRun.map((sh) => (
                <li key={sh.slug} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-5">
                  <div className="min-w-0 flex-1 basis-[14rem] flex flex-col gap-0.5">
                    <Cap as="span">{formatShowDate(sh.date)}{sh.venue ? ` · ${sh.venue}` : ''}</Cap>
                    <Link href={`/shows/${sh.slug}`} className={ROW_TITLE}>{sh.name}</Link>
                  </div>
                  <span className={sh.competitionStatus === 'live' ? `${CHIP} border-pen bg-pen text-pen-label` : CHIP}>
                    {competitionStatusLabel(sh.competitionStatus)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {links.gyms.length > 0 && (
          <section aria-labelledby="gyms-heading">
            <SectionCap id="gyms-heading" aside={<span className={`${NOTE} hidden sm:inline`}>Claimed listings in the Gym Directory</span>}>{links.gyms.length === 1 ? 'Gym' : 'Gyms'}</SectionCap>
            <ul className="zt-block grid-cols-1">
              {links.gyms.map((g) => (
                <li key={g.slug} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-3 sm:px-5">
                  <Link href={`/gyms/${g.slug}`} className={ROW_TITLE}>{g.name}</Link>
                  <span className="text-[13px] text-ink-muted">{[g.city, g.state].filter(Boolean).join(', ')}{g.gymType ? ` · ${g.gymType}` : ''}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {socials.length > 0 && (
          <section aria-labelledby="links-heading">
            <SectionCap id="links-heading">Links</SectionCap>
            <ul className="flex flex-wrap gap-2">
              {socials.map((s) => (
                <li key={s.key}>
                  <a href={s.href} target="_blank" rel="noopener noreferrer nofollow" className="flex flex-col gap-0.5 border-2 border-rule bg-sheet px-4 py-2.5 no-underline hover:bg-ink hover:text-sheet group">
                    <Cap as="span" className="group-hover:text-sheet">{s.label}</Cap>
                    <span className="text-[15px] font-bold text-ink group-hover:text-sheet truncate max-w-[16rem]">
                      {s.key === 'website' ? s.value.replace(/^https?:\/\//, '') : `@${s.value}`} <span aria-hidden="true">↗</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className={NOTE}>
          Everything on this page was entered by {a.displayName} and is shown because they turned on their public profile.
          Is this you? Edit it from your <Link href="/website/account" className={textLink}>account page</Link>.
        </p>
      </div>
    </WebsiteShell>
  );
}
