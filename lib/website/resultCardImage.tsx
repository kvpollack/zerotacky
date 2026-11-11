// Pixels for the IG result card (11/10 night): the sheet look of lib/website/og.tsx (white sheet on the ground, ink
// rules, Red Hat Mono, the wordmark with the Set Stone as the 0) at three sizes. Satori layout: every box is flex,
// no CSS grid, no inherited line clamps. Fonts come from loadFonts() in og.tsx (TTF read through process.cwd()).
import { ImageResponse } from 'next/og';
import { GROUND, INK, MUTED, PEN, SHEET, Wordmark, loadFonts } from './og';
import { RESULT_CARD_SIZES, type ResultCardData, type ResultCardSize } from './resultCard';

// Scale every measurement off a 1080-wide canvas; the wide card is a 1200 x 630 crop of the same type ramp.
// padY: the story keeps the sheet inside Instagram's safe zone (the top and bottom ~250 px carry the UI).
interface Scale { u: number; pad: number; padY: number; rule: number; nameMax: number; eventsMax: number }
const SCALES: Record<ResultCardSize, Scale> = {
  square: { u: 1, pad: 56, padY: 56, rule: 6, nameMax: 72, eventsMax: 6 },
  story: { u: 1.22, pad: 60, padY: 200, rule: 6, nameMax: 84, eventsMax: 8 },
  link: { u: 0.78, pad: 40, padY: 40, rule: 5, nameMax: 56, eventsMax: 0 },
};

const MONO_ADV = 0.6;
/** Largest font size (down to `min`) at which `text` fits in `width` on one line of Red Hat Mono. */
export function fitMono(text: string, width: number, max: number, min: number): number {
  const chars = Math.max(1, text.length);
  const px = Math.floor(width / (chars * MONO_ADV));
  return Math.max(min, Math.min(max, px));
}

/** Trim to `cap` characters with an ellipsis; never breaks the layout on a 99-character meet name. */
export function clip(text: string, cap: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= cap ? t : `${t.slice(0, Math.max(1, cap - 1)).trimEnd()}…`;
}

