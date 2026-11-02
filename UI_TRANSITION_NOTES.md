# UI transition notes (Title Block + Field Card hybrid)

Plan: `briefs/ui_transition_plan_2026-11-02.md`. Mockups: `~/.aki/tmp/zt/hybrid/` (Kurt's copy `Downloads/zerotacky_hybrid_mockups/`).
Rule: every screen is mocked and approved before its code; one branch per phase; ask before main.

## Phase 1 Foundation (built 11/2, local)
- Fonts self-hosted: `public/fonts/` (Red Hat Mono 400/700, Saira Stencil One; 40 KB total). `@font-face` in `app/globals.css`
  with `font-display: swap` and size-adjusted local fallbacks. Families: `ZT Numerals` (Saira, unicode-range digits . : /),
  `Red Hat Mono`, `Saira Stencil One` (wordmark/display only). Tailwind: `font-sheet`, `font-wordmark`.
- Tokens (globals.css, `:root` = bright home, `[data-zt-mode='dark']` = venue toggle): `--ground --sheet --ink --muted --rule
  --pen --pen-label --red --red-label --accent --accent-label`. Tailwind colours: `ground sheet ink ink-muted rule pen pen-label
  redpen redpen-label slot slot-label`. `.zt-block` = ruled block (2 px edge, 1 px cell gaps).
- `lib/theme/color.ts`: sRGB/linear/XYZ, OKLab/OKLCH + gamut clip, CIECAM02 -> CAM02-UCS deltaE (D65, La 64, Yb 20, average
  surround), Machado 2009 deutan/protan simulation, WCAG contrast/labelFor. Sanity: #e30614 vs #c8102e = 9.4 (study said 8.7
  under its conditions), rose #e11d48 vs #c8102e = 7.8 (study 7.4), white/black = 100.
- `lib/theme/promoter.ts`: `resolveAccent(hex, mode)` clamps (home L .30-.50 C<=.20; dark L .65-.80) and refuses when the
  smallest deltaE to the red pen across normal/deutan/protan is < 20 (slots fall back to ink, `clamped` still returned so the
  meet name can carry the colour as text, `reason` is the plain-English message). `resolveGround` clamps the ground.
  A green like #15803d passes normal vision (67) and is refused for deutan (8.9): the check earns its keep.
- Components `components/sheet/`: `Sheet` (ground, frame, zone strips 1-8 / A-F, tv|pad sizes), `RuledBlock` + `Cell`
  (cap/pen/end/accent), `TitleBlock` (fields, logo cell, `REV_LETTERS` = ABCDEFGHJKLMNPRTUVWY, `nextRev`, `revFromCount`),
  `StoneMark` (outline, currentColor, no fill), `NoLiftKey` (light key, 3 px red border, X glyph) + `GoodLiftKey` (ink fill).
- `components/brand/Wordmark.tsx` rewritten: ZER + StoneMark(0.76em, stroke 18) + TACKY in `font-wordmark`, one colour.
  The filled red stone of 10/21 is gone. `public/stone.svg`, icons and `wordmark-*.svg` still carry the old mark (Phase 6).
- Rose and emerald retired in one place (bridge until Phases 4-6 reskin each surface): `--color-emerald-{200,300,400,500,950}`
  overridden to neutrals in `@theme`, daylight overrides now ink; steel theme primary #e11d48 -> #60a5fa (on-primary #0a0b0e),
  `lib/constants.ts` swatch to match. Reason: the judge pad showed rose primary badges beside red-600 state badges, the
  study's rose-vs-red defect.
- Tests: `test/paint.test.mjs` (11: maths anchors, study defects reproduce, deutan refusal, clamps), `test/sheet.test.mjs`
  (4: REV letters, stone outline, wordmark a11y, keys). `test/theme.test.mjs` (pre-existing, promoter theme) updated for the
  steel primary. 485 pass, tsc clean. Lesson: `test/theme.test.mjs` already existed and I overwrote it before restoring it
  from GitHub; check for a name clash before `cat >`.
- Type switched site-wide (Kurt 11/2, second push): `--font-sans`/`--font-mono` = Red Hat Mono; `font-medium`..`font-black`
  collapse to 400/700 via `--font-weight-*` in `@theme`; `font-synthesis: none`. Mono is wider, so some old layouts truncate
  (scorer header, run-order cards): those surfaces are reskinned in Phases 4-6, not patched.
