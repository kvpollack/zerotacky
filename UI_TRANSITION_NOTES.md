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

## Phase 4: judge pad (11/2 evening, branch v2)

Mockup gate: `pad.html` (approved 2 Nov) + `pad_states.html` (locked / between athletes / sync lost, approved 2 Nov pm).

- `components/judge/JudgePad.tsx` replaces `JudgePad.jsx`, `MasterClock.jsx` and `StopStampButton.jsx`. Same
  controller and props, plus `mode` (the scorer's daylight toggle maps to the sheet's home/dark), `sync`, `stationFlight`
  and `eventCount`. The pad is a framed sheet inside the scorer's `<main>`; the zone strips and the ground belong to the
  Phase 5 shell. It never takes the promoter's colour.
- `components/judge/padModel.ts` (pure, `test/pad.test.mjs`, 15 tests): the attempt log, clock words, key labels, the
  SYNC cell, press/undo patches. `Result.attemptLog` is new and optional: one entry per GOOD / NO LIFT press (weight for
  rising bar). It rides in the results `payload` JSON, so no mapping or migration. The engine never reads it; the scored
  fields (`reps`, `implementsCompleted`, `splitTimeSeconds`, `risingBarAttempts`) are recomputed from the log on every
  press, so an old phone without the log and a new one agree. Results written by the old pad (no log) undo by stepping
  the count down.
- `components/judge/PadClock.tsx`: the one per-frame component. mm:ss.d, pen once time is on the clock, red pen past
  the cap, Reset under the cap word when stopped.
- The two judge keys replace the per-type buttons: stones = good completes the stone and stamps its split (the last
  stone also stops the clock and stamps the course time), no-lift = a miss on the same stone; reps = good rep / no rep
  (no reps tallied in the count cap, not scored); rising bar = the keys score the marked weight (lowest pending, or the
  row the judge tapped), PASS is a line key, exact override stays an input; time/distance = FINISH stamps the clock (and
  stops it while running), DNF clears the time so the distance decides. Lane 2 keeps its inputs plus "finish at clock"
  and DNF keys.
- Run order is a ruled table that shows itself while nothing is on the sheet for the athlete and the clock is idle; a
  RUN ORDER / HIDE RUN ORDER key pins it either way. Rows: Locked (pen) / Now / Lane 2 / Scored / Up next.
- SYNC cell (header, right of the meet name): filled square = live, hollow = not; "Live", "Syncing n", "Offline n",
  "Error", "Not linked", "Local". Tap = sync now. Offline/error adds a ruled notice (Keep scoring. Scores send when the
  Wi-Fi comes back / Re-join) under the count, and the count numeral is 88 px rather than the mockup's 120 so the
  notice has room without pushing the keys.
- Not-live keys: `.zt-key-off` (globals.css): outline, muted label, faint hatch. `.zt-input`: ruled cell, value in pen.
- `RuledBlock` now passes through div attributes (id, role, aria-*) for the pad's tables and status menu.
- Status (DNS / scratch) is a line key in the athlete cell; the two-tap confirm arms the key in red pen.
- Checked: bun test 521, tsc clean; dev server at 390 px (CDP driver `~/.aki/tmp/zt/cdp_shot.py`): between, live,
  post-lock, rising bar, stones with a miss and an undo, head-to-head lane 2, DNS. Exit test (plan): a two-phone
  staging run.
- Known / later: the stone table has no WEIGHT column (events do not carry per-stone weights); the Next 16.4.0 security
  advisory shows in the dev overlay (not a pad issue; `next upgrade --agent=security`).

## Phase 5: scorer, full reskin (11/2 evening, branch v2)

Mockup gate: `scorer_setup/events/roster/live/results.html` (approved 2 Nov, "good to go, looks great").

- `strongman-app.jsx` keeps every hook, handler and the controller; the chrome and the screens move to TypeScript under
  `components/scorer/`. Nothing in `lib/` changed except the 036 `tv_control` write/read (below).
- `ScorerShell.tsx`: `ScorerFrame` (grey ground, zone strips 1-8 / A-F, the 2 px frame, `data-zt-sheet data-zt-mode`),
  `ScorerHeader` (meet name, Demo, role lock + Unlock with the PIN row, bright/dark toggle, SYNC cell; station chips and
  Division / Event selects on the floor tabs), `ScorerNav` (title block Title / Sheet / Rev / Division, then the sticky
  bottom strip of glyph + label keys filtered by role). `scorerModel.ts` (pure, `test/scorer.test.mjs`, 12 tests): nav
  tabs per role, the SHEET cell per tab ("Setup n of 6"), station chips, division option text, TV control words.
- `parts.tsx`: the scorer's form grammar. `Key` (line / pen / ink / red / off), `Field` (muted cap over a pen value),
  `KeyGroup` (radiogroup strip, chosen key filled ink), `LH`/`LR` list cells, `Toast`, `Sec`, `Note`, inputs.
