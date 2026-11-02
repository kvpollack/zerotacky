# ZeroTacky UI transition plan

Kurt Pollack, drafted by Slate, 2 Nov 2026. Direction: Title Block (D07) chrome with Field Card (D03) standings and a three-colour ink system. Mockups: `~/Downloads/zerotacky_hybrid_mockups/index.html` (kit `~/.aki/tmp/zt/hybrid/`).

## 1. Decisions locked (Kurt, 2 Nov)

| # | Decision |
|---|---|
| Theme | Every screen is an engineering sheet: frame on a grey ground, zone numbers 1-8 and letters A-F, title block bottom right, Saira Stencil One numerals, Red Hat Mono for every word. |
| Home | **Bright.** White sheet on light grey everywhere by default. Dark (black sheet, dark grey ground) is a venue toggle the scorer flips for a dark hall. |
| Type | Saira Stencil One for numerals and the wordmark; Red Hat Mono for text. No third family. Literata dropped. |
| Colour | Printed form in ink. **Pen blue** for every filled-in value (results, points, totals, clock). **Red pen** for NO LIFT and corrections only. **Promoter accent** in three clamped slots on public screens: the CLIENT cell, the card's header band, the live-athlete row. Default for all three is ink until a promoter paints them. No greens, no ambers, no tinted badges. |
| TV | Two sheets. **A, the drawing**: live athlete, clock, attempt count, on deck, upcoming, and the running order of the current event. **B, the card**: full standings, every attempt in its own cell, best marks ringed. Scorer picks which is up; auto-rotate exists but is off by default. |
| Pad | D07 pad. Never takes promoter colour. NO LIFT is a light key (sheet ground, 3 px red border, red label, X glyph) so it survives sun. |
| Logo | Set Stone redrawn as an outline (circle on a flat base), one colour, no fill, no red. It is the 0 in ZER0TACKY, the title block's logo cell, the ring round a best mark, the pending-attempt marker and the loader. No bespoke logo typeface. Fixed after launch. |
| Scorer | **Full reskin**, not tokens only (Kurt 2 Nov). |
| Website | Copy stays. Layout moves to the sheet grammar, last. |
| Motion | Swap-cut on score lock (row redraws in place, REV letter advances, no tween). Ring-draw 400 ms when a mark becomes a best. Nothing else moves. |

## 2. How the work runs

1. Nothing you have not seen gets built. Every screen gets a mockup first (section 4) and you approve or redline it.
2. One branch per phase, Vercel preview URL for you to try on a real TV or phone.
3. I ask before every push to main and before any prod SQL, same as today. Staging is mine.
4. Each phase ends with `bun test`, `tsc`, a contrast check in both modes, and a dry run on staging before I ask to merge.

## 3. Phases

| Phase | What | Where in the repo | Size | Mockup gate | Exit test |
|---|---|---|---|---|---|
| 1 Foundation | Self-host the three fonts with size-adjusted fallbacks; Tailwind 4 `@theme` tokens (`--ground --sheet --ink --muted --pen --red --accent --accent-label`); kill rose and emerald; shared parts: `Sheet` (frame + zone strips), `TitleBlock`, `RuledBlock`, `StoneMark`, `NoLiftKey`; the promoter clamp and refusal functions (OKLCH clamp, CAM02-UCS deltaE >= 20 from the red pen, normal and deutan) with unit tests. Nothing visible changes except state colours. | `app/globals.css`, `components/brand`, `components/ui`, `lib/theme/` (new) | M | None (the mockups you have are the spec) | tests + tsc; website still renders |
| 2 TV | Sheet A and Sheet B at `/m/[slug]`; scorer control for which sheet is up; dark toggle; promoter slots wired to the meet's colour; idle/splash screen with the wordmark. Built on a preview route first, flipped on your word. | `app/m/[slug]/ScoreboardClient.tsx`, `components/standings` | L | Idle screen; sheet with 20+ athletes and 6+ events (overflow rule); between-athletes state | You watch a staged meet on a TV in both modes |
| 3 Judge pad | Port the pad. Light-key NO LIFT, pen-blue values, REV letter on lock. Two-phone sync unchanged. | `components/judge` | M | Lock state, offline/sync-dot state, between-athletes | Two-phone staging run |
| 4 Scorer, full reskin | Break `strongman-app.jsx` into TypeScript components under `components/scorer/`, screen by screen, each kept green against the existing controller and sync tests. Screens: meet setup, events and implements, roster and lots, live control (clock, station, TV sheet switch, venue toggle), results and export. | `app/scorer`, `components/strongman-app.jsx` -> `components/scorer/*` | XL | Every one of the five screens, before its code | 470+ tests; a scripted meet-day dry run on staging, audited the way Astra did the 10/19 release |
| 5 Promoter and registration | Sheet grammar on the promoter console and `/register`; the paint picker with live preview of the three slots, the clamp, and a plain-English refusal ("that red is too close to the no-lift pen; pick another or we set your name in it instead"). | `components/promoter`, `components/register` | M | Paint picker; show listing editor | Staging pass with a hostile colour |
| 6 Website | Public pages (home, shows, show detail, athletes, gyms, how-it-works) to the sheet grammar; wordmark in the header; stone favicon and app icon. Copy untouched. | `components/website`, `public/` | M | Home and show detail | Lighthouse a11y, both modes |

Sizes are relative effort, my judgment, not dates: S under a session, M one or two, L three or four, XL more.

## 4. Mockup queue (in order)

1. Sheet A and B, pad, wordmark: **delivered 2 Nov, awaiting your redlines.**
2. TV idle/splash screen and the overflow rule (what Sheet B does with 24 athletes and 7 events).
3. Pad states: locked, waiting for the next athlete, sync lost.
4. Scorer: five screens.
5. Promoter paint picker.
6. Website home and show detail.

## 5. To check before Phase 2 (mine)

- Where "which TV sheet is up" lives. `live_state` is per station with fixed columns (event, division, athlete, lane 2), so the sheet choice and the venue toggle need a meet-level home. Checked 2 Nov: that is a migration (036), which means prod SQL and an ask before Phase 2 ships.
- Where the promoter colour lives. Checked 2 Nov: it already exists. Migration 030 added `theme` (primary, background, secondary) to the show, with `lib/website/theme.ts` and a picker in the promoter console. Phase 2 reads `theme.primary` through `resolveAccent` from day one; Phase 5 swaps the picker's warnings for the clamp and the refusal.
- Overflow rules on Sheet B: the D07 brief hides the zone strip and shrinks the title block on a small TV; the card needs a row cap and a page indicator for big fields.
- Font budget after self-hosting. The three files total 40 KB (checked 2 Nov); the study's cap is 200 KB.

## 6. Still parked

- Demo slug fix (`riverside-iron-fest-2026` + redirects): pushed to main `4f88afed` 2 Nov, Vercel success, `/m/strongfest-2026` returns 308 on prod.
- Product rename: parked. The stone outline survives a rename; the letters do not.