- Visual check on :3079 (home, shows, demo board, scorer): wordmark renders in stencil, badges neutral, nothing broken.

## Reorder (Kurt 11/2 pm)
- Website shell moves to Phase 3 (pad 4, scorer 5, promoter 6): the new type looked misplaced inside the old chrome.
- Nothing to main until TV (2) and website shell (3) are both done.

## Next
- Phase 2 TV: mock the idle screen and the Sheet B overflow rule first (plan section 4), then build on branch.
- Migration 036: meet-level `tv_sheet` + `venue_mode` (live_state is per station, fixed columns).

## Phase 2: TV (11/2 pm, branch v2)

Mockups approved by Kurt 11/2 (`~/Downloads/zerotacky_hybrid_mockups/`: sheet_a, sheet_b, tv_idle, tv_overflow). Built:

- `supabase/036_tv_control.sql`: table `tv_control(meet_id pk, sheet a|b, mode home|dark, updated_at, updated_by)`, public
  read, write = member or PIN grant (same as live_state), zt_lww trigger, realtime publication. Applied to staging 11/2;
  prod pending Kurt's go. The TV honours it over the link's `?sheet=` / `?mode=`; a server without the table (main) answers
  404 and the TV falls back to the link.
- `lib/sync/meetApi.ts`: `TvControlRow`, `getTvControl`, `setTvControl` (for the Phase 5 scorer), `getGymName` (CLIENT cell);
  `MEET_COLS` + `venue, federation, host_gym_id` (all in the 030 public grant); RemoteMeet carries `venue`, `federation`,
  `hostGymId`. `test/fake_supabase.mjs` PUBLIC_MEET_COLS now mirrors the 030 grant.
- `lib/tv/model.ts`: pure view models. `pickStation`, `buildSheetA` (live event + athlete, the mark = recorded result in pen
  else the division target in ink, rising-bar ladder or per-division spec, running order via generateEventRunOrder with
  Live / Locked / Scored / On deck, on deck = next two unscored after the live athlete, `partsWindow` 10-14 rows around the
  live athlete), `buildSheetB` / `buildCardPages` (12 a page, live division first, event wins ringed, blank cells until
  scored, place blank until the athlete has a result), `buildIdle`, `revFor` (locked scores -> REV letter), `formatSheetDate`
  ("Sat 14 Nov 2026"), `eventSpec`, `venueLine`. Tests `test/tv.test.mjs` (14).