- Judge Pad tab: `JudgePad chrome={false}`; the shell supplies the meet row, station row, frame and title block.
- Pit Crew tab: `LiveControl` on top (now lifting, read-only clock mirror, up next, scored count, Volunteer Phone Role
  Lock, TV Board: Sheet A/B and Venue Bright/Dark drive 036 `tv_control` through `sync.setTv`; read back with
  `sync.readTv`; keys go off when the phone is not linked), `CloudSync compact` (publish key) for admins, then
  `PitCrewSheet` (port of PitCrew.jsx, same props and copy; plate stack as ink chips).
- Standings tab: `StandingsSheet` (Sheet B card at phone width, TV layout toggle, Event n Breakdown ruled list, scratched
  rows in red pen) with `BackupExport` (Results CSV, Backup JSON, Copy Standings, Restore, Auto-snapshots) for admins.
- Meet Setup tab: `MeetSetupSheet` behind a six-cell index strip (the open section spells its name, the others show the
  number; drives the title block's SHEET cell). One section at a time: 1 Meet Details & Rules (+ demo/real key, Cloud
  Sync, Promoter Theme select, reset keys), 2 Divisions, 3 Events (EventForm.jsx reused as-is inside a ruled block),
  4 Stations & Floor Plan (per-station event order), 5 Athletes (pointer and keyboard lot drag carried over; the row is
  handle / Lot / Athlete / ⇄ move / SCR / ✕, the division move opens a one-line row under the athlete), 6 Meets, Demo
  Presets & Readiness Check. Handlers and strings copied from `components/setup/builder/*`, which stay for the promoter
  editor. Advanced Settings is gone: role lock lives in Live Control, backup under Standings, sync and reset on Meet Details.
- Removed: `shell/Header.jsx`, `shell/BottomNav.jsx`, `shell/SyncDot.jsx`, `pitcrew/PitCrew.jsx`, `setup/MeetSetup.jsx`,
  `setup/SyncPanel.jsx`, `setup/BackupPanel.jsx`, `setup/ResultsCsvCard.jsx`. Kept (the board still uses them):
  `standings/Standings.jsx`, `standings/LeaderboardTable.jsx`, `shell/LayoutToggle.jsx`.
- Sync: `controller.ts` `setTvControl` / `readTvControl` (`tv_control` upsert on `meet_id`, in `FLUSH_ORDER`),
  `useMeetSync` exposes `setTv` / `readTv`. `PadClock.onReset` optional (Live Control mirrors the clock without it).
- Checked: bun test 533, tsc clean; dev server at 390 px, bright and dark: judge, pit crew (live control + load card),
  standings + export, all six setup sections, an open EventForm, athlete delete confirm and move row, preset confirm,
  readiness pass. Exit test (plan): scripted meet-day dry run on staging.
- Known / later: EventForm.jsx keeps its old rounded styling inside the sheet (legible through the `[data-zt-sheet]`
  bridge; port when the promoter editor moves in Phase 6). Promoter Theme is a plain select here; the paint picker with
  the clamp is Phase 6. Long division names clip in the Divisions list input at 390 px (the field scrolls).

## Phase 6: promoter and registration (11/2 evening, main + v2)

No mockup gate: Kurt waived it ("move straight into code for phase 6") after Phase 5 landed.

- Scope call: the promoter console (`/promoter`, `/promoter/[id]`) and `/register/[slug]` already sit inside the Phase 3
  website shell, and the `[data-zt-sheet]` bridge resolves their old `zt-*` tokens, corners and shadows onto the sheet.
  Screens checked at 390 px before touching anything: the layout was already in the grammar; what remained was the
  tinted badges and tinted selected cards the design forbids, and the paint picker.
- `components/website/PaintPicker.tsx` replaces `ThemePicker.tsx` (same props and `value` contract, so the save path in
  `ListingSection` and `MyGymClient` is untouched; `secondary` is carried through unseen). Preset strip as a key row,
  two ruled fields (Your colour / Ground), and a live preview per mode: a mini sheet with the three slots (CLIENT cell,
  card header band, live row) painted through `resolveAccent`, the ground through `resolveGround`. The caption under
  each preview is `describePaint` (new in `lib/theme/promoter.ts`, 4 tests in `test/paint.test.mjs`): the plain-English
  refusal in red pen with the slots fallen back to ink, or "we set it to #xxxxxx so the label on it stays readable" when
  the clamp moved it, or "Your colour as typed". No numbers, no amber warnings; `themeWarnings` stays in the lib for the
  website tests but nothing renders it.
- Bridge (globals.css): pen tints (`bg-zt-primary/10|15|20`, the sky badge) go transparent with a pen rule; danger tints
  go transparent with a red-pen rule and red-pen text. This clears the REGISTERED / UPCOMING / LISTED badges, the
  selected division card on `/register`, the account toggles and the warning boxes in one place.
