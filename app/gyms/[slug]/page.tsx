import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import WebsiteShell from '@/components/website/WebsiteShell';
import { Cap, Key, SectionCap, WebCell, textLink } from '@/components/website/sheet';
import { getPublicGymBySlug, listPublicShows } from '@/lib/website/data';
import { canonical, gymJsonLd } from '@/lib/website/seo';
import { longIsoDate } from '@/lib/website/sheetFormat';
import { competitionStatusLabel } from '@/lib/website/profileLinks';
import { buildHostingRecord } from '@/lib/website/hostingRecord';
import { reportHref } from '@/lib/website/meetReport';
import { todayIsoDate } from '@/lib/promoter/rules';
import JsonLd from '@/components/website/JsonLd';
import GymInviteAdmin from '@/components/website/GymInviteAdmin';

// Directory rows are loaded by scripts outside deploys; refresh every 5 min.
export const revalidate = 300;

// Hand redraw in the sheet grammar (11/5): the gym's colour fills one band (like the promoter band on a show page),
// a facts strip under it, then one ruled block per section. Equipment and hosted shows are ruled lists, two columns
// from `sm` with a blank filler cell when the count is odd so the block never shows a dark hole.
const FACT_V = 'text-[15px] font-bold leading-snug text-ink';
const FACT_S = 'block text-[13px] font-normal text-ink-muted';
const NOTE = 'text-[13px] leading-snug text-ink-muted';
const CHIP = 'inline-flex items-center border-2 border-rule px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.04em] text-ink whitespace-nowrap';
const ROW = 'flex flex-col gap-1 px-4 py-3 sm:px-5 min-w-0';

const DAY_PASS: Record<string, string> = { available: 'Available', by_appointment: 'By appointment', not_available: 'Not available' };

