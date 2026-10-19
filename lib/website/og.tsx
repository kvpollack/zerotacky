// Shared bits for link previews (Kurt 10/19): the absolute site URL for metadata and the card renderer used by
// the opengraph-image routes. Facebook groups are where meets get promoted, so a pasted link should show the
// meet name, date and venue instead of a blank card.
import { ImageResponse } from 'next/og';

export { siteUrl } from './siteUrl';

export const OG_SIZE = { width: 1200, height: 630 };

export interface OgCard {
  kicker: string;   // small caps line, e.g. "Strongman show · Lancaster, PA"
  title: string;    // meet name
  lines: string[];  // up to 3 supporting lines (date, venue, status)
  badge?: string;   // e.g. "DEMO" or "LIVE"
}

export function renderOgCard(card: OgCard): ImageResponse {
  const title = card.title.length > 70 ? `${card.title.slice(0, 67)}...` : card.title;
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          padding: 64, background: 'linear-gradient(135deg, #0b0d10 0%, #161a21 100%)', color: '#f4f4f5',
          fontFamily: 'system-ui, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 22, height: 22, borderRadius: 999, background: '#e11d48' }} />
            <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: 4 }}>ZEROTACKY</div>
          </div>
          {card.badge && (
            <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: 3, padding: '8px 20px', borderRadius: 12, background: '#e11d48', color: '#fff' }}>
              {card.badge}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: 3, color: '#fb7185', textTransform: 'uppercase' }}>{card.kicker}</div>
          <div style={{ fontSize: title.length > 40 ? 58 : 72, fontWeight: 900, lineHeight: 1.05 }}>{title}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {card.lines.slice(0, 3).map((l, i) => (
              <div key={i} style={{ fontSize: 32, fontWeight: 600, color: '#d4d4d8' }}>{l}</div>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 24, fontWeight: 600, color: '#a1a1aa' }}>Find shows, enter, and follow the live scoreboard at zerotacky.com</div>
      </div>
    ),
    { ...OG_SIZE }
  );
}

export function registrationLine(status: string): string {
  switch (status) {
    case 'open': return 'Registration open';
    case 'waitlist': return 'Waitlist open';
    case 'closed': return 'Registration closed';
    case 'day_of_only': return 'Day-of registration only';
    default: return '';
  }
}