- Done 11/3 (see "Meet-editor swap" below). Was: the meet editor still rendered `components/setup/builder/*` (the old sections) through the bridge.
  They read correctly; the scorer's `MeetSetupSheet` sections are the natural replacement when the editor is next
  touched. Removed: `components/website/ThemePicker.tsx`.
- Checked: bun test 537, tsc clean; dev server at 390 px: promoter dashboard, meet editor (Meet, Listing with the picker
  off / on / toned / refused), `/register` step 1. Exit test (plan): a staging pass with a hostile colour, done in the
  browser with `#c8102e` (refused in both modes, protan in daylight, deutan on the dark board).

## Dry run 2 (11/3, staging, all six phases)
Scripted meet day on `all-out-strongfest-2026-dryrun2` (admin phone, two judge phones, spectator, TV; Python Playwright over CDP, `audits/dry-run-2026-11-03/`). Report `audits/slate-2026-11-03-dry-run-prerun.md`, Astra brief `audits/astra-brief-2026-11-03-dry-run.md`. Two fixes:
- **DR2-01** station chip: `strongman-app.jsx` `pickStation` (passed to `ScorerHeader` as `onPickStation`) lands on the station's first event, in its own order, that still has unlocked athletes in the station's first division; the header's old handler stays as the fallback when the prop is absent.
- **DR2-02** TV Sheet A target cell: marks past 16 characters drop to 56 px and wrap to two centred lines instead of running off both edges.
Sync, offline queue, roles, wrong PIN, spectator read-only and standings all held under the new skin.

## Astra dry run (11/3) fixes, DR3-01 to DR3-12
Report `audits/astra-2026-11-03-dry-run.md`, disposition `audits/astra-2026-11-03-dry-run-disposition.md`. All twelve fixed: run-order lot 1 on division change (DR3-01), selection saved per meet in `lib/scorerSelection.ts` and restored on reload (DR3-02), legacy counts seed the attempt tape (DR3-03), pad BEST = engine `effectiveMaxWeight` (DR3-04), rising-bar undo replays the tape (DR3-05), headline swap row with numeric stats (DR3-06), wrapping pit crew cells + `keepUnits` (DR3-07), `status.denied` + pad copy for a revoked code/PIN (DR3-08), no live decoration on a final Sheet B (DR3-09), toggle labels name the target mode (DR3-10), `Field group` for radio groups (DR3-11), `stationLanding` across all divisions on the station (DR3-12). 552 tests.

## Kurt's 11/3 review: root splash and header rows
- **Root splash `/`** (`components/shell/RootLanding.tsx`) was never in the phase plan and still wore the old zt-* skin. Redrawn in the sheet grammar: one max-w-md sheet on the ground with a wordmark / Mode header strip, then a ruled block: title cell ("Strongman, scored.", subline; the ZEROTACKY cap went, the wordmark in the strip says it), Resume key (pen fill, shown only when the phone carries a meet), Enter ZeroTacky (ink key), Join a meet (line key). Other copy unchanged; the old Color Scheme popover is gone here as on the website (the sheet has bright / dark only).
- **Header rows** (`WebsiteShell.tsx`): from lg up the wordmark and the nav share row one and Mode / Join a Meet / Account sit right-aligned on their own ruled row beneath, so a signed-in promoter's My Meets cell no longer gets cut off by the action cells at ~1870 px. Phones unchanged (wordmark row keeps mode / Join / Account, nav scrolls under it).
- Checked: tsc clean, bun test 552, dev-server shots at 1870 and 390 px, bright and dark, with and without the Resume card (`~/Downloads/zt_ui_1103/`).

## Next 16.4.4 security patch (11/3, Kurt released the hold)
- `bun add next@16.4.4` (16.4.0 -> 16.4.4, the advisory the dev overlay showed); one stale nested `next@16.4.0` under
  `@vercel/analytics` dropped from `bun.lock` so a single copy ships. tsc clean, bun test 552, dev server (webpack) serves
  `/`, `/website`, `/shows`, `/gyms`, `/scorer`, `/join`, `/m/strongfest-2026`, `/website/account` with zero page errors.
- A local `next build` cannot be the gate on this laptop: `node` here is Bun 1.3.13 and the page-data workers fail inside
  Bun's CommonJS wrapper ("this is a bug in Bun"), independent of the Next version. Vercel builds under Node, so the
  deploy status is the build gate; a failed build leaves the previous deploy serving.

## Feature 1: federation results pack + retention guard (11/3, Kurt released the hold; feature report #1, Astra FG-02)
- `supabase/037_results_retention.sql` (staging + prod 11/3): `meets.results_submitted_at`; `zt_mark_results_submitted`
  (owner, completed + final, stamps once); `zt_delete_meet` refuses a stamped meet whatever its status; `zt_get_my_meet`
  carries the column. Public select on the column granted; `/shows` still lists `is_public_listed` only.