- `components/tv/`: `TvFrame` (1920x1080 canvas scaled to the screen, zones 1-8 / A-F, --accent vars), `SheetA`, `SheetB`
  (band with page dots + "next page in N s", rotation 8 s), `TvIdle` (wordmark, meet, event schedule, local clock),
  `TvBoard` (sheet choice: tv_control > URL > A; A needs a live station, else B when scores exist, else idle; completed
  meets stay on B; resolveAccent / resolveGround on the show's theme, refused accent -> slots ink, meet name in the colour).
- `app/m/[slug]/ScoreboardClient.tsx`: `layout=tv` renders TvBoard (polls tv_control with live_state; a faint "Phone view"
  key bottom-left to leave); the phone layout is untouched until Phase 5. Demo fixtures now pass competitionStatus,
  resultsStatus, venue and promoterName to the board.
- Not in the data model, so not drawn: a live clock, per-stone / per-implement progress during an attempt. The hero's
  big cell shows the recorded result or the target instead; the ladder shows rising-bar attempts when the event has them.
- Checks: 499 tests pass, tsc clean. Renders in `~/Downloads/zerotacky_phase2_tv/` (Sheet A home + dark with promoter
  colour, Sheet B live / final / dark, idle). Website hero copy reworded in `app/website/page.tsx` (Kurt 11/2).

## Phase 3: website shell (11/2 pm, local, branch v2 pending Kurt's go)

Mockups approved by Kurt 11/2 (`hybrid/web_home.html`, `web_show.html`, `web.css`). Built:

- `components/website/WebsiteShell.tsx`: one page frame (2 px rule) on the grey ground; header = ruled strip (wordmark
  cell 260 px, nav as ruled cells with the active one filled in ink, Mode / Join a Meet / Account cells); footer = title
  block (stone logo cell, TITLE with the tagline, SHEET per page via the new `sheet` prop, REV from package.json + the
  Vercel commit sha when present, STATUS Public, the ten footer links, OPERATOR privacy@zerotacky.com, UNITS, COPY).
  Phones: wordmark row keeps mode / Join / Account, the nav is one scrolling row under it (LT-07 scroll + fade kept).
- `components/website/SheetMode.tsx`: the website's own bright / dark preference (`zt.sheetMode`, default home, `?mode=`
  pins a visit). Set as `data-zt-mode` on the frame. Separate from the scorer's theme id on purpose: the public site has two
  modes and no colour schemes now; the scorer keeps its themes until Phase 5. The header "Color scheme" popover is gone from
  the website (still used by Join / board; the scorer's own picker is in Meet Setup).
- `WebsiteThemeFrame` `sheet` prop: paints `bg-ground text-ink`, keeps `data-zt-theme` for legacy classes inside, and
  reduces a gym's / show's `brand` to the promoter slots only (`--accent` via `resolveAccent`), never the page.
- globals.css Phase 3 bridge, `[data-zt-sheet]`: the zt-* tokens resolve to the sheet tokens (surface = sheet, border =
  rule, primary = pen, secondary = ink), radii and shadows zeroed, amber and emerald remapped (emerald text = pen, solid
  emerald button = ink key). So /shows filters, /gyms, /athletes, /account, /how-it-works and the gym / athlete pages
  draw in the grammar without touching their components yet. `.zt-block > .contents > *` so `role=row` wrappers work.
- `components/website/sheet.tsx`: `Cap`, `Key` / `KeyButton` / `keyClass` (ink, line, pen), `WebCell`, `SectionCap`,
  `textLink`, `NAV_LINK` / `navClass`. `components/website/ShowRows.tsx`: shows as a results table (Date in pen numerals |
  Show / venue | Status | Source | Open), `detail` mode for /shows with the note, divisions, implements, format as text.
  `lib/website/sheetFormat.ts`: `splitIsoDate`, `longIsoDate`, `shortIsoDate`, `venueLine` (collapses repeated
  "Not provided"), `showRowStatus`, `showRowLink`, `splitFee` (7 tests in `test/sheet_format.test.mjs`).
- `app/website/page.tsx`: hero block with the gym-owners aside (count in pen at 56 px), three-up block, shows as
  `ShowRows`, two-up. Copy unchanged (reworded hero from earlier today). `ShowsBrowser`: the card list became `ShowRows
  detail`; the filter block is bridge-styled. Row link labels are Show details / Results / Live board (were View Show
  Details / View Results & Breakdown / Live Scoreboard).
- `ShowDetailClient.tsx`: promoter band (name · long date · venue; Competition / Results / Demo), facts strip (Date,
  Venue, Federation / Format, Athletes with cap, Registration, Live board), note, live callout, podiums as ruled cells
  with places in pen numerals, standings and the events x divisions matrix as ruled tables (events stay rows, Kurt
  10/17 / 10/27), venue / schedule / rules text left, registration block right (fee amount at 44 px via `splitFee`,
  keys: register / follow / live board; Promoter cell). `FollowShowButton` and `PromoterNavLink` draw as keys / nav cells.
- Icons (`~/.aki/tmp/zt/make_icons.py`): outline stone favicons (ink for light UIs, light ink for dark), sheet-white
  192 / 512 (maskable) / apple icons, `icon.svg` follows prefers-color-scheme, `stone.svg`, `wordmark-*.svg` (unreferenced,
  kept consistent). manifest theme #111111 on #ffffff.
- Checks: 506 tests pass, tsc clean, no hydration warnings in the headless console. Renders in
  `~/Downloads/zerotacky_phase3_web/`: home, show upcoming (Iron Harbor accent band), show completed, shows, gyms,
  athletes, account, how-it-works, home + show + shows dark, home + show at 390 (via an iframe wrapper: headless Edge
  will not go under 500), icon sheet.
- Left for Phase 6: `og.png` share card, Supabase email templates (`emails/*.html`) and `lib/email/*.ts` still carry
  the rose; the first-show guide screenshots; `ThemePicker` copy mentions #e11d48 as an example hex.
- Known: a saved dark mode paints after mount (first frame bright), same as the old theme preference did.
