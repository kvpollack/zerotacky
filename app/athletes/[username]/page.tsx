import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Dumbbell, ExternalLink, MapPin, Trophy, User } from 'lucide-react';
import WebsiteShell from '@/components/website/WebsiteShell';
import { getAthleteShowHistory, getPublicAthleteByUsername } from '@/lib/website/data';
import { formatPlace, formatShowDate } from '@/lib/website/showHistory';
import { SOCIAL_KEYS, socialUrl } from '@/lib/auth/profile';
import { athleteJsonLd, canonical } from '@/lib/website/seo';
import JsonLd from '@/components/website/JsonLd';

// Profiles change when people edit them; 60 s keeps the page close to live without a query per visit.
export const revalidate = 60;

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

export default async function AthleteProfilePage({ params }: AthletePageProps) {
  const { username } = await params;
  const res = await getPublicAthleteByUsername(username);
  const a = res.data;
  if (!a) notFound();
  const history = (await getAthleteShowHistory(a.username)).data ?? [];

  const socials = SOCIAL_KEYS.map((sk) => ({ ...sk, value: a.socials[sk.key] ?? '', href: a.socials[sk.key] ? socialUrl(sk.key, a.socials[sk.key] as string) : '' })).filter((s) => s.value && s.href);

  return (
    <WebsiteShell activeNav="athletes">
      <JsonLd data={athleteJsonLd(a)} />
      <div className="space-y-6">
        <div>
          <Link href="/athletes" className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase text-zt-muted hover:text-zt-text">
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            Back to Athletes
          </Link>
        </div>

        <section className="bg-zt-surface border border-zt-border rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="w-20 h-20 rounded-full overflow-hidden bg-zt-inset border border-zt-border-strong flex items-center justify-center shrink-0">
              {a.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.avatarUrl} alt={`${a.displayName}'s profile photo`} className="w-full h-full object-cover" />
              ) : (
                <User className="w-8 h-8 text-zt-muted" aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0 space-y-1">
              <h1 className="text-2xl sm:text-3xl font-black text-zt-text truncate">{a.displayName}</h1>
              <div className="text-xs font-bold text-zt-muted">@{a.username}</div>
              <div className="flex flex-wrap gap-1 pt-1">
                {a.badges.map((b) => (
                  <span key={b} className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-zt-inset border border-zt-border text-zt-primary">{b}</span>
                ))}
              </div>
            </div>
          </div>

          {(a.location || a.homeGymName) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-zt-border text-xs">
              {a.location && (
                <div className="bg-zt-inset border border-zt-border rounded-xl p-3">
                  <div className="text-[10px] font-extrabold uppercase text-zt-muted">Location</div>
                  <div className="text-sm font-black text-zt-text mt-0.5 flex items-center gap-1.5"><MapPin className="w-4 h-4 text-zt-primary" aria-hidden="true" />{a.location}</div>
                </div>
              )}
              {a.homeGymName && (
                <div className="bg-zt-inset border border-zt-border rounded-xl p-3">
                  <div className="text-[10px] font-extrabold uppercase text-zt-muted">Home gym</div>
                  <div className="text-sm font-black text-zt-text mt-0.5 flex items-center gap-1.5"><Dumbbell className="w-4 h-4 text-zt-primary" aria-hidden="true" />{a.homeGymName}</div>
                </div>
              )}
            </div>
          )}
        </section>

        {(a.favoriteLift || a.prs.length > 0) && (
          <section aria-labelledby="lifting-heading" className="space-y-3">
            <h2 id="lifting-heading" className="text-base font-black uppercase tracking-wider text-zt-primary">Lifting</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {a.favoriteLift && (
                <div className="bg-zt-surface border border-zt-border rounded-2xl p-4 space-y-1">
                  <div className="text-[10px] font-extrabold uppercase text-zt-muted">Favorite lift</div>
                  <div className="text-sm font-black text-zt-text">{a.favoriteLift}</div>
                  {a.favoriteLiftNote && <p className="text-xs font-semibold text-zt-text-2">{a.favoriteLiftNote}</p>}
                </div>
              )}
              {a.prs.length > 0 && (
                <div className="bg-zt-surface border border-zt-border rounded-2xl p-4 space-y-1.5">
                  <div className="text-[10px] font-extrabold uppercase text-zt-muted">PRs</div>
                  <ul className="space-y-1">
                    {a.prs.map((pr, i) => (
                      <li key={i} className="flex items-baseline justify-between gap-3 text-xs">
                        <span className="font-black text-zt-text">{pr.lift || 'Lift'}</span>
                        <span className="font-bold text-zt-primary">{pr.value || '—'}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[10px] text-zt-muted">Self-reported.</p>
                </div>
              )}
            </div>
          </section>
        )}

        {history.length > 0 && (
          <section aria-labelledby="history-heading" className="space-y-3">
            <h2 id="history-heading" className="text-base font-black uppercase tracking-wider text-zt-primary">Show History</h2>
            <ul className="space-y-2">
              {history.map((h) => {
                const placeLabel = formatPlace(h);
                const podium = h.place != null && h.place <= 3 && !h.withdrawn;
                return (
                  <li key={h.meetId} className="bg-zt-surface border border-zt-border rounded-2xl p-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="text-xs font-extrabold uppercase text-zt-muted">{formatShowDate(h.date)}{h.venue ? ` • ${h.venue}` : ''}</div>
                      <Link href={h.href} className="block text-sm font-black text-zt-text hover:text-zt-primary break-words">{h.name}</Link>
                      <div className="text-xs font-semibold text-zt-text-2">
                        {h.divisionName}
                        {h.athleteName !== a.displayName ? ` • entered as ${h.athleteName}` : ''}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-lg font-black flex items-center justify-end gap-1.5 ${podium ? 'text-zt-primary' : 'text-zt-text'}`}>
                        {podium && <Trophy className="w-4 h-4" aria-hidden="true" />}
                        {placeLabel}
                      </div>
                      {h.place != null && !h.withdrawn && (
                        <div className="text-xs font-bold text-zt-muted">
                          {h.totalPoints} pts • {h.eventWins} event {h.eventWins === 1 ? 'win' : 'wins'} of {h.eventCount}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-zt-muted">Official results from shows scored on ZeroTacky and marked final by the promoter.</p>
          </section>
        )}

        {socials.length > 0 && (
          <section aria-labelledby="links-heading" className="space-y-3">
            <h2 id="links-heading" className="text-base font-black uppercase tracking-wider text-zt-text">Links</h2>
            <div className="flex flex-wrap gap-2">
              {socials.map((s) => (
                <a key={s.key} href={s.href} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zt-surface border border-zt-border hover:border-zt-primary text-xs font-bold text-zt-text">
                  <span className="text-[10px] font-black uppercase text-zt-muted">{s.label}</span>
                  <span className="truncate max-w-[14rem]">{s.key === 'website' ? s.value.replace(/^https?:\/\//, '') : `@${s.value}`}</span>
                  <ExternalLink className="w-3 h-3 text-zt-muted" aria-hidden="true" />
                </a>
              ))}
            </div>
          </section>
        )}

        <p className="text-[11px] text-zt-muted">
          Everything on this page was entered by {a.displayName} and is shown because they turned on their public profile.
          Is this you? Edit it from your <Link href="/website/account" className="underline hover:text-zt-text">account page</Link>.
        </p>
      </div>
    </WebsiteShell>
  );
}