- `lib/exportFederation.ts`: `federationResultsCsv` (title block: meet, date, venue, federation, promoter contact, scored
  on, results link; then Division, Place, Athlete, Bodyweight, Status, per-event score + pts, Total, Event Wins; T- for
  ties, Scratched for withdrawn), `federationEmailDraft` (to admin@strongmancorporation.com, subject "<meet> results,
  <date>", body with the link; standings inline while the mailto stays under 1,900 chars, else "in the attached CSV").
- `components/promoter/ResultsPackSection.tsx` on the Meet Day tab of a completed meet: Results CSV / Copy standings /
  Email to SC keys, the To / Subject / Link readout, Mark results as submitted (pen key; needs final results). Once
  stamped: the delete block is gone (MeetDaySection) and the show page resolves while unlisted
  (`getPublicShowBySlug` sends `or=(is_public_listed.eq.true,results_submitted_at.not.is.null)`).
- Checked: tsc clean, bun test 559 (6 new pack tests, fixture markResultsSubmitted + delete refusal, loader retention);
  staging walkthrough on `all-out-strongfest-2026-dryrun2` (unlisted, completed, final): 404 before, pack renders, CSV
  downloads with the title block, mailto 1,023 chars, mark -> stamped, delete block gone, show page 200 while unlisted.
  Fixture stamp cleared afterwards. Not built (M scope): PDF, Strongman Results / OpenStrongman layouts.

## Meet-editor swap (11/3, Kurt released the hold; the Phase 6 leftover)
- `PromoterMeetDetailClient` renders the scorer's sheet sections (`SheetMeetDetails / SheetDivisions / SheetEvents /
  SheetStations / SheetAthletes`, named exports of `components/scorer/MeetSetupSheet.tsx`) on tabs 1-4 and 7, fed by
  one `sheetProps` object over the same working-state reducers the old sections used. New optional props on
  `MeetSetupSheetProps`: `host: 'promoter'` hides the scorer-only tail of Meet Details (demo toggle, cloud sync, theme,
  reset; the Listing tab and dashboard own those) and stops the name field from rewriting the slug (a published meet's
  slug is its URL, QR codes and the federation results link; the slug field itself stays editable), `onEditingChange` /
  `closeFormSignal` keep the editor's Save bar aware of an open EventForm draft, `sectionNumbers` renumbers Athletes to 7.
- Deleted (no importers left): `components/setup/builder/{Divisions,Stations,Events,Athletes,Meets}Section.jsx`.
  `MeetSection.jsx` (RUN_ORDER_OPTIONS / TIEBREAK_OPTIONS), `EventForm.jsx` and `EmptyMeetNotice.jsx` stay in use.
- Checked: tsc clean, bun test 559; staging editor on `all-out-strongfest-2026-dryrun2` at 1280 and 390 px: all five
  tabs render with no page errors; Save bar shows "Event form open" while + Add Event is open and clears when closed;
  a name edit shows "Unsaved meet builder changes" and reverting it clears the bar (the slug no longer follows the name).

## Feature 2: external-listing calendar MVP (11/3, roadmap step 4; the first build past Kurt's "three builds" release)
- `supabase/038_external_shows.sql` (staging 11/3; prod on Kurt's OK): table `external_shows` (name, date, city, state,
  facility_name, federation, divisions_note, registration_url, source promoter|admin, status pending|listed|hidden,
  submitted_by, submitter_note, admin_note, reviewed_at). RLS: anon/authenticated read `status = 'listed'` only, on a
  column grant that leaves submitted_by and the notes out. `zt_submit_external_show(jsonb)`: signed in, http(s) link,
  name, YYYY-MM-DD not in the past, two-letter state, city, no duplicate link; an admin's own submission lists at once,
  everyone else lands `pending`. `zt_admin_external_shows()` (admin only, joins `profiles.username`),
  `zt_review_external_show(id, status, note)` (admin only, stamps reviewed_at).
- `lib/website/externalShows.ts`: `externalRowToSummary` turns a row into a `PublicShowSummary` (`slug ext-<id>`,
  `competitionStatus upcoming`, no implement tags, `externalUrl` + `externalHost`), so the existing filters and ShowRows
  carry it. `listPublicShows` appends `status=eq.listed&date=gte.<today>` after the meets inside a try/catch (an older
  database without the table still lists meets). No show page exists for an external row: name and Open cells are
  `<a target=_blank rel=noopener>` to the registration page, status reads "Upcoming · Registers elsewhere", Source
  "Listed on <host>" (`sheetFormat.showRowStatus / showRowLink`, `ShowRows`).
- Pages: `/shows/submit` (`SubmitExternalShowClient`, sign-in gate, done states pending / listed, "List another");
  `/website/admin/shows` (`AdminExternalShowsClient`, admin gate via `fetchIsAdmin`, pending first then the last 7 days
  and upcoming, List / Hide keys); `/shows` carries a "List it here" line under the intro; the Account admin block
  links the queue next to the gym claims.
- Fixed on the walkthrough: Supabase RPC errors are plain objects, not `Error` instances, so both clients' `errText`
  read `.message` the way the other website clients do (the form had shown "[object Object]").
- Checked: tsc clean, bun test 567 (+8: `test/externalShows.test.mjs` mapping, host, today, sheetFormat branch;
  `shows.data` fake backend grew an `external_shows` table with listed / pending / past rows: only the listed future
  row joins the list, passes the upcoming and PA filters, drops out on an implement filter; the demo-fixture count
  moved 7 -> 8). Staging walkthrough as `slate_staging` (an admin there): signed-out `/shows/submit` shows the gate;
  `/shows` entry link present; admin submit lists at once; a SQL-seeded pending row shows first in the queue and
  List moves it; `/shows` at 1280 and 390 px shows both rows with Listing ↗ links out, no page errors; duplicate link
  and past date refused with the SQL messages. Test rows deleted afterwards. Not built (MVP scope): promoter claim or
  edit of a listing, link health checks, expiry beyond the date filter, notification to the submitter on review.

## Astra builds audit (11/4) fixes, BLD-01 to BLD-12, and the /join reskin
Report: `audits/astra-2026-11-03-builds.md`. Every finding fixed; dispositions:
- **BLD-01 slug after stamping (High):** `supabase/039_builds_audit_fixes.sql` adds a `before update of slug` trigger
  on `meets` that refuses the change once `results_submitted_at` is set, so every write path (zt_save_meet_config,
  zt_publish_meet, raw SQL) is covered. `MeetSetupSheet` takes `slugLocked` (promoter passes the stamp) and renders the
  slug field disabled with a note. Checked on staging: SQL update refused with the message, field disabled in the editor.
  Other published meets keep an editable slug on purpose (a promoter fixing a typo before the show); the QR/board link
  risk for those is the leave-it-alone note on the field, not a lock.
- **BLD-02 form typing (High):** `Field` moved to module level with value/onChange props; sequential typing in the input
  and the textarea keeps focus (checked with keystroke delays at 1280).
- **BLD-03 drafts lost on leave (High, pre-existing):** `lib/promoter/unsavedGuard.ts` + `useUnsavedGuard` in
  `PromoterMeetDetailClient`: `beforeunload` while dirty / listing dirty / EventForm open, and a capture-phase click guard
  that asks before any in-app link leaves the page (Next's Link honours `defaultPrevented`). Browser back is not
  intercepted (no cancellable popstate in the App Router). Checked: Back to My Meets with a dirty name shows the dialog
  and dismiss keeps the editor; reload raises `beforeunload`. 4 unit tests on the pure decision.
- **BLD-04 Excel encoding (Med):** `shareOrDownloadText` prepends a UTF-8 BOM and sets `text/csv;charset=utf-8` for any
  CSV; the pure builders stay BOM-free (tests, Copy standings). Not re-tested in real Excel here; Astra's next pass.
- **BLD-05 formula cells (Med):** `neutralizeFormula` in `lib/export.ts`: string cells starting `= + @ \t \r`, or `-`
  when not a plain number, get a leading apostrophe; numbers pass untouched. Applies to both CSVs. Tests.
- **BLD-06 fallback mailto (Med):** `federationEmailDraft` builds the CSV fallback at four detail levels (drop contact,
  then federation, then venue) until it fits 1,900; `EmailDraft.trimmed` tells the pack UI to say so. Test with a
  120-char multibyte name and maximum metadata.
- **BLD-07 validation (Med):** 039 checks the date text against `^\d{4}-\d{2}-\d{2}$` before the cast (null and
  `11/14/2099` now get the YYYY-MM-DD message), refuses links over 500 chars instead of truncating, and checks the state
  against the 50 states + DC. Hint on the form reads "US two-letter code".
- **BLD-08 sitemap (Med):** external rows skipped in `app/sitemap.ts`.
- **BLD-09 expiry clock (Med):** one policy, documented in `externalShows.ts`: the US show day is the date in
  America/Los_Angeles, so a listing stays through its show day anywhere in the US and comes down the day after (the
  form's promise). `isoToday` uses it; SQL `zt_us_show_day()` (039) uses it for the past-date check and the queue window.
  Tests at the 19:01 ET, 23:59 PT, 00:00 PT and PDT boundaries.
- **BLD-10 duplicate links (Low):** 039 `zt_external_url_key` folds scheme, `www.`, host case and trailing path slashes
  (query and fragment untouched), stored as a generated column with a unique partial index on pending/listed rows; the
  submit RPC checks the key and maps `unique_violation` to the same message. Checked: `http://example.com/Events/zt-fix`
  refused after `https://www.Example.com/Events/zt-fix/` listed.
- **BLD-11 queue RPC (Low):** `zt_admin_external_shows` raises 42501 for non-admins (checked with a non-admin JWT claim).
- **BLD-12 mobile source (Low):** the mobile status line reads "Upcoming · Registers elsewhere · <host>".
- Brief correction for Astra's record: the second stamp is idempotent by design (same timestamp back), not refused.
- **/join (Kurt 11/4, outside the audit):** the page still wore the old rounded skin. `app/join/JoinClient.tsx` render
  redrawn like the root splash (wordmark / Mode strip, ruled block, `.zt-input` code and PIN fields, roles as keys, text
  links for home / account / different code); the lookup, PIN and attach logic is untouched. Checked at 390 and 1280:
  code -> roles -> PIN with no page errors.
- Checked: tsc clean, bun test 577 (+10). 039 on staging; prod on Kurt's OK. Staging rows and the fixture stamp cleared.

## Phone scoreboard + not-found sheets (11/4), and the route sweep

Kurt found two pages the UI transition had missed (/join above, and the phone scoreboard). The question was whether
there were more. Two things closed it: a redraw of the surfaces that render outside the WebsiteShell, and a scripted
screenshot sweep of every route so the answer is a table rather than a guess.

- **Phone scoreboard `/m/<slug>` (`app/m/[slug]/ScoreboardClient.tsx`):** the phone layout now uses the sheet grammar:
  `WebsiteThemeFrame sheet`, wordmark / Mode strip, a `.zt-block` title block (status cap, meet name, updated line,
  "TV layout" as a text link), Up Now as a `RuledBlock` table, the division filter as `keyClass('pen' | 'line')` keys,
  one `<h2>` per division over the scorer's `StandingsSheet`, text-link footer. `WebsiteThemeControls`, `Standings`,
  `LeaderboardTable` and `LayoutToggle` are no longer imported here. The TV layout is untouched (it still auto-selects at
  1280). Data flow and polling unchanged. Checked at 390 (10 tables, 6 division headings on the dry-run fixture) and
  1280, no page errors.
- **Not-found sheets:** new `components/website/NotFoundSheet.tsx` (cap / title / note / text-link keys in a
  `.zt-block`). New root `app/not-found.tsx` (an unknown URL used to get Next's default page, which was the last surface
  outside any shell). `app/shows/[slug]`, `app/gyms/[slug]`, `app/athletes/[username]` and `app/register/[slug]`
  not-found pages rewritten on it with their own copy and links. Checked: unknown root URL returns 404 with the sheet.
- **Route sweep (`~/.aki/tmp/zt/shots/sweep.py`):** 31 routes at 390 and 1280 on staging (62 loads, all 200, the 404
  probe 404, zero page errors) into `~/Downloads/zt_ui_sweep_1104/` with `index.json` and a `README.md` table (route,
  both screenshots, skin note) plus a ranked hand-redraw list. Finding: only `/join`, the phone board and the root 404
  were outside the grammar; every other route renders inside WebsiteShell on the `[data-zt-sheet]` bridge and reads as
  the sheet. The ranked list is by old-class hits, which is where the bridge still does the work: `/register`
  RegisterClient (119), `/promoter` (63) and `/website/account` (59), athlete profile (51) and gym page (40),
  how-it-works (58), then small ones.
- Checked: tsc clean, bun test 577. No migration.

## /register hand redraw (11/4, first from the sweep's ranked list)

`components/register/RegisterClient.tsx` no longer leans on the `[data-zt-sheet]` bridge (0 old-class hits, was 119).
The four-step flow, every id, role, aria wiring, validation and submit path are untouched; only the render changed.

- **Header:** the show page's band (promoter slot, ink by default here: name · long date · venue; competition /
  registration / federation on the right) over a 2 x 2 (sm: 1 x 4) facts strip: entry fee, deadline (long date),
  capacity, promoter + contact (`break-words`, the email used to overflow its cell).