export async function renderResultCard(data: ResultCardData, size: ResultCardSize): Promise<ImageResponse> {
  const { width, height } = RESULT_CARD_SIZES[size];
  const s = SCALES[size];
  const fonts = await loadFonts();
  const innerW = width - s.pad * 2 - s.rule * 2;
  const colW = innerW - s.pad * 2 * 0.75;
  const nameSize = fitMono(data.athleteName, colW, s.nameMax * s.u, 30);
  const placeSize = Math.round((size === 'link' ? 150 : 210) * s.u);
  const meet = clip(data.meetName, size === 'link' ? 44 : 52);
  const meetSize = fitMono(meet, colW, 40 * s.u, 22);
  const sub = [data.dateLabel, data.venueLabel].filter(Boolean).join(' · ');
  const subSize = fitMono(sub, colW, 24 * s.u, 16);
  const events = s.eventsMax > 0 ? data.events.slice(0, s.eventsMax) : [];
  const more = data.events.length - events.length;
  const live = data.statusLabel === 'Live';
  const badge = data.isDemo ? 'DEMO' : live ? 'LIVE' : data.statusLabel === 'Official Final' ? 'FINAL' : 'PROVISIONAL';
  const small = Math.round(20 * s.u), label = Math.round(16 * s.u);
  const wordmarkFs = Math.round(44 * s.u);
  const url = `zerotacky.com/shows/${data.slug}`;
  const urlSize = fitMono(url, innerW - s.pad * 1.5 - Math.round(170 * s.u), Math.round(22 * s.u), 13);
  // Wide card: no event table, so the placings ride on one line under the points.
  const placings = data.events.filter((e) => e.scored).map((e) => `E${e.eventNumber} ${e.tied ? 'T' : ''}${e.place}${PLACE_ORD(e.place)}`).join(' · ');
  const placingsSize = fitMono(placings, colW, Math.round(22 * s.u), 12);
  const nowrap = { whiteSpace: 'nowrap' as const, overflow: 'hidden' as const, textOverflow: 'ellipsis' as const };

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: GROUND, padding: `${s.padY}px ${s.pad}px`, fontFamily: 'Red Hat Mono', color: INK }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, background: SHEET, border: `${s.rule}px solid ${INK}` }}>
          {/* header: wordmark + status */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `0 ${s.pad * 0.75}px`, height: Math.round(96 * s.u), borderBottom: `${s.rule}px solid ${INK}` }}>
            <Wordmark fs={wordmarkFs} />
            <div style={{ display: 'flex', alignItems: 'center', height: Math.round(48 * s.u), padding: `0 ${Math.round(18 * s.u)}px`, fontSize: small, fontWeight: 700, letterSpacing: 2, border: `${s.rule}px solid ${live ? PEN : INK}`, background: live ? PEN : SHEET, color: live ? SHEET : INK }}>
              {badge}
            </div>
          </div>

          {/* body */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: `${Math.round(28 * s.u)}px ${s.pad * 0.75}px`, gap: Math.round(10 * s.u) }}>
            <div style={{ fontSize: label, letterSpacing: 2, color: MUTED, textTransform: 'uppercase' }}>Result</div>
            <div style={{ fontSize: nameSize, fontWeight: 700, lineHeight: 1.05 }}>{data.athleteName}</div>
            <div style={{ fontSize: Math.round(26 * s.u), color: MUTED }}>{clip(data.divisionName, 40)}</div>

            {/* the place, big */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: Math.round(24 * s.u), marginTop: Math.round(size === 'link' ? 4 : 18 * s.u) }}>
              <div style={{ fontSize: placeSize, fontWeight: 700, lineHeight: 0.9, letterSpacing: -2 }}>
                {data.place === null ? 'DNF' : `${data.isTied ? 'T' : ''}${data.place}`}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: Math.round(6 * s.u), paddingBottom: Math.round(10 * s.u) }}>
                <div style={{ fontSize: Math.round(30 * s.u), fontWeight: 700 }}>{data.placeLabel}</div>
                <div style={{ fontSize: Math.round(22 * s.u), color: MUTED }}>
                  {`${data.totalPoints} pts · ${data.eventWins} event ${data.eventWins === 1 ? 'win' : 'wins'}`}
                </div>
              </div>
            </div>
            {size === 'link' && placings && (
              <div style={{ fontSize: placingsSize, color: INK, marginTop: Math.round(14 * s.u), ...nowrap }}>{placings}</div>
            )}

            {size === 'story' && <div style={{ flex: 1 }} />}

            {/* event-by-event (square + story) */}
            {events.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', marginTop: Math.round(22 * s.u), borderTop: `${Math.round(3 * s.u)}px solid ${INK}` }}>
                {events.map((e) => (
                  <div key={e.eventNumber} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: Math.round(16 * s.u), height: Math.round(50 * s.u), borderBottom: `2px solid ${GROUND}`, fontSize: Math.round((size === 'story' ? 19 : 22) * s.u) }}>
                    <div style={{ display: 'flex', gap: Math.round(14 * s.u), flex: 1, minWidth: 0 }}>
                      <span style={{ color: MUTED, width: Math.round(46 * s.u), flexShrink: 0 }}>{`E${e.eventNumber}`}</span>
                      <span style={{ fontWeight: 700, flex: 1, minWidth: 0, ...nowrap }}>{e.name}</span>
                    </div>
                    <div style={{ display: 'flex', gap: Math.round(18 * s.u), alignItems: 'center', flexShrink: 0 }}>
                      <span style={nowrap}>{e.scored ? clip(e.display, 15) : '—'}</span>
                      <span style={{ color: MUTED, width: Math.round(215 * s.u), textAlign: 'right', ...nowrap }}>
                        {e.scored ? `${e.tied ? 'T' : ''}${e.place}${e.place ? PLACE_ORD(e.place) : ''} · ${e.points} pts` : 'no mark'}
                      </span>
                    </div>
                  </div>
                ))}
                {more > 0 && <div style={{ fontSize: label, color: MUTED, paddingTop: Math.round(8 * s.u) }}>{`+${more} more on the show page`}</div>}
              </div>
            )}

            <div style={{ flex: 1 }} />
            {/* meet */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: Math.round(6 * s.u), borderTop: `${Math.round(3 * s.u)}px solid ${INK}`, paddingTop: Math.round(16 * s.u) }}>
              <div style={{ fontSize: meetSize, fontWeight: 700, lineHeight: 1.1 }}>{meet}</div>
              {sub && <div style={{ fontSize: subSize, color: MUTED }}>{sub}</div>}
            </div>
          </div>

          {/* footer */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: `${s.rule}px solid ${INK}`, height: Math.round(70 * s.u), padding: `0 ${s.pad * 0.75}px` }}>
            <div style={{ fontSize: label, letterSpacing: 2, color: MUTED, textTransform: 'uppercase', flexShrink: 0 }}>Full results</div>
            <div style={{ fontSize: urlSize, fontWeight: 700, ...nowrap }}>{url}</div>
          </div>
        </div>
      </div>
    ),
    { width, height, fonts }
  );
}

function PLACE_ORD(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return 'th';
  switch (n % 10) { case 1: return 'st'; case 2: return 'nd'; case 3: return 'rd'; default: return 'th'; }
}
