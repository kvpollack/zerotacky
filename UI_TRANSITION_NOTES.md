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
- Not done, by choice: the meet editor still renders `components/setup/builder/*` (the old sections) through the bridge.
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