- **Steps:** one `.zt-block` strip of four cells; the active cell is filled ink (inline `var(--ink)` so it beats the
  block's cell fill), finished cells read "Step n · done" in pen, upcoming ones muted.
- **Forms:** each step is a ruled block of label-over-input cells (`Cap` + `.zt-input`); divisions are left-aligned
  keys (chosen = ink, others = line) in a radiogroup; the DOB group is `role=group` labelled by its cap (was a
  fieldset/legend, which fights flex layout); guardian fields appear inside it for minors. Primary action is a pen key
  on the right, back is a text link on the left.
- **Review / confirmation:** `ReviewRow` (cap left, bold value right; pen for the athlete's choice and the waiver line)
  inside `<dl class="contents">` so the block's rules run between rows. Confirmation keeps Status in pen, the ID in mono.
- **Closed / missing / error / waiver-missing states:** one ruled block each with cap, heading, note and an ink key.
- Icons (lucide) dropped; no colour outside ink / pen / muted (the age warnings are bold ink, not amber).
- Checked on staging (Iron Harbor Classic, registration open) at 390 and 1280, bright and dark: signed-out gate, step 1
  (5 radios, 1 checked), minor path (guardian fields appear at DOB 2012), step 2, step 3 (8 review rows), step 4 after a
  real submit (ACCEPTED, auto-accept meet; the row and an older 10/21 test row for the same account were deleted
  afterwards). Closed-registration state checked on the dry-run meet. Zero page errors. Screenshots
  `~/Downloads/zt_ui_1104/register_*.png`. tsc clean, bun test 577. No migration.

## Feature 3: structured event spec starter (11/4, research brief build 3; roadmap "next build")

The brief's line: "implement, in-hand weight, pick height, course, time cap, equipment, video, lb and kg". Weights, time
cap and heights already live on the event (divisionWeights, timeCapSeconds, divisionDefaultHeights), so the starter adds
what was missing and shows kilograms beside every pound figure. No migration: the spec rides in `events.config` like
the other EventDef extras (round-trip test on the mappers).

- **Model (`lib/types.ts`):** `EventDef.spec?: EventSpec` = `implement` (22 kinds, `ImplementKind`), `implementNote`
  (80), `courseFeet`, `allowed` / `notAllowed` (`EquipmentRule`: tacky, straps, belt, sleeves, wraps, chalk, suit),
  `videoUrl` (http(s), 500), `notes` (280). All optional.
- **Helpers (`lib/events/spec.ts`):** `IMPLEMENTS` (each with the gym-directory equipment ids it maps to, checked by
  test against `GYM_EQUIPMENT`, so the later "train for this show" filter has one vocabulary), `EQUIPMENT_RULES`,
  `validateEventSpec` (messages the form shows: Other needs a description, course 1 to 5280 ft, a rule cannot be in
  both columns, video must be http(s)), `normalizeEventSpec` (filled fields only, undefined for an empty form),
  `lbToKg` (whole kg), `kgLabel`, `specSegments`, `specHasContent`.
- **Promoter form (`components/setup/builder/EventForm.jsx`):** new "Event spec (what athletes train for)" block at
  the end: implement select + detail, course distance, video link, equipment rules as an allowed / not-allowed grid (a
  rule is one or the other or unsaid; clicking the same column again clears it), notes. Validated before save.
- **Show page (`ShowDetailClient`):** one line under the event name (implement · course · equipment, `Video` text
  link, `rel="noopener noreferrer"`), kilograms under every weight cell (`eventWeightDisplay().kg`, light tier
  included; not for callouts or heights), notes in the footnote list.
- **Demo:** Riverside Iron Fest fixture events 2 and 3 carry a spec. Staging Iron Harbor "Yoke Carry 50 ft" has one set
  through the real editor (yoke · 50 ft · belt allowed · no straps · video · notes).
- Checked end to end on staging through the promoter editor: Save Event, Save Changes, the show page shows the line,
  26 kg cells and the Video link; `events.config.spec` holds the saved object. Zero page errors. Screenshots
  `~/Downloads/zt_ui_1104/spec_form_1280.png`, `spec_show_1280.png`. tsc clean, bun test 583 (+6; four
  `eventWeightDisplay` exact-shape assertions updated for the kg key).
- Left for later builds on purpose: per-division pick heights as numbers (the free-text heights already print), the
  register page's target-weight line in kg, the "train for this show" filter (build 4) that joins `IMPLEMENTS` to gyms.

## /promoter and /website/account hand redraws (11/4, sweep ranks 1 and 2 after /register)

Render-only rewrites; every id, aria attribute, test id and handler is unchanged, logic blocks were spliced through
untouched. The bridge still resolves what these files used to use, so nothing downstream moved.

- **`components/promoter/PromoterDashboardClient.tsx`:** heading row with the `+ New Meet` pen key (ink + "Close" while
  open, `aria-expanded`); the create form is one `.zt-block` of label-over-input cells (`new-meet-name/-date/-slug`),
  Cancel text link + pen submit; the meets list is one ruled block of `<article aria-label={name}>` rows: cap status
  line (competition · listed · registration · results), name link, long date · /slug · venue, four `font-sheet` counts
  (`Count`, pen when pending > 0), `Reg form` line key + `Open →` ink key. At 390 the counts are a four-column grid and
  the name wraps (`lg:truncate` only). `AthleteMeetsSection.tsx`: three ruled columns (Registered / Following /
  Completed) with the count in the cap cell, text-link names, status as a cap, Results / Unfollow as text links.
  lucide gone from both.
- **`components/website/AccountClient.tsx`:** identity strip (cap "Signed in · roles", name, email; Change password /
  Sign out as line keys, Change password reads Close in ink while open), `PasswordPanel` and the profile editor as
  ruled blocks: photo (square, `border-rule`) + display name; Roles as three checkbox cells (`accent-color: var(--pen)`,
  label in pen when ticked); About you as Favorite lift / More / Location / Home gym + the directory picker cell; PRs as
  a two-column block (results in `font-sheet`); Coaching; Social handles with a cap per field (new ids
  `about-social-<key>`, the `aria-label`s stay). Public profile: username + Change username in one block with the
  visibility checkbox as the full-width last cell; cap shows Listed in pen / Private. Where to next: My Meets and
  Meet-day scorer as ink keys, the rest line keys, `AdminLink` line keys. `Notice` is plain bold ink (`role=status`);
  no icons, no tinted boxes, no emerald badge.
- **`components/auth/SignInForm.tsx`:** method switch as a three-cell `.zt-block` (active cell filled ink, still
  `aria-pressed` buttons), fields as cells, Forgot password as a text link, submit as a pen key. Same ids (`acct-*`,
  `reg-*` through `idPrefix`), so `/register`'s inline sign-in picks this up too.
- **`components/website/MembershipCardsSection.tsx`:** cap + heading, cards as ruled rows (federation, status cap in pen
  when expiring or expired, View / Remove text links), `+ Add a card` line key, add form as a two-column block, Save card
  pen key. **`components/promoter/HostGymPicker.tsx`** (shared with the Listing tab): cap label, chosen gym as a ruled
  box with View / Use gym address / Clear text links, results list as a ruled dropdown on the sheet.
- Checked: tsc clean, bun test 583; staging at 390 and 1280 px with zero page errors: `/promoter` signed out and in,
  `+ New Meet` open; `/website/account` signed out (Sign in, Create account), signed in, Change password and Add a card
  open. Screenshots `~/Downloads/zt_ui_1104/promoter_*.png`, `account_*.png`. Left on purpose: `/promoter/[id]`'s
  Listing tab and the public athlete / gym pages are still bridge-rendered (sweep ranks 3-4).

## Phase 6 leftovers: brand assets off the rose (11/4, after the Set Stone V9 push)

- **Email frame** (`lib/email/layout.ts`, `lib/email/claimApproved.ts`, the six `emails/supabase-*.html`): one mechanical
  restyle across all eight documents, same markup, new chrome: ground `#d6d6d6` behind a white sheet with a 2 px ink
  rule (no radius), header cell with the outlined wordmark as an image (`public/email/wordmark.png`, 400 px wide for the
  200 px slot, `alt="ZER0TACKY"`; generated by `~/.aki/tmp/zt/merch/email_assets.py` from `brand_svg.wordmark`, so no
  font has to load in a mail client), body text in ink with a monospace stack (Red Hat Mono first, then the client's
  mono), facts table ruled top and bottom with cap labels, CTA as a pen key (`#1d3aa8`, uppercase, no radius), links in
  pen, footer over a 2 px ink rule. `emails/README.md` says the dashboard copies need re-pasting (prod, then staging)
  after the deploy that carries the PNG. Previews: `~/Downloads/zt_ui_1104/email_*.png`.
- **Share cards** (`lib/website/og.tsx`, used by `/shows/[slug]` and `/m/[slug]` opengraph-image routes): sheet card on the
  ground with a 4 px ink rule, header strip with ZER0TACKY (Saira Stencil One, the Set Stone V9 drawn inline as the 0),
  LIVE as a pen key / DEMO as a line key, cap kicker, Red Hat Mono title and lines (date in bold, long form via
  `longIsoDate`), title-block footer (SHEET / OPERATOR). Satori needs TTF, so the site's three woff2 files are converted
  once into `lib/website/fonts/*.ttf` (21 + 21 + 49 KB) and read with `import.meta.url`; `renderOgCard` is async now
  (both routes already awaited it). Checked on the dev server: both routes 200 image/png; `~/Downloads/zt_ui_1104/og_*.png`.
  `public/og.png` (the static site card) was already redrawn with V9 on 11/4.
- **First-show guide screenshots** (`public/guide/*.png`, 17 files): reshot on staging at 1440 px x1.5 with
  `~/.aki/tmp/zt/shots/guide_reshoot.py` (Playwright over the headless Edge; hides sticky bars, rewrites the dev origin to
  zerotacky.com, signs in as the staging promoter). `GUIDE_IMAGE_SIZES` in `lib/website/firstShow.ts` recomputed from the
  PNG headers; the Registrations alt no longer counts "four" pending entries. The tab order and collar field (Astra PS-08,
  deferred since 10/26) are now what the pictures show.
- Still rose on purpose: the hex examples in `supabase/030_theme.sql` / `032` error strings and in tests (`#e11d48` is
  just a sample colour there), and `--zt-bg #0a0b0e` in the bridge, which only feeds screens not yet redrawn.
- 11/5 follow-up: on Vercel the `import.meta.url` font read returned 200 with Satori's fallback mono (the bundler rewrote
  the asset URL, no throw). Now `readFile(path.join(process.cwd(), 'lib/website/fonts', file))` plus
  `outputFileTracingIncludes` for `/shows/[slug]/opengraph-image` and `/m/[slug]/opengraph-image` in `next.config.mjs`.
  Local render unchanged; prod check after deploy.