interface GymDetailPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: GymDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const res = await getPublicGymBySlug(slug);
  if (!res.data) {
    return { title: 'Gym Not Found | ZeroTacky' };
  }
  return {
    title: `${res.data.name} (${res.data.city}, ${res.data.state}) | ZeroTacky`,
    description: `Equipment, day-pass policy, and drop-in details for ${res.data.name}.`,
    openGraph: { url: `/gyms/${res.data.slug}` },
    ...canonical(`/gyms/${res.data.slug}`),
    ...(res.data.isDemoListing ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function GymDetailPage({ params }: GymDetailPageProps) {
  const { slug } = await params;
  const [gymRes, showsRes] = await Promise.all([getPublicGymBySlug(slug), listPublicShows()]);
  const gym = gymRes.data;

  if (!gym) notFound();

  const hostedShows = (showsRes.data ?? []).filter((s) =>
    s.hostGymSlug === gym.slug || gym.hostedShowSlugs.includes(s.slug)
  );
  // #19 (11/8): the hosting record, upcoming first, past with a post-meet report key once completed.
  const record = buildHostingRecord(hostedShows, todayIsoDate());
  const typeLabel = gym.gymType === 'mixed' ? 'Strongman + Powerlifting' : gym.gymType;
  const claimLabel = gym.claimStatus === 'claimed' ? 'Claimed by the gym' : gym.claimStatus === 'unclaimed' ? 'Unclaimed listing' : '';
  const notProvided = <span className={`${FACT_V} text-ink-muted font-normal`}>Not provided</span>;

  return (
    <WebsiteShell activeNav="gyms" brand={gym.theme ?? null}>
      {!gym.isDemoListing && <JsonLd data={gymJsonLd(gym)} />}
      <div className="flex flex-col gap-7">
        <div>
          <Link href="/gyms" className="inline-flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-[0.04em] text-ink-muted hover:text-ink no-underline">
            <span aria-hidden="true">←</span>
            Back to Gym Directory
          </Link>
        </div>

        {/* Gym band: the one place on this page the gym's colour fills */}
        <div>
          <div className="bg-slot text-slot-label border-2 border-b-0 border-rule flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-5 sm:px-7 min-h-16 py-3 text-[15px] sm:text-lg leading-snug">
            <h1 className="font-normal">
              <span className="font-bold text-xl sm:text-[22px]">{gym.name}</span>
              <span className="opacity-60 mx-3.5" aria-hidden="true">·</span>
              <span>{gym.city}, {gym.state}</span>
            </h1>
            <div className="text-[13px] sm:text-[15px] uppercase tracking-[0.04em]">
              {typeLabel && <span>{typeLabel}</span>}
              {typeLabel && claimLabel && <span className="opacity-60 mx-3.5" aria-hidden="true">·</span>}
              {claimLabel && <span>{claimLabel}</span>}
              {gym.isDemoListing && (
                <>
                  <span className="opacity-60 mx-3.5" aria-hidden="true">·</span>
                  <span>Demo listing (fictional)</span>
                </>
              )}
            </div>
          </div>

          {/* Facts strip */}
          <section aria-label="Gym facts" className="zt-block border-t-0 grid-cols-2 lg:grid-cols-4">
            <WebCell pad="sm" className="min-h-[84px] justify-center gap-1 px-4">
              <Cap>Address</Cap>
              <div className={FACT_V}>
                {gym.streetAddress || <span className="font-normal text-ink-muted">Street address not provided</span>}
                <span className={FACT_S}>{gym.city}, {gym.state}{gym.postalCode ? ` ${gym.postalCode}` : ''}</span>
              </div>
            </WebCell>
            <WebCell pad="sm" className="min-h-[84px] justify-center gap-1 px-4">
              <Cap>Day pass</Cap>
              <div className={FACT_V}>
                {DAY_PASS[gym.dayPassAvailability] ?? <span className="font-normal text-ink-muted">Not provided</span>}
                <span className={`${FACT_S} ${gym.dayPassPriceDisplay ? 'text-pen font-bold' : ''}`}>{gym.dayPassPriceDisplay || 'Price not provided'}</span>
              </div>
            </WebCell>
            <WebCell pad="sm" className="min-h-[84px] justify-center gap-1 px-4">
              <Cap>Drop-in hours</Cap>
              {gym.dropInHours ? <div className={FACT_V}>{gym.dropInHours}</div> : notProvided}
            </WebCell>
            <WebCell pad="sm" className="min-h-[84px] justify-center gap-1 px-4">
              <Cap>Contact &amp; booking</Cap>
              <div className={FACT_V}>
                {gym.contactInfo ? <span className="break-words">{gym.contactInfo}</span> : <span className="font-normal text-ink-muted">Not provided</span>}
                {gym.dayPassBookingUrl ? (
                  <a href={gym.dayPassBookingUrl} target="_blank" rel="noopener noreferrer" className={`${FACT_S} ${textLink} text-pen`}>Day pass / waiver link <span aria-hidden="true">↗</span></a>
                ) : (
                  <span className={FACT_S}>No booking link</span>
                )}
              </div>
            </WebCell>
          </section>

          <div className="text-[12px] text-ink-muted mt-2">Last updated: {gym.lastUpdatedDate}</div>
        </div>

        {/* 058: new to strongman. Shown whenever the gym answered; "no" is an answer too, so a beginner does not email a gym that
            cannot help them. Unknown stays quiet. */}
        {gym.introSessions && gym.introSessions !== 'not_provided' && (
          <section aria-labelledby="intro-heading" className="zt-block grid-cols-1">
            <WebCell>
              <Cap as="h2" id="intro-heading">New to strongman?</Cap>
              <p className="text-[15px] leading-relaxed text-ink font-bold">
                {gym.introSessions === 'yes' ? 'This gym runs intro strongman sessions for beginners.'
                  : gym.introSessions === 'on_request' ? 'Intro sessions on request: contact the gym and they will set one up.'
                  : 'No intro sessions here. Try the directory filter for gyms that run them.'}
              </p>
              {gym.introSessionsNote && <p className="text-[15px] leading-relaxed text-ink mt-1">{gym.introSessionsNote}</p>}
              <div className="flex flex-wrap gap-3 mt-2">
                {gym.introSessionsUrl && (
                  <a href={gym.introSessionsUrl} target="_blank" rel="noopener noreferrer" className={`${textLink} text-pen font-bold`}>Sign up or read more <span aria-hidden="true">↗</span></a>
                )}
                {gym.introSessions === 'no' && <Key href="/gyms?intro=1" variant="line">Gyms with intro sessions</Key>}
              </div>
            </WebCell>
          </section>
        )}

        {/* Policy */}
        <section aria-labelledby="policy-heading" className="zt-block grid-cols-1">
          <WebCell>
            <Cap as="h2" id="policy-heading">Drop-in &amp; equipment policy</Cap>
            <p className={gym.dropInPolicy ? 'text-[15px] leading-relaxed text-ink' : NOTE}>{gym.dropInPolicy || 'Not provided'}</p>
          </WebCell>
        </section>

        {/* Provenance + claim keys */}
        {!gym.isDemoListing && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <p className={`${NOTE} max-w-2xl`}>
              {gym.claimStatus === 'claimed'
                ? 'Details are maintained by the gym.'
                : (
                  <>
                    Built from the gym&rsquo;s own website
                    {gym.sourceUrl ? (<> (<a href={gym.sourceUrl} target="_blank" rel="noopener noreferrer" className={textLink}>source</a>)</>) : null}
                    , checked {gym.lastUpdatedDate}. Nobody from the gym has reviewed it yet.
                  </>
                )}
            </p>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {gym.claimStatus === 'unclaimed' && (
                <Key href={`/gyms/${gym.slug}/claim`} variant="pen">Claim this gym</Key>
              )}
              <Key href={`/gyms/${gym.slug}/claim?mode=report`} variant="line">Not right? Report it</Key>
            </div>
          </div>
        )}
        {!gym.isDemoListing && <GymInviteAdmin gymId={gym.id} claimed={gym.claimStatus === 'claimed'} />}

        {/* Equipment */}
        <section aria-labelledby="gym-equipment-heading">
          <SectionCap id="gym-equipment-heading" aside={gym.equipment.length > 0 ? <span className={`${NOTE} hidden sm:inline`}>Sizes and weights as the gym lists them</span> : undefined}>
            Equipment &amp; specifications ({gym.equipment.length})
          </SectionCap>
          {gym.equipment.length === 0 ? (
            <div className="zt-block grid-cols-1">
              <WebCell><p className={NOTE}>No equipment list yet. The gym&rsquo;s site confirms strongman or powerlifting training but does not name implements; the owner can fill this in after claiming.</p></WebCell>
            </div>
          ) : (
            <ul className="zt-block grid-cols-1 sm:grid-cols-2">
              {gym.equipment.map((item) => (
                <li key={item.name} className={ROW}>
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="text-[15px] font-bold text-ink">{item.name}</span>
                    <span className={CHIP}>{item.category}</span>
                  </div>
                  <p className={item.details ? 'text-[13px] leading-snug text-ink' : NOTE}>{item.details || 'Size / weight range not provided'}</p>
                </li>
              ))}
              {gym.equipment.length % 2 === 1 && <li aria-hidden="true" className="hidden sm:block" />}
            </ul>
          )}
        </section>

        {/* Hosting record (#19): upcoming, then past with the post-meet report */}
        <section aria-labelledby="hosted-shows-heading">
          <SectionCap
            id="hosted-shows-heading"
            aside={record.total > 0 && record.firstDate ? <span className={`${NOTE} hidden sm:inline`}>{record.total} show{record.total === 1 ? '' : 's'}{record.firstDate !== record.lastDate ? ` since ${longIsoDate(record.firstDate)}` : ''}</span> : undefined}
          >
            Hosting record ({record.total})
          </SectionCap>
          {record.total === 0 ? (
            <div className="zt-block grid-cols-1">
              <WebCell><p className={NOTE}>No shows linked to this gym listing yet. Promoters pick the host gym on their Listing tab.</p></WebCell>
            </div>
          ) : (
            <ul className="zt-block grid-cols-1">
              {[...record.upcoming, ...record.past].map((show) => (
                <li key={show.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-5">
                  <div className="min-w-0 flex-1 basis-[14rem] flex flex-col gap-0.5">
                    <Cap as="span">{show.date ? longIsoDate(show.date) : 'Date not provided'}</Cap>
                    {show.externalUrl ? (
                      <a href={show.externalUrl} rel="noopener noreferrer" className="text-[15px] font-bold leading-snug text-ink no-underline hover:text-pen break-words">{show.name}</a>
                    ) : (
                      <Link href={`/shows/${show.slug}`} className="text-[15px] font-bold leading-snug text-ink no-underline hover:text-pen break-words">{show.name}</Link>
                    )}
                    <div className="text-[13px] text-ink-muted">
                      {show.divisionLabels.length} division{show.divisionLabels.length === 1 ? '' : 's'}
                      {show.implementTags.length > 0 ? ` · ${show.implementTags.join(', ')}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {record.reportable.has(show.slug) && (
                      <Key href={reportHref(show.slug)} variant="line" className="!min-h-8 !px-3 !text-[11px]">Post-meet report</Key>
                    )}
                    <span className={show.competitionStatus === 'live' ? `${CHIP} border-pen bg-pen text-pen-label` : CHIP}>
                      {competitionStatusLabel(show.competitionStatus)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </WebsiteShell>
  );
}
