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

## Feature 4: train for this show (11/5, roadmap build 4)

The gym directory can now be opened *for a show*: `/gyms?show=<slug>` ranks gyms by how much of that show's implement
list they carry, and every public show page links there. Pure lib + two components; no schema change, no new tables.

- **`lib/website/trainFor.ts`.** `showTrainingNeeds(events)` walks each event's spec through `IMPLEMENTS[].gymEquipment`
  (`lib/events/spec.ts`) and the `GYM_EQUIPMENT` labels, merging repeats (two keg events = one "Kegs" need listing both
  events). Barbell, duck walk, `other` and spec-less events contribute nothing: barbells are everywhere, and guessing the
  rest would mislead. `gymCoverage(gym, needs)` is a case-insensitive tag match; `rankGymsForShow(gyms, needs, {fullOnly,
  tieBreak})` keeps gyms with at least one hit, most complete first, ties broken by the caller (distance when a zip is set,
  else name); with no needs it is a passthrough. `coverageLabel` writes the one-liner ("Everything the show uses", "1 of 2
  implements", "Has the yoke"). `trainForShowHref(show, needs)` builds the link with the venue state preselected, or null
  when there is nothing to match. `test/trainFor.test.mjs` (5 tests, 588 total).
- **`/gyms`.** `app/gyms/page.tsx` resolves `?show=` through `getPublicShowBySlug` (unknown slug = plain directory) and
  hands `{slug, name, date, needs}` to `GymsBrowser`. The browser draws a `data-testid="train-for"` section above the
  filter bar: cap "Training for a show · date", the show name as a link back, the ranking rule in one sentence, `Clear
  show`, the needs as wrapped bordered tiles (label / events; a padded `zt-block` grid painted its empty cells as a black
  bar when a show had one need, so tiles instead), and a checkbox "Only gyms with everything the show uses" (counts as an
  active filter, cleared by Reset). Each card gets a coverage line under the address (`data-testid="coverage"`, bold pen
  when complete, "· missing x, y" in muted). The rest of the browser is still the bridge-rendered old markup; the gym page
  redraw is a later sweep item.
- **Show page.** `ShowDetailClient` adds a line key "Find a gym to train for this show" after the live scoreboard key,
  only when the show has at least one matchable spec.
- Checked on staging :3079 at 1280 and 390 (`~/.aki/tmp/zt/shots/trainfor.py`, zero page errors): Iron Harbor Classic
  (one spec, yoke) -> 1 PA gym, "Has the yoke"; Riverside Iron Fest demo (kegs + truck pull) -> 7 gyms, "1 of 2
  implements · missing pull harness and sled". Screenshots `~/Downloads/zt_ui_1105/trainfor_*.png`.
- Left for later: nudge promoters to fill specs (a show with none shows every gym and says so); match on per-gym
  equipment detail (yoke weight, log diameter) once gyms record it; surface the link on the athlete's registered-show
  cards in /website/account.

## Sweep item 3 + 4 hand redraws: athlete profile, gym page, how-it-works (11/5)

Four public pages off the bridge, render only; data loaders, metadata, JSON-LD and the copy files are untouched. Old-skin
class hits (`rounded-*`, `bg-zt-*`, `text-zt-*`) 51 + 40 + 33 + 25 -> 0. No lucide icons remain on these routes.

- **`/athletes/<username>`** (`app/athletes/[username]/page.tsx`): identity band (square avatar cell with initials in
  the sheet face when there is no photo, @handle cap, name, roles as bordered chips) over a four-cell facts strip
  (Location, Home gym with directory link, Favorite lift + note, Shows on record with podium count); then one ruled block
  per section: PRs (lift / value in pen), Show history (date · venue cap, show link, division, place in bold pen when
  podium with pts and event wins), Shows they run (status chip, pen when live), Gyms, Links (bordered tiles). Mixed text
  such as "3rd of 4" or "250 lb" stays in the body face; the sheet face is for pure numbers only.
- **`/gyms/<slug>`** (`app/gyms/[slug]/page.tsx`): the gym's colour fills one band (name · city, state; type · claim
  status · demo) exactly like the promoter band on a show page, then a facts strip (Address, Day pass + price in pen,
  Drop-in hours, Contact & booking link), the policy block, provenance text with `Claim this gym` (pen key) and `Not
  right? Report it` (line key), Equipment as a two-column ruled list with category chips, Hosted shows as a ruled list.
- **`/how-it-works`** and **`/how-it-works/first-show`**: jump links are small line keys; each track's steps are rows
  of one ruled block with the step number in the sheet face (pen); the first-show call-out is the block's last row on
  ground with an ink key; FAQ groups and the roadmap are two-column ruled blocks. The guide draws each step as one
  block: number + title cell, body cell, "On the public side" cell on ground, one cell per screenshot (2 px rule on the
  image, no radius); outro block with pen + line keys.
- **Odd counts in two-column blocks:** a `.zt-block` paints its gaps in the rule colour, so an odd number of cells left
  a dark hole. Both pages append an empty `hidden sm:block` cell when the count is odd (`Filler` in how-it-works, inline
  on the gym page). Same reason the train-for needs on `/gyms` are wrapped tiles rather than a grid.
- **Claim form note** (`app/gyms/[slug]/claim/GymClaimClient.tsx`, Kurt 11/5): the name and email prefill from the
  signed-in account read like a placeholder. A line under the name now says "Filled from your account. Change it if you
  are filing this for someone else." Rendered only when a session exists; the page itself is still on the bridge.
- Checked on staging :3079 at 1280 and 390 (`~/.aki/tmp/zt/shots/athlete.py <paths>`, `shots/claim_note.py`), zero page
  errors; tsc clean, 588 tests. Screenshots `~/Downloads/zt_ui_1105/`.
- Still on the bridge (sweep item 5): gym claim form, gym add / My Gym, admin claims, legal, demo, trainers, athletes
  list, `/gyms` browser body and filter bar, `/shows` filter block, sign-in form.

## Sweep item 5: the small pages (11/5)

The rest of the public bridge, render only. Data loaders, server actions, query logic (`lib/website/trainFor.ts`,
`gymSearch`, filters) and copy are untouched; `trainfor.py` and the 588 tests still pass. Old-skin class hits
(`rounded-*`, `bg-zt-*`, `text-zt-*`) -> 0 in every file below; lucide icons removed from each.

- **`/gyms` browser** (`components/website/GymsBrowser.tsx`, `app/gyms/page.tsx`): filter bar is one `.zt-block` of cap +
  `.zt-input` cells (zip with a narrow radius select, day-pass checkbox tinted `--pen`, zip note in redpen on error,
  "Reset filters" text link). Each gym card is a `.zt-block` with explicit `grid-rows-[auto_auto_auto_1fr_auto]` (chips,
  name/address/distance, Hours/Policy `<dl>`, equipment tags, footer with website link + "Equipment details" key).
  Equal-height grid cards without explicit rows left a dark band at the bottom (the gap colour showing through); giving the
  equipment row `1fr` lets it absorb the slack instead.
- **`/shows` filter block** (`components/website/ShowsBrowser.tsx`, `app/shows/page.tsx`): six fields in one block
  (`md:grid-cols-2 xl:grid-cols-3`), count + Reset row, ruled empty state. `ShowRows` untouched. Both list headers now share
  one shape: H1, count chip (dashed when demo), lede, redpen error.
- **`/athletes` and `/trainers`** (`components/website/AthletesBrowser.tsx`, both `page.tsx`): filter block, then people as
  cells of a `ul.zt-block` (1 / 2 / 3 columns): square avatar or initials in the sheet face, name, @handle cap, role chips,
  location, favorite lift. Filler `<li>` cells (`hidden sm:block` / `hidden lg:block`) keep the gap colour from showing on
  odd counts, same trick as how-it-works.
- **Gym claim form** (`app/gyms/[slug]/claim/GymClaimClient.tsx`, CRLF): tabs as pen / line keys, form cells with caps,
  receipt block, `KeyButton` submit.
- **Add my gym** (`components/website/AddGymClient.tsx`): gym type as three ruled radio cells (picked one fills pen),
  address split City / State / Zip, pen submit + line cancel.
- **My Gym editor** (`components/website/MyGymClient.tsx`): editor is a `.zt-block`; fieldsets are cells with the legend
  floated (`float-left w-full`), which makes a `<legend>` lay out as an ordinary block instead of sitting in the border;
  equipment tiles get `border-2 border-pen` when ticked; notices are redpen or rule bordered.
- **Admin claims queue** (`components/website/AdminClaimsClient.tsx`): each claim is a block (header, claimant / message
  grid, actions cell with small keys); status chips plain / good / warn / bad; "Nothing waiting" empty state.
- **`/demo`** (`app/demo/page.tsx`): cards as blocks with `grid-rows-[auto_1fr_auto]`, cap meta line, keys.
- **Legal** (`app/legal/[doc]/page.tsx`, `components/legal/MarkdownBlocks.tsx`): doc nav as caps with the active one
  underlined; markdown renderer on ink / rule / ground tokens with the sheet heading sizes. `MarkdownBlocks` also renders
  the waiver inside `RegisterClient`, so /register was reloaded and is clean.
- **Still on the bridge, on purpose:** `WebsiteThemeControls.tsx` (the bright / dark popover in the shell header, shared
  with /join, /m and the root landing) and `WebsiteThemeFrame.tsx` (the bridge root, `bg-zt-bg text-zt-text`). Both are
  the bridge itself rather than pages on it; they go when the shell does. The promoter meet-detail sections
  (`components/promoter/*Section.tsx`, `PromoterMeetDetailClient.tsx`) are console, not website, and were never in the sweep.
- Checked on staging :3079 at 1280 and 390, signed out and signed in (`shots/athlete.py --login <paths>`), zero page
  errors; tsc clean, 588 tests. Screenshots `~/Downloads/zt_ui_1105/`.

## Astra audit of the 11/4-11/5 builds and redraws: fixes BR-01 to BR-09 (11/5 evening)

Report `audits/astra-2026-11-05-builds-and-redraws.md`, disposition per finding in
`audits/astra-2026-11-05-builds-and-redraws-disposition.md`. 598 tests (+10), tsc clean, migration 040 new.

- **BR-01 (High) unlisted meet through `/gyms?show=`:** `getPublicShowBySlug` resolves an unlisted meet once its results are
  stamped (037, the federation link). That is right for the show page and wrong for the directory. `trainForEligible()` in
  `lib/website/trainFor.ts` gates both the `/gyms` block and the show-page link on `isPublicListed !== false`.
- **BR-02 (High) generic share card:** `openGraph.images: ['/og.png']` in the show and board `generateMetadata` overrode the
  `opengraph-image.tsx` file convention, so crawlers were told to use the static card. Removed; Next emits the route's card.
- **BR-03 long titles:** `fitOgTitle()` picks the size from the character count (monospace makes it exact): 66 / 60-42 / 40-36
  px for one / two / three lines, ellipsis beyond, `lineClamp` as backstop. Renders in `~/Downloads/zt_ui_1105/og_*.png`.
- **BR-04 invisible focus ring:** Tailwind v4 gotcha. `focus:outline-none` sets `--tw-outline-style: none`, and `outline-2`
  takes its style from that variable, so `focus-visible:outline-2` drew nothing. Pattern is now
  `outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-<colour>`; applied to KEY_BASE,
  NAV_LINK, the wordmark link and the mode toggle. Verified in the browser with `shots/focus_check.py` (wait out the 150 ms
  `transition` before reading the computed colour, or it reads as the base ring grey).
- **BR-05 server accepted what the editor refused:** `040_event_spec_guard.sql` adds `zt_check_event_spec()` and a trigger
  on `events` (insert / update of config), mirroring `validateEventSpec` plus "no unknown keys". The show page renders the
  video link through `safeVideoUrl()` as a second lock. Existing specs pass the guard.
- **BR-06, BR-07, BR-09 form semantics:** picker label only while its input exists; event-form error is a focused
  `role=alert`; register step 3 is a real form with a submit key.
- **BR-08 small values:** `kgLabel` says "<1 kg" instead of "0 kg"; course distance is 1 to 5280 ft in half-foot steps in
  validation, normalization and 040 alike.
- Left as notes: card removal UI (Astra retest), OG function headroom (Vercel summary), the 1 px radio gap (product call).
- **Recheck (same evening):** BR-05 residual, `{"notAllowed":[null]}` saved through 040 (SQL NULL from `jsonb_array_elements_text`
  made `r = any(rules)` NULL, not false) and crashed the show page on `.toLowerCase()`. 041 types every field strictly; the
  renderer normalizes before it reads (`specSegments`, `specNotes`, `specHasContent`). BR-03 residual, a 99-char unbroken
  token painted past the border: `ogTitleLines()` greedy wrap with long-token breaking + `wordBreak: 'break-word'`.
  604 tests. Lesson for the SQL guards: check `jsonb_typeof` per element before any text coercion.

## Feature gaps #6: roster import with columns (11/5 late)

Kurt picked #6, #15 and #10 from `Downloads/zerotacky_feature_gaps_2026-11-03.md` on 11/5; this is the first. Iron Podium
exports PDF only, so the target is the spreadsheet a promoter already keeps. 615 tests (+11), tsc clean, no migration.

- **Where:** a third add mode, `Import`, beside Single Add and Bulk Add in the Athletes section. Both hosts: the scorer's Meet
  Setup 5 and the promoter editor's tab 7 (`host='promoter'`, same working-state save bar; new divisions ride along).
- **`lib/roster/import.ts` (pure):** `parseDelimited` (tab / comma / semicolon by first-line count, RFC 4180 quotes, CRLF, BOM,
  blank lines dropped, short rows padded), `looksLikeHeader` (a known alias and no bare numbers), `guessMapping` (aliases:
  name / athlete / lifter; first + last; division / class / weight class / category / flight; bodyweight / BW / weigh-in /
  weight; lot / draw / order / bib / #; each field claimed once), `parseBodyweight` (lb default, `kg` suffix or a kg header
  converts, 1 decimal), `parseLot`, `buildRosterPlan` -> `RosterPlan`, `describePlan`. Plan rules: division matched by
  name case- and space-insensitively, else queued as new (first spelling wins); blank name skipped; duplicate on the roster
  or in the paste skipped; a lot already taken (roster or earlier row) falls back to the next free lot with a note;
  `MAX_ROWS = 500`, the rest counted as `truncated`. `problems[]` non-empty = nothing importable (no name column, no division
  anywhere, nothing left to add).
- **`applyRosterImport(state, plan)` in `lib/meetBuilder.ts`:** creates the new divisions (default station) then
  `addAthlete` per non-skipped row with the plan's bodyweight and lot. A plan with problems is a no-op. Wired as
  `importRoster` in `hooks/useMeetState.js`, `strongman-app.jsx` and `PromoterMeetDetailClient.tsx`; the sheet prop is
  optional so a host without it shows two modes as before.
- **`components/scorer/RosterImport.tsx`:** textarea (`whitespace-pre`, tabs stay columns) or a file input (<= 2 MB, `.csv
  .tsv .txt`); "First row is: Headers / An athlete" follows the guess until tapped; one row per column with the header
  and a sample value and a Select (Ignore / Full name / First / Last / Division / Bodyweight / Lot #; picking a field
  releases it from any other column); "Every athlete goes to" Select only when no Division column is mapped (shares the
  section's target division); preview = status line + first 12 rows (lot, athlete, division with a `new` tag, BW; skipped
  rows struck with the reason in red); the submit key reads `Import N Athletes` and is off while `problems` remain. After
  import the paste clears, a status line says `Added ...`, focus returns to the textarea. A new paste resets header and
  column choices to the guesses (done in the change handler, not an effect: an effect on `text` wiped the done line).
- **Verified on staging** Iron Harbor (promoter editor, 1280 and 390): a 4-column tab paste with a kg bodyweight, a new
  division, a taken lot, a blank line and an in-paste duplicate previewed as `Add 3 athletes to 3 divisions. 1 new: Masters
  Men 40+. 1 skipped.`; Save Changes persisted `Masters Men 40+` (flight A, sort 6), bodyweights 205 / 138.9 / 240 and lots
  9 / 3 (next free) / 1. Test rows and the division deleted afterwards (15 athletes again). Scorer host on the demo meet
  (430 px dark): same panel, `Added 2 athletes to 1 division. 1 new: Open Men.` Shots `~/Downloads/zt_ui_1105/import_*.png`,
  scripts `~/.aki/tmp/zt/shots/roster_import*.py`. No page errors.
- **Left on purpose:** no email column (athletes have no email field; registrations carry accounts), no update of existing
  athletes (an import only adds; a re-import skips names already there), the strike-through on skipped rows is on the text
  spans only (text-decoration propagates to children, so a struck container would strike the red note too).

## Feature gaps #15: comp-prep sheet (11/5 night)

Second of Kurt's three picks. The show's events as a training sheet an athlete or coach programs from, printable, with a
CSV. 620 tests (+5), tsc clean, no migration. Hevy imports Strong's CSV, but a strongman event is not a Strong exercise
row (load + distance + time, custom implements), so the first cut is a generic CSV and a print view, as the report said.

- **Route `app/shows/[slug]/prep`** (`?division=<id>`, else every division): same `getPublicShowBySlug` path, freshness
  and reach as the show page; `robots: noindex, follow` (a view of the show, not a second page about it). Unknown
  division id = all divisions. Bad slug = the show's 404.
- **`lib/website/prepSheet.ts` (pure):** `buildPrepSheet(show, divisionId)` -> `PrepSheet` (sorted divisions, sorted
  events, one `PrepRow` each: scoring label, time cap, implement text, course, allowed / not allowed, rising-bar
  progression, notes (spec notes, then the fixed-implement description when the spec names no implement), http(s)-only
  video, and `weights[]` from `eventWeightDisplay`: one entry or one per division). `prepSheetCsv` (one division: Weight /
  kg / Setup trio; all: a `Weight (<division>)` column per division, kg in parentheses), `prepSheetFilename`,
  `prepSheetHref`, `timeCapLabel` (`60s`, `1:15`).
- **`components/website/PrepSheetClient.tsx`:** cap + show name + date, venue, division; Download CSV (pen key, through
  `shareOrDownloadText`, BOM added there) and Print (line key); division keys (All + each, `aria-current="page"`); one
  ruled table (Event | Scoring & cap | Implement & rules | Weight or one column per division | Notes). Rules and Notes
  columns only render when any row has content. Video is a link on screen and `Video: <host> (link on the show page)` on
  paper: a long URL is not typeable and blew the notes column up to a page.
- **Show page:** a `Prep sheet` line key beside the Events & Weights heading, carrying the division picked in the
  standings strip (`ALL` -> no query).
- **Print (globals.css `@media print`):** sheet tokens forced to the bright set on `:root` and every `[data-zt-mode]`
  (the frame sets the mode on its own div, so `:root` alone left the grey ground); `.zt-print-hide` on the shell header
  and footer (unlayered class with `!important`: `.zt-block`'s `display:grid` is unlayered too and beat Tailwind's
  `print:hidden`, which is why the footer kept printing); `@page { margin: 12mm }`; rows `break-inside: avoid`. The
  table goes `table-fixed` with percentage widths in print so nine columns fit a Letter portrait page (one page each
  for Iron Harbor's one-division and all-divisions sheets, `~/Downloads/zt_ui_1105/prep_*.pdf`). Tried a named
  landscape page (`page: wide`) for the all-divisions view: the frame's ancestor box printed as a blank framed page
  first, so dropped.
- **Verified on staging** Iron Harbor at 1280 and 390: link from the show page, division and all views, `thead th` 5 / 9,
  CSV download `iron-harbor-classic-2026-prep.csv` (6 lines, header as tested), print emulation hides header, footer and
  keys, dark mode + print reads ink `rgb(17,17,17)` on white, `/shows/no-such-show-xyz/prep` = 404. Shots
  `prep_*.png`, script `~/.aki/tmp/zt/shots/prep_sheet.py`, `prep_print.py`. No page errors.
- **Dev-server gotcha (11/5):** the webpack watcher missed two of this build's Python-written edits (ShowDetailClient,
  WebsiteShell) while picking up others; the server bundle kept the old component until a shell `printf '' >> file`
  nudged it. Check the served HTML for the new string before screenshotting.
- **Left on purpose:** no Strong / Hevy-format CSV yet (would need one row per exercise with fixed columns; add when a
  user asks), no per-athlete rack heights (the sheet is the show's spec, not a registration), no landscape.

## Feature gaps #10: promoter broadcasts and automatic reminders (11/5 night)

Third of Kurt's picks, both halves at once: a message from the promoter to the registered athletes, and reminders a week
out and the day before. Migration 042, 631 tests (+11), tsc clean. Addresses never reach the browser; the UI gets counts.

- **042 `supabase/042_broadcasts.sql`**: `registrations.mail_token` (per-row unsubscribe token) and `mail_opt_out`;
  `meets.reminders_enabled` (default on); `meet_broadcasts` (kind broadcast / reminder_7d / reminder_1d, audience,
  subject, body, test_only, counts; one reminder per meet per kind by unique index) and `meet_broadcast_recipients`
  (snapshot per send: email, name, division, token, status queued/sent/failed, error). RLS on, no policies: functions only.
  `zt_create_broadcast` (promoter, server key, demo refused; limits: subject 120, body 2,000, 3 sends per meet per 24 h,
  10 tests per promoter per day, 500 recipients, dedupe by email, opted-out skipped; a test queues one row to the
  promoter's confirmed address), `zt_broadcast_payload` (claims queued rows, 2-minute in-flight window, joins
  `division_id` for the prep link), `zt_broadcast_mark` / `zt_broadcast_mark_many` (per-recipient outcome, rolls up
  counts and `finished_at`), `zt_list_broadcasts` + `zt_set_reminders` (promoter, no key), `zt_queue_due_reminders(today,
  key)` (cron: listed, non-demo, not cancelled/postponed/completed, reminders on, date = today+7 or today+1, accepted
  athletes; also returns recent reminders still holding queued rows), `zt_mail_opt_out(reg, token)` (anon).
- **`lib/email/broadcast.ts`**: pure builders. `broadcastEmail` (promoter's paragraphs, "From <name> of <meet>", View
  the show, unsubscribe link, `[Test]` subject prefix on a test), `reminderEmail` (facts: show, date, where, division,
  promoter contact; 7-day key = prep sheet for the athlete's division, 1-day key = show page), `bodyParagraphs`,
  `unsubscribeUrl` (body link, page with a confirm key) vs `unsubscribePostUrl` (List-Unsubscribe header, one-click
  POST), `reminderDue`, `audienceCount`, labels and limits. `lib/email/send.ts` gained `replyTo`, `unsubscribe`
  (RFC 8058 headers) and `sendBatchViaResend` (100 per call). `lib/email/broadcastRun.ts`: the shared pass (claim,
  build, batch send, mark) used by both routes; a retry after a half-finished pass sends only what is still queued.
- **Routes**: `POST /api/broadcast` (bearer = promoter; create+send, or `{broadcastId}` to resume; `maxDuration` 60).
  `GET /api/cron/reminders` (bearer = `CRON_SECRET`; today in America/New_York; queue, then send each; `maxDuration`
  300). `vercel.json` schedules it daily at 13:00 UTC (08:00 EST / 09:00 EDT). `/api/unsubscribe` POST = one-click
  from the mail client, GET = redirect to the page. `/unsubscribe?r&t` page (noindex): one confirm key, so a link
  scanner prefetching the URL opts nobody out; done state names the meet; bad or missing token explained.
- **UI `components/promoter/BroadcastSection.tsx`** under Registrations (tab 6): subject (counter), To = Accepted /
  Everyone with the live reach count, message (blank line = paragraph), Preview, Send a test to me, Send to N behind an
  armed "Yes, send to N now" that disarms after 8 s or on any edit, result line, Automatic reminders on/off with the
  copy, Sent history (kind, audience, sent/recipients, failed, in progress, time). Preview build: explains, does nothing.
- **Verified on staging** (Iron Harbor, 3 pending, 0 accepted): test-mode create queues one row to the promoter's
  address; all_active create snapshots 3 rows with division ids and tokens; a second payload pass claims nothing;
  `mark_many` rolls up 2 sent / 1 failed and finishes; reminder queue for 11/7 and 11/13 creates both rows with 0
  recipients (nobody accepted) and returns no ids; unsubscribe page end to end with a real token (reset after); one-click
  POST 200; header GET 303. No real email left the laptop: `.env.local` has no `RESEND_API_KEY`, so the UI's test send
  returned the 503 wording. First real send happens on Vercel.
- **Operator steps**: apply 042 to prod; set `CRON_SECRET` on Vercel (any long random string; Vercel sends it as the
  bearer on cron calls); confirm `RESEND_API_KEY` and `ZT_MAIL_KEY` are already there (they are, for 031). After the first
  deploy the cron shows under Project > Settings > Cron Jobs.
- **Left on purpose**: no scheduling of a broadcast for later; no per-athlete send; the reach count in the UI does not
  know about opt-outs (the server count is the truth and the result line says what went); reminders go to accepted
  athletes only (pending ones are not on the roster yet); no "resume" key in the UI for a half-finished send (the
  route supports `{broadcastId}`; the history shows "in progress" when it happens, and the next cron pass finishes
  reminders on its own); Resend free tier is 3,000 a month, the limits above keep one show well under it.

## Astra audit of #10: fixes BC-01 to BC-11 (11/6, migration 043)

Report: `Downloads/zerotacky_astra_audit_10_2026-11-06.md`. HOLD lifted by this set. 637 tests (+6), tsc clean. 043 is
additive on 042 (constraint widened, two columns, functions replaced); every scenario below was reproduced against 043 on
staging inside a rolled-back transaction, and the UI findings on the dev server.

| ID | Disposition |
|---|---|
| BC-01 High | **Fixed.** `zt_broadcast_payload` / `zt_broadcast_mark_many` take `p_server boolean`; a null uid is accepted only with it (the cron route passes true; the promoter route never does), and a signed-in caller must be owner/member (`zt_broadcast_caller_ok`). Old signatures dropped. Reproduced: anon + false = "Sign in required"; other user = "no access"; anon + true (cron) = OK. |
| BC-02 High | **Fixed.** Claims are chunks of up to 100 in id order; each chunk goes to Resend with a deterministic `Idempotency-Key` (`chunkIdempotencyKey` = broadcast id + sha256 of the row ids), so a retry of the same chunk is delivered once; provider ids are stored per recipient. A failed outcome save (two tries) stops the pass and is returned as `unresolved`; the browser shows "N not confirmed, check the history before sending again" and never a bare success. Reminder retry window cut to 20 h to stay inside the 24 h key life. |
| BC-03 Med | **Fixed.** Claim rechecks each row's registration (opt-out, status still in the audience, show-wide suppression) and skips the rest; `zt_mail_opt_out` skips anything still queued for that address. New recipient status `skipped`. |
| BC-04 Med | **Fixed.** `zt_mail_suppressed(meet, email)`: an opted-out registration suppresses its effective address show-wide; create, queue and claim all consult it; opt-out flips every registration of that person (same address or same account) in the meet. Reproduced with a second registration of the same address. |
| BC-05 Med | **Fixed.** `pg_advisory_xact_lock` on the meet (real sends) or the promoter (tests) before counting. Source fix; not stress-tested. |
| BC-06 Med | **Fixed.** `zt_reminder_meet_ok` (reminders on, listed, not demo, live status, date not past in New York) is checked when queuing, in the "still queued" lookup, and at claim; a failing claim skips the rows and closes the broadcast (`closed: 'ineligible'`). Reminder insert uses `ON CONFLICT DO NOTHING`. |
| BC-07 Med | **Fixed.** `sendBatchViaResend` returns `sent` / `retry` (429, 5xx, network, timeout) / `rejected`; retry marks keep rows queued with the error noted and the attempt counted; five attempts then `failed`. The pass stops after a retry outcome rather than hammering the provider; the cron picks reminders up next day, the promoter has a **Resume** key in the history. |
| BC-08 Med | **Fixed.** Outcomes are saved per chunk; the runner takes a deadline (promoter route 40 s of 60, cron 240 s of 300 shared across broadcasts) and reports `remaining` and `time_budget`; batch timeout 15 s. |
| BC-09 Med | **Fixed.** Routes return public error codes (`provider_unavailable`, `provider_rejected`, `record_failed`, `time_budget`) and fixed sentences; provider detail is written to the recipient row only; any address in a message is scrubbed (`scrubAddresses`). |
| BC-10 Low | **Fixed.** Arming stores the reach it was armed with; the confirm sends only if the reach is unchanged, and any registrations refresh disarms. Reproduced: declining an athlete while armed disarmed the key. |
| BC-11 Low | **Fixed.** The subtraction is gone; the line reads "about N with an email address. An estimate from this list; opt-outs and duplicate addresses come off when you send", capped at 500. Opted-out count is reported in the reminders paragraph. |

Also from the audit table: control characters refused in the subject (SQL and route); `CRON_SECRET` compared with
`timingSafeEqual`. Not changed: `isDemo` is not passed by the parent (the database refuses demo meets; the section's
copy is a courtesy); the 500 cap still applies before dedupe.

**Operator steps**: apply 043 to prod (functions change signature; the deployed code and the database must move
together, so push and migrate in the same sitting). Then the same two as before: `CRON_SECRET` on Vercel, first real test
send from the Iron Harbor editor.

## Feature gaps #7 + #8: meet-day schedule, "you're up", check-in desk (11/6 afternoon, migrations 044 + 045)

Three pieces, built in this order. Staging has both migrations; prod needs them in order (044 then 045).

**#7a Meet-day schedule (044_schedule.sql).** `meets.schedule jsonb`, checked by `zt_schedule_ok`: `timezone` (IANA),
`eveWeighInStart/End` (the day before), `checkIn`, `weighInStart/End`, `rulesMeeting`, `start`, `estimatedEnd` (all "HH:MM"
24-hour, venue local), `notes` (<= 200). `zt_update_listing` accepts `schedule` (blank values dropped, empty object = null);
`zt_my_meets` / `zt_get_my_meet` return it (and `zt_my_meets` now also returns `results_submitted_at`, which 037 had only
added to `zt_get_my_meet`); public column grant gains `schedule`; `zt_broadcast_payload` (043 body) carries it.
- `lib/website/schedule.ts`: parse/clean (typed "9am", "9:30 PM", "0900" all normalise), `scheduleTimeline` (windows joined,
  day-before row flagged), US time-zone list with a default from the venue state (`timeZoneForState`), `zonedToUtc` via Intl
  (DST-safe), `buildShowIcs` (RFC 5545: CRLF, 75-octet folding, escaped text; one VEVENT from the first thing on the
  timeline to the estimated finish, a second for the day-before weigh-in; no times = all-day event).
- Listing tab: "Meet-Day Schedule" block, native `<input type="time">`, time-zone select ("Same as venue (Eastern)" default),
  note. Order checks name the field (weigh-in closing after the first event is refused).
- Show page: the "Schedule Notes" row became "Meet-Day Schedule": a timeline table, the zone, the note, "Add to calendar
  (.ics)". Falls back to the legacy `scheduleNotes` text, then "Not provided".
- `/shows/<slug>/calendar.ics` (`app/shows/[slug]/calendar.ics/route.ts`): same visibility rule as the show page; demo
  fixtures 404. `Content-Disposition: attachment`.
- Reminders (#10): facts gain the timeline rows + "Time zone", the day-before paragraph leads with the schedule note, and an
  "Add to calendar (.ics)" link appears when there is a schedule. Wording without a schedule is unchanged.

**#7b "You're up" (no migration).** `lib/tv/youreUp.ts` `upStatus(state, live, athleteId)` reuses `buildSheetA` for the
athlete's station: `up` / `on_deck` (away = 1 or 2) / `queued` (N away, scored rows ahead do not count) / `scored` (with the
division's next event) / `waiting` (division not live on its station) / `unknown`. On `/m/<slug>`: "Follow an athlete"
picker (grouped by division), banner in pen when up, pen border when on deck; choice kept in `localStorage`
(`zt:follow:<slug>`); optional "Buzz this phone when on deck" asks Notification permission and fires once per state
transition (`notifyKey`), with a vibrate where supported. Alerts work only while the page is open; the picker says so and
tells iPhone users to add the page to the Home Screen. No SMS, no server push (held, see the gaps report).

**#8 Check-in desk (045_checkin_desk.sql).** Side data, not roster fields: `meet_checkins (meet_id, athlete_id)` with
`checked_in_at`, `weighed_kg` (20 to 300, two decimals as typed), `weighed_at`, `paper_waiver_at`, `card_verified_at`,
`note` (<= 120); `divisions.weight_cap_kg` (20 to 300). The builder's config save and the meet-day publish never write
these columns, so nothing on the phones changes. RPCs (owner or member, `zt_desk_caller_ok`): `zt_desk_state`,
`zt_desk_athlete(p_meet_id, p_athlete_id, p_patch)` (keys `checked_in`, `weighed_kg`, `paper_waiver`, `card_verified`,
`note`, `division_id`), `zt_desk_division_cap`. A kg weigh-in mirrors into `athletes.bodyweight` (lb, one decimal) for the
roster, standings and the federation export. Reclass moves the athlete (new lot at the end of the target division) and
re-points the linked registration; refused once the athlete has a result. Every desk write bumps `meets.updated_at`.
- Contract: `DeskState`, `DeskCheckin`, `DeskPatch`; `getDesk`, `updateDeskAthlete`, `setDivisionCap` on both APIs
  (fixture keeps an in-memory map per meet).
- `lib/desk/rules.ts`: `parseKg` (comma or dot, optional "kg", two decimals, range), `lbToKg`/`kgToLb`, `classCheck`
  (cap inclusive, over by the exact difference, no rounding), `deskPreset(federation)`: SC wording (24 h window, kg, no
  rounding, combined classes under the heavier class), a short USS line, generic otherwise.
- `components/promoter/CheckInDeskSection.tsx` on the Meet Day tab, above the board tools: counters (checked in, weighed,
  over cap), division cap inputs, search + filters (Not checked in / Not weighed / Flagged = over cap or no waiver), scale
  unit toggle (kg or lb typed, kg stored), per row: division select (reclass), Check in key, bodyweight input with the other
  unit beside it, class chip, waiver (Online from the registration, else Needs waiver -> Paper signed), card (uploaded card
  status when there is one + Mark card seen), paid, note. Blocked while the builder draft is dirty (same rule and copy as
  Registrations). The parent reloads meet + registrations + desk after each write (`refreshAfterDesk`).

Tests: `test/schedule.test.mjs` (14), `test/desk.test.mjs` (7), `test/youreUp.test.mjs` (3); suite 661 pass, tsc clean.
Staging checks (11/6, screenshots `~/Downloads/zt_ui_1106/`): schedule saved and shown on the show page, `.ics` downloads
with correct UTC instants (07:00 EST = 12:00Z on 11/14), demo `.ics` 404; desk: cap 90 kg, check in, 92.45 kg -> "Over by
2.45 kg", bodyweight mirrored to 203.8 lb in the DB, reclass to Novice Men and back, bad input refused; board: Priya "on
deck · Next", Tessa "is up (event 1 of 5)", Devin "waiting", choice survives reload. Staging roster restored afterwards
(check-ins deleted, cap cleared, Jo Kessler bodyweight null / lot 3); the Iron Harbor schedule was left in place as demo data.

Dev-server gotcha confirmed: Python-written edits need `touch <file>` (not `printf '' >>`) before the watcher recompiles.

Left on purpose: no web push / SMS (#7 report row says both cost money or need an install; the in-page alert covers the
athlete with the board open); the board does not yet show the schedule's first-event time; no rule presets beyond the SC
text; the Athletes tab does not display bodyweight, so the mirror is visible on the desk, standings and export only.

## Feature gaps #12 + #14 + #17: staff roster and briefing cards, sponsor blocks, livestream link (11/6 evening, migration 046)

Report rows: #12 "volunteer and judge roster with briefing cards", #14 "sponsor blocks on show page and live board", #17
"livestream link field" (`~/Downloads/zerotacky_feature_gaps_2026-11-03.md`). One migration, three columns on `meets`,
one storage bucket.

**046_sponsors_staff_stream.sql.** `sponsors jsonb` (array <= 6 of `{name <= 60, url? https <= 300, logoPath?
"<uid>/<file>"}`, `zt_sponsors_ok`), `livestream_url text` (`zt_https_url_ok(p, 300)`: https only), `staff jsonb` (array
<= 40 of `{name <= 60, role in judge | head_judge | state_rep | volunteer | loader | scorer | emcee | medic | other,
station? <= 40, contact? <= 80, note? <= 160}`, `zt_staff_ok`). Public column grant gains `sponsors` + `livestream_url`
only: **staff has no anon grant** and travels only through `zt_my_meets` / `zt_get_my_meet` (owner or member), so a judge's
phone number never reaches a public select. `zt_update_listing` (044 body) accepts all three in the patch, trims strings,
drops blank optional keys and nameless rows, and clears on jsonb null / blank. Bucket `sponsor-logos` copies the 013
avatars pattern (public read, 1 MiB, jpeg/png/webp, writes only inside the caller's `<uid>/` folder); a meet member uploads
under their own id and the path is saved on the meet. Applied to staging; `test/fake_supabase.mjs` mirrors the grant list
(it already lacked 044's `schedule`; added with the two new columns, which is what made two SyncController tests fail
until it was).

**Shared code.** `lib/website/extras.ts` (pure): types `MeetSponsor`, `MeetStaff`, `StaffRole`; `cleanLivestreamUrl`
(bare domain -> https://, http refused), `parseSponsors` / `cleanSponsors`, `parseStaff` / `cleanStaff`, `staffByStation`
(matches "station 1" / "Station 1" loosely, keeps the meet's station order, floating last), `sponsorLogoUrl(path, base)`
(public bucket URL, no client needed), logo size/type checks. `lib/website/briefing.ts` (pure): `briefingCards` (one card
per station: crew, divisions on the station, events in the station's running order with per-division lb + kg, height
callouts, `specSegments` / notes / video, then a Floating crew card), `standardsLines` (generic head-judge standards;
names the federation unless it is Unsanctioned / None; flags a missing state rep or medic), `briefingHtml` (self-contained
printable document, one card per page, escapes everything, **never prints the contact field**). `lib/auth/sponsorLogo.ts`:
`uploadSponsorLogo(sb, file)` (uid from the session), `removeSponsorLogoQuietly`.

**Plumbing.** `MeetListing.sponsors / livestreamUrl / staff` (contract, `emptyListing`, fixtures x3, fixtureApi), db row
types, `rowToMeetListing` / `listingPatchToColumns`, `validateListingPatch` (mirrors the three checks), `PublicShowSummary`
(sponsors, livestreamUrl; not staff), `PUBLIC_SHOW_MEET_COLS`, `RemoteMeet` + `MEET_COLS` + `toRemoteMeet` for the boards,
demo board `setMeet` carries the fixture's sponsors + link; Riverside fixture got two fictional sponsors and a link.

**UI.** Listing tab, new block "Livestream & Sponsors" below the schedule: link input (plain `type=text` with
`inputMode=url`: `type=url` made the browser block the submit on a bare domain, found on staging), sponsor rows (name,
link, Add/Replace logo via the bucket, No logo, remove, Add sponsor up to 6). Logo uploads happen on pick; the form tracks
them and removes unsaved uploads on Reset and replaced ones after a successful save. Meet Day tab, new
`components/promoter/StaffSection.tsx` between the desk and the board tools: rows (name, role, station select = the
meet's station labels + Floating, private contact, note), role counters, Add judge / loader / volunteer / other, Save staff
(patches `staff` only, so the Listing tab's draft is untouched), **Briefing cards** opens `briefingHtml` in a new tab
(Blob URL) with a Print key. Public: show page gets a "Watch live ↗" key in the action bar and a `SponsorStrip`
(`components/website/SponsorStrip.tsx`, logo or name, link out with `rel="noopener noreferrer sponsored"`, a logo that
fails to load falls back to the name); phone board footer gets the strip and the Watch live link; TV idle sheet gets a
sponsor row between the clock line and the title block (`TvIdle` prop `sponsors`).

Tests: `test/extras.test.mjs` (9), `test/briefing.test.mjs` (4); suite 674 pass, tsc clean. Staging checks (11/6,
screenshots `~/Downloads/zt_ui_1106/`: `sponsors_editor`, `staff_editor`, `briefing_cards`, `sponsors_show_page`,
`watch_live_show_page`, `sponsors_phone_board`, `sponsors_tv_idle`): link `youtube.com/live/ironharbor` saved as https,
two sponsors (one with an uploaded logo) saved and shown on the show page and the phone board, three staff saved (a blank
volunteer row dropped), persisted across reload, briefing opened with 3 cards and no contact text, TV idle strip on the
Riverside demo. Orphan test logos removed through the Storage API (`shots/orphans.py`); the Iron Harbor sponsors, link and
staff were left on staging as demo data.

Left on purpose: staff is promoter-only (no "show judges on the page" toggle; that needs a public RPC so the contact field
stays private); no logo cropping or SVG (same limits as avatars); the standards text is generic by design, the federation
rulebook is not quoted; livestream is a link, not an embed (an iframe needs per-platform embed URLs and a consent story);
tickets (#17's second half) stay held with payments.

## Astra audit of #7 / #8 / #12 / #14 / #17: fixes MD-01 to MD-18 (11/6 night, migration 047)

Report: `~/Downloads/zerotacky_astra_audit_7_8_small_2026-11-06.md` (1 P0, 10 P1, 7 P2). Every finding fixed; nothing
left open. SQL in `supabase/047_audit_md_fixes.sql`, client fixes in the same push.

**P0, MD-01: join code leaked the staff roster.** `zt_meet_by_join_code` returned the whole `meets` row (security
definer), so a volunteer code read the private `staff` column past the missing anon grant. 047 nulls `staff`, `owner_id`,
`auto_accept` and `reminders_enabled` alongside `admin_pin`; the rule is now "every column outside the public grant except
`join_code`", and `test/join_code_privacy.test.mjs` recomputes that set from the migrations (meets columns minus the newest
`grant select (...)` list) and fails when the newest RPC body misses an `r.<col> := null` line. Verified by removing the
staff line (test fails, names the column) and on staging (`staff`, `owner_id`, `admin_pin`, `auto_accept` all null, code
intact). 046 is live on prod, so the leak is live until 047 runs there: prod SQL first, then the push.

**P1.** MD-02 `zt_desk_athlete` / `zt_desk_division_cap` lock the meet row first (`select 1 from meets ... for update`),
the same order as the builder save, so two reclasses cannot share a `max(lot_number)` and desk-vs-builder cannot deadlock.
MD-03 `ScoreboardClient`: no "you're up" status or notification once the meet is completed or cancelled. MD-04 / MD-14
`ListingSection`: the post-save pass that deleted old saved logos is gone (a saved logo path may still be referenced; the
bucket keeps it), unmount cleanup removes uploads that were never saved. MD-05 `TvIdle`: the sponsor row wraps
(`flex-wrap`, 1700 px), names truncate at 640 px with a `title`, the column is `overflow-hidden`. MD-06 StaffSection
reports dirty to the meet page (`onDirtyChange`), which joins the unsaved-changes guard and the dirty bar ("Unsaved Staff
Changes" + "Go to Meet Day" from another tab). MD-07 desk `run()` resolves a boolean and drafts clear only on success, so
a failed save keeps the typed weight (probed offline: value stays, error shows). MD-08 clearing a weigh-in restores
`athletes.bodyweight` from the accepted registration (or null) instead of leaving the stale lb mirror; the fixture clears
it. MD-09 the `pg_column_size` caps (700 / 4000 / 12000) were reachable with field-valid CJK payloads; now 4096 / 32768 /
131072, pure DoS guards. MD-10 `zt_update_listing` validates the schedule like `cleanSchedule`: object only, string values,
zone checked with `now() at time zone`, the four order rules with the client's messages. MD-11 the .ics "arrive" time is
the earliest of check-in, weigh-in start/end, rules meeting and start, not check-in or start alone.

**P2.** MD-12 `zonedToUtc` handles the DST gap (a local time that does not exist moves forward by the gap; New York
2026-03-08 02:30 -> 07:30Z, Berlin 2026-03-29 02:30 -> 01:30Z, fall-back and ordinary times unchanged). MD-13 Save staff
stays enabled with an invalid draft and the save or briefing shows the problem ("Staff row 4 needs a name."); the
briefing opens first and cuts `opener` after (`'noopener'` made Chrome return null even on success). MD-15 staff rows
store the station **id**; labels are display only, two stations with the same label are shown as `label (id)` in the
select and the briefing; rows saved with a label (046) map to the first station with that label. MD-16 kg are checked on
the raw value, two decimals max, in `parseKg`, the fixture and both RPCs (92.455 refused, 92.45 kept; caps too); the lb
path already rounds to two decimals before the check. MD-17 `httpsUrlOk` and `zt_https_url_ok` require a real hostname
(`https://?` refused, ports and paths fine, `localhost` refused). MD-18 `updateDeskAthlete` validates the whole patch on a
copy before applying anything (a bad cap with a good weight changes nothing).

Not changed, on purpose: the bodyweight lb mirror on the public roster stays (the audit listed it as a qualification);
the fixture does not carry registration bodyweights, so its clear sets `undefined` where SQL restores the registration's.
The desk's offline error text is the raw fetch error ("TypeError: Failed to fetch"); not in the audit, noted for a later
copy pass.

Tests: +5 (`join_code_privacy` 3, desk / schedule / extras / briefing cases reworked), suite 679 pass, tsc clean.
Staging re-probe (`shots/audit1.py`, `audit2.py`, screenshots `audit_staff_editor`, `audit_briefing_cards`,
`audit_dirty_bar`, `sponsors_tv_idle`): station options carry ids (`A`, `B`), the 046 label rows resolve to `A`, dirty bar
on edit and gone after save, briefing popup with `opener === null`, offline weigh-in keeps `123.4`, three-decimal weight
refused, TV sponsor row no longer clips.

## Feature gaps #9: claim my results + competition bests (11/8, migration 048)

Report item 9: "Claim my results and an automatic PR board." Iron Podium sells a version of this as Premium ($5.99 a
month); here it falls out of the 023 account links. Two halves.

**Claim flow (048 `supabase/048_result_claims.sql`).** 023 linked roster rows to accounts from accepted registrations
and from the promoter typing a username; hand-entered and imported rosters (#6) left most rows unlinked with no way for
the athlete to ask. New table `athlete_claims` (meet, athlete row, user, note <= 200, status pending / approved /
rejected, resolved_by / at; partial unique index = one pending claim per account per meet; RLS read = claimant or the
meet's owners / members; no write policies). RPCs: `zt_claim_result` (completed, non-demo show; account needs a
username; row not already linked; account not linked to another row; note trimmed), `zt_withdraw_claim`,
`zt_my_claims`, `zt_claim_status` (linked athlete ids, my link, my latest claim; signed in only), `zt_meet_claims`
(promoter: pending first, then the last 50 resolved), `zt_resolve_claim` (approve inserts the `athlete_accounts` row
with `linked_by`, same as `zt_link_athlete_account`; reject marks it). Trigger `athlete_accounts_settle_claim`: a
link made any other way (registration trigger, username link) approves a matching pending claim. `zt_claim_json`
shapes every row (usernames and display names, never account ids). Staging probes (`~/.aki/tmp/zt/claim_probes.py`,
all rolled back): approve links and marks approved, manual link settles the claim, reject then re-claim, duplicate
pending refused, no username refused, withdraw, non-promoter resolve refused, already-linked row refused, anon status
refused.

**Client.** Contract: `ResultClaim`, `ClaimStatus`, `CLAIM_NOTE_MAX`, six methods on `PromoterApi` (supabase + fixture
+ the lazy hook list). Show page: `components/website/ClaimResultClient.tsx` under the completed-results block
("Competed here?"): signed out = sign-in link; linked = "linked to your account as X"; pending = who and a Withdraw
key; otherwise "Claim my result" opens a roster select grouped by division (linked rows disabled, scratched marked) and
an optional note; a rejected claim explains and lets them claim again. Not shown on demo fixtures. Account page:
`MyClaimsSection` (every claim with status, Withdraw on pending; hidden when there are none). Promoter Athletes tab:
`AthleteAccountsSection` gains "Claims from athletes (N waiting)" above the link list with Approve / Reject, a toggle
for resolved ones, and "row already linked" when a claim was overtaken; both lists reload together after a link or a
resolve (`PromoterMeetDetailClient`).

**Competition bests (`lib/website/prBoard.ts`).** `ShowHistoryEntry` now carries `events`: the athlete's scored result
on each event with the division's listed weight (light tier when they took the trump), course, implement from the
event spec. `competitionBests(history)` groups by implement id (or the implement note for "other", or the normalized
event name when no spec) and keeps one best per group with the show it came from. One rule for every scoring type:
heaviest load completed something at, then the performance at it (reps: heaviest weight repped, then most reps; max:
heaviest; time or distance: heaviest finished, then fastest, else longest distance; medley: heaviest, most implements,
fastest). Equal rank keeps the newer show. Athlete page section "Competition bests" above the self-reported PRs, aside
"From final results; heaviest load first, then the result at it", each row: implement, result, show link, date,
division, "best of N shows". Scratched shows contribute nothing. Nothing is stored; the data is what the history
already fetched.

Tests: `test/claims.test.mjs` (5, fixture), `test/prBoard.test.mjs` (8, incl. entries carry events), suite 692 pass,
tsc clean. `test/promoter.test.mjs` H2 pinned to `today: 2026-11-01` (the Iron Furnace fixture deadline 2026-11-07
passed on the real clock; not a product change). Staging UI (`shots/claim1.py`, screenshots `~/Downloads/zt_ui_1108/`:
`claim_pending`, `claim_account`, `claim_promoter`, `bests_athlete_page`): signed-out link, claim sent, account row
"Waiting on the promoter", promoter box with Approve, approve linked the row (chip appears, 0 waiting), athlete page
showed the show and three bests ("9 reps at 100 lb", "24.35 s"), show page then read "linked to your account as Amber
Simcox. It is on your athlete page." Probe data removed afterwards (link, claim, listing flag).

Left on purpose: no email on approve / reject (the account page carries the status; a Resend route can follow the
broadcast pattern if athletes ask); claims open only on completed shows (a live show's roster still moves); no
self-link without the promoter (023's rule stands); bests compare across different loads by naming the load, they do
not normalize to bodyweight or kg; the self-reported PRs block stays as the athlete's own numbers.

## Feature gaps #19: host-gym hosting record + post-meet report (11/8, migration 049)

**Post-meet report (`/shows/<slug>/report`).** One printable page per completed show, built from the same results the
show page already loads (`buildAllDivisionResultsViews`). `lib/website/meetReport.ts`: `buildMeetReport(show, views,
origins)` returns the field strip (entered, scored, scratched, divisions, events), a podium per division (places 1-3
with points, tied flag, event-win count), event winners per division (place 1, non-zero mark), host gym, sponsors,
stream link, final / provisional flag. `meetReportCsv` and `meetReportFilename` (`<slug>-report.csv`) back the Download
CSV key; Print is `window.print()` with the shell hidden. Venue placeholders from the data layer ("Not provided") are
stripped before the header line, so a show with no venue reads "date · hosted at <gym>". Page: revalidate 60, robots
noindex, demo fixtures render without the origins block, upcoming shows get a "not completed" banner. Show page: a
"Post-meet report" key in the Official Finalized Podiums heading row.

**Where the field came from (049, `zt_meet_report_origins`).** anon + authenticated, security definer, stable: counts of
athletes linked to a ZeroTacky account, how many have a public profile, and the public athletes' home gyms (directory
gym when `home_gym_id` points to an unclaimed or claimed row, else `home_gym_name`), as `{linked, public, homeGyms}`.
Counts only, no names; unknown or demo meet returns zeros. The report links each home gym and marks the host.

**Hosting record (gym page).** `lib/website/hostingRecord.ts`: `buildHostingRecord(shows, today)` splits a gym's linked
shows into upcoming and past (completed, or dated before today and not live), newest past first, with a first-show date
and a `reportable` set (completed shows with results on ZeroTacky). Gym page section redrawn as "Hosting record (N)", aside
"N shows since <date>", a "Post-meet report" key on reportable rows, external listings link out. Empty copy points
promoters at the Listing tab's host gym picker. #16 "visiting athletes" folded in here: the gym page is that detail.

Tests: `test/meetReport.test.mjs` (6), suite 698 pass, tsc clean. Staging UI (`shots/report1.py`, `report2.py`,
screenshots `~/Downloads/zt_ui_1108/`: `report_full`, `report_header`, `gym_hosting_record`, `show_report_key`):
dryrun2 report rendered 13 / 13 / 0 / 5 / 3, five podiums with T2 and T1 ties, three event-winner rows, origins "0 of
13 linked"; Hercules Gym page showed "Hosting record (2) · 2 shows since Sat 24 Oct 2026" with two report keys. The two
dryrun meets were pointed at Hercules Gym and listed publicly for the probe and reverted afterwards.

Left on purpose: no per-athlete origin list (counts only, privacy); the report reads live each time, nothing is
stored or versioned; no PDF export (Print covers it); event winners list every tied first as its own entry; upcoming
shows have a report URL but it only shows the banner and the field strip.

## Feature gaps #11: results archive import (11/9, migration 050)

**License.** strongmanresults.com publishes its data under CC BY 4.0, so we can import it with attribution; the
scoring behind it comes from Iron Podium. openstrongman.org is CC0 (elite international shows only) and is not loaded
yet. Credit line everywhere the archive shows (`ARCHIVE_CREDIT`): "Archive results via strongmanresults.com (CC BY
4.0); original scoring published on Iron Podium. ZeroTacky is not affiliated with either." Kurt approved the wording.

**Data.** `supabase/050_archive.sql`: `archive_sources` (seeded `sr`, `os`), `archive_competitions` (slug
`sr:<date>:<slugified name>`), `archive_placements`, `archive_results`, `archive_links` (an athlete's claim on an
archive name key; pending / approved / rejected, one approved owner per key). Public read on the data tables, own-read
on links. Helpers `zt_archive_norm` (name key), `zt_archive_competitions_json`, `zt_archive_athlete`,
`zt_archive_for_username`; materialized view `archive_athletes` (21,018 distinct name keys, refreshed by the loader)
behind `zt_archive_search` (65 ms on staging). Claims: `zt_archive_claim` (max 3 pending per user),
`zt_archive_withdraw`, `zt_my_archive_links`; admin `zt_list_archive_links` and `zt_decide_archive_link` (through
`zt_require_admin`).

**Loader.** `~/.aki/tmp/zt/archive/load_sr.py`: `uv run python archive/load_sr.py [--ref staging|prod] [--years ...]
[--no-fetch] [--batch 1500]`. Fetches the strongmanresults CSVs into `archive/snapshots/<stamp>/`, writes SQL batches
through a temp file (Windows argv cap), refreshes the matview at the end. Full staging load: 1,714 competitions, 59,772
placements, 291,248 event results in 193 s. 220 orphan result rows belong to one show ("Wildcard Strong" 2023-04-29)
missing from the source placements file; left as is.

**Surfaces.** `lib/website/archive.ts` (types, `normalizeArchiveKey`, `sanctionLabel`, `formatArchivePlace`,
`formatArchiveResult`, `summarizeArchive`, `dedupeArchive`, `nameSimilarity`, RPC wrappers). Athlete page: "Archive
history" after Show history (`components/website/ArchiveHistory.tsx`, one row per competition with a `<details>` for
events, credit line under it). Account page: "Archive results" (`ArchiveClaimSection.tsx`): Find my archive results,
search by name, "This is me", then Waiting on review / Withdraw. Admin: `/website/admin/archive`
(`AdminArchiveClient.tsx`) lists requests with a Names match / close / differ chip and Approve / Reject.

Tests: `test/archive.test.mjs` (8). Staging UI (`shots/archive1.py`, screenshots `~/Downloads/zt_ui_1109/archive_*`):
"kurt pollack" searched to one hit (2 comps, NJ and PA), claim went to Waiting on review, admin row showed the chips,
Approve put two rows and the credit under Archive history on `/athletes/slate_staging`. That approved link is still on
staging.

Left on purpose: archive rows feed the athlete's history, not competition bests (the source has no implement weights,
so there is nothing load-based to compare); matching is by normalized name key only, no fuzzy merge (the admin chip is
the hint); refresh is by hand (`--ref prod --no-fetch` after a fetch) until a cron exists; OpenStrongman is a seeded
source with no loader.

## Meet transfers (11/9, migration 051)

Kurt builds meets for other promoters and runs them alongside, so a meet needs to move to another owner account
without a database edit. `supabase/051_meet_transfers.sql`: `meet_transfers` (one pending per meet),
`zt_request_meet_transfer(p_meet_id, p_username)` (owner only, by @username, not to yourself),
`zt_cancel_meet_transfer`, `zt_respond_meet_transfer(p_id, p_accept)` (recipient only; on accept `meets.owner_id`
moves, the recipient becomes the `owner` member and the sender is kept as `admin` so they can keep editing),
`zt_my_meet_transfers` (incoming / outgoing / settled in the last 30 days), `zt_meet_transfer_state`.

Promoter Meet tab: "Ownership" block (`components/promoter/TransferSection.tsx`): the owner types a @username and
sends; a pending request shows who and when with Cancel; non-owners see the owner's name only. Account page: "Meet
transfers" (`components/website/MeetTransfersSection.tsx`): Accept / Decline incoming, Cancel outgoing, settled list.
Helpers in `lib/website/meetTransfers.ts`.

Tests: `test/meetTransfers.test.mjs` (3), suite 709 pass, tsc clean. SQL probe (`transfer_probe.py`) covered owner
only, no self transfer, one pending per meet, accept moves owner and demotes sender, decline and cancel. Staging UI
(`shots/transfer1.py`, screenshots `transfer_owner_form`, `transfer_pending`, `transfer_incoming`,
`transfer_member_view`) moved Iron Harbor to @jess_test and back; staging reverted afterwards.

Left on purpose: no email or Slack notification on a request (the recipient sees it on their Account page); no transfer
of host-gym links or sponsor blocks beyond what rides on the meet row; settled history is 30 days.

## Type pass (11/9)

Kurt: desktop body type read light and small. Red Hat Mono 500 added (`public/fonts/red-hat-mono-latin-500.woff2`,
latin subset), `--font-weight-normal` and `-medium` now 500 and `-light` 400, `[data-zt-sheet]` body weight 500. Desktop
(`min-width: 1024px`) scale bumps the sheet `text-[10..17px]` and `text-xs / sm / base` utilities one step (13 to 15 and
so on) inside `app/globals.css`. `Cap` labels are bold and `SectionCap` no longer forces normal weight. Gym card key
reads "Gym details" (was "Equipment details"). The "Group N had X finisher(s); unoccupied podium places are not
invented" note is gone from the show page; an empty podium slot speaks for itself. Screenshots `gym_card`,
`gym_page_desktop`, `account_profile_desktop` in `~/Downloads/zt_ui_1109/`.

Left on purpose: account form inputs still weight 700 (pen blue); may drop to 500 if they read heavy next to the
bolder labels.

## Ownership invites by link (11/9 evening, migration 052)

Kurt: "send them a link that creates an account and automatically gives them ownership without having to submit a
claim." `supabase/052_invites.sql`: `invites` (64-hex token, kind gym | meet, target, creator, optional label, 14-day
expiry, redeemed / revoked stamps; status is derived, never stored). `zt_create_invite` (gym: admin; meet: owner or
admin; 30 per creator per day), `zt_revoke_invite`, `zt_list_invites` (creator's open + 30-day settled for one target),
`zt_invite_preview` (anon-callable: who, what, status; no token echo, no ids beyond the public slug),
`zt_redeem_invite` (signed in; refuses the creator's own link, expired, withdrawn or used links; a redeemer re-opening
gets `already`). Gym redeem: `gyms.owner_id` + `claimed`, other pending claims close (same as approve), profile
`is_gym_owner` on. Meet redeem: `meets.owner_id` moves, recipient is the `owner` member, creator is kept as `admin`
(051 pattern), any pending 051 transfer cancels, profile `is_promoter` on. Sibling open invites for the same target
are spent on redeem. Verify: `select count(*) from pg_proc where proname like 'zt_%invite%'` = 6 plus the two helpers.

Surfaces: `components/website/InviteLinks.tsx` (shared; `theme` picks promoter zt-* tokens or website ink/pen):
intro, each open link with Copy / Withdraw and days left, "Who it is for" label, settled list. Promoter Meet tab
Ownership block gets it under the @username transfer form (owner only). Public gym page gets an admin-only "Admin ·
invite the owner" section (`GymInviteAdmin.tsx`; renders nothing for everyone else, so the server page is unchanged
for visitors). `/invite/<token>` (`app/invite/[token]/page.tsx` + `InviteClient.tsx`): headline "<inviter> wants you to
own <name> on ZeroTacky.", target card, then the sign-in form in sign-up mode with this page as the return path (the
same `returnTo` the registration page uses, so the confirmation email lands on /website/account and bounces back; no
Supabase redirect-list change needed). Signed in: redeem once, "It is yours.", Open My Gym / Open the meet.

Tests: `test/invites.test.mjs` (3), suite 712 pass, tsc clean. SQL probe (`invite_probe.py`): non-admin gym invite
refused, admin mint, anon preview, unknown token, own-link refusal, redeem, re-redeem `already`, third account "already
been used", non-owner meet invite refused, two meet links with one withdrawn ("has been withdrawn"), redeem moves owner
and keeps the inviter as admin. Browser (`shots/invite1.py`, `invite2.py`, screenshots `invite_*` in
`~/Downloads/zt_ui_1109/`): admin block on 5 Stones Fight Club, link minted on the gym page and on the Meet tab, signed-out
invite page with the sign-up form, sign-in on the invite page redeemed the gym, the same account redeemed the meet,
re-open "This one is already yours.", stranger "already been used", Kurt's Ownership block then read as admin. One
hydration error (#418) found and fixed: the server rendered the not-configured branch while the client rendered
"Checking…"; both now render "Checking…" and the not-configured text arrives through state. Staging reverted.

Left on purpose: no email from ZeroTacky, the creator copies the link and sends it; no co-owner or admin-only invites
(owner only); gym invites are admin-only since admins are who approve gym claims; an admin invite on an already-claimed
gym replaces the owner (the block says so); invalid or dead links point at the gym directory's Claim this gym.

## Adopt an archive show (11/9 night, migration 053)

Kurt: a promoter or gym owner should be able to "port in an old show from Iron Podium", "built out like it's a completed
meet for us, but there should be a disclaimer that says that the results were imported from iron podium or elsewhere."
`supabase/053_adopt_archive.sql`: `meets.imported_from jsonb` (source, sourceName, archiveSlug, competitionId, credit,
importedAt, importedBy) and `meets.imported_slug` (unique where set: one adoption per archive show), both readable by
anon; `meet_imported_placings` (meet, athlete, place, points, is_tied; public read). `zt_archive_competition_search(q,
limit)` (signed in; name, city, state or year; newest first; returns `adopted {slug, id, mine}` so the UI can say "Already
yours" or "Imported by another account"). `zt_adopt_archive_competition(slug, host_gym_id)` builds a completed, final,
listed meet owned by the caller: venue from city/state, federation from the sanction, divisions `imp-d<n>`, events
`imp-e<id>` typed best-fit from the archive event type and unit (`config.imported`, `importedUnit`, `importedType`),
athletes `imp-a<placement id>` with lot = place, every result locked with `importedPoints` + `importedDisplay` (and the
reps / time / distance / weight field that matches the unit), placings copied as published. 20 adoptions per account per
day. Slug is `name-year`, year skipped when the name already carries it (401 of 1,714 archive names do; caught on staging
as `boiling-point-2026-2026`), numbered on collision. `zt_my_meets` and `zt_get_my_meet` re-declared with `imported_from`.

Engine: `scoreSingleEvent` has an `event.imported` branch, ranks by the published points (shared place on equal points,
zero rows last with their mark, no pool split); `resultHasScore` counts an imported score. The public show page uses the
copied placings (`suppliedDivisionPlacements`), so overall standings match the source even where the source's total was
not the sum of its event points (620 of 59,772 placements).

Surfaces: `/promoter/import` (`ImportArchiveClient`; `?gym=` preselects the host gym): search, pick, optional host gym,
"Import as a completed meet", lands on the meet editor. Entry points: "Import a past show" on the promoter dashboard
(live backend only) and "Import a past show hosted here" on My Gym. Disclaimer: public show page gets an "Imported
results" block under the status banner with the credit ("Results imported from strongmanresults.com (CC BY 4.0);
original scoring published on Iron Podium. Not scored live on ZeroTacky.") and "Placings and marks are shown as the source
published them. Athletes can claim their results from this show like any other."; the promoter editor shows the same
credit as a note above the meet name with "Results are locked as published; the listing, host gym, sponsors and ownership
are yours to edit." Per-division label fixed on the way: "Official Final (Demo)" was hardcoded, now only demo fixtures say
Demo.

Tests: `test/adoptArchive.test.mjs` (5), suite 717 pass, tsc clean. SQL probe (`adopt_probe.py`): search, anon refused,
adopt Pennsylvania's Strongest 2026 (12 divisions, 5 events, 32 athletes, 160 results, equal to the archive), re-adopt
refused, credit present, caller is the `owner` member. Browser (`shots/adopt1.py`, `adopt2.py`, screenshots `adopt_*` in
`~/Downloads/zt_ui_1109/`): import flow for Boiling Point 2026, re-search reads "Already yours · open", public page
disclaimer and Novice Men placings (John Tribe 29, Andrew Jewell 27.5, Curtis Nicolo 27, archive truth), promoter note,
dashboard link. Dev-server gotcha again: Turbopack refuses the node_modules junction, run `next dev --webpack`. Staging
reverted (both adopted meets deleted).

Left on purpose: no un-import beyond the normal meet delete; no event weights or heads-up detail (the archive has none);
imported events are typed for display only and cannot be re-scored; one adoption per archive show, first come (transfer
or invite moves it); gym owners use the same page through the My Gym link rather than a gym-side import.

## Copy scrub: no insider context (11/10 morning)

Kurt, on the /shows intro ("such as Strongfest Groups 1–5"): "we need to go through and scrub the UI and copy for anything
like this that wouldn't make sense to a new viewer. No one else will have this context on strongfest", then "we can
delete the demo for strongfest. The actual competition on the page is there."

Removed: the `strongfest-2026` scorer preset (real Iron Podium roster, "All Out Strongfest 2026 / The Power Plant Gym"
in the Meet Setup chooser). `lib/presets/strongfest.ts` is gone; the seed lives on as `test/fixtures/groupsSeed.ts`
("Iron Harbor Groups Invitational 2026", id `test-groups-2026`, fictional names) because nine test files used it as the
five-group / two-station fixture. `getInitialSeedState('strongfest-2026')` now falls back to the default demo like any
unknown id; a device still holding that preset id reopens on the default demo. MEET_PRESETS is 5 (York + four website
demos). York preset: "Kurt Pollack" became "Cole Parrish".

Copy: /shows intro now "Shows can run traditional weight classes or inclusive strength groups, where athletes are
grouped by the weights they move rather than by bodyweight." (matches the show page's format label). Home: "whether the
show runs traditional weight classes or inclusive strength groups"; the "Shows in the Directory" blurb no longer
describes the demo fixtures (real shows lead the list), it says what a Demo mark means. Search placeholder "e.g. a show
name, Pennsylvania, Log Press, Circus Dumbbell...". Roster placeholders (Meet Setup paste box, RosterImport) no longer
start with Kurt's name.

Checked: tsc clean, 717 pass (same count; the nine fixture-using files repointed, four assertions renamed), /shows and
/website rendered copy read back. Left on purpose: the fixture id `demo-show-strongfest-2026` (Riverside Iron Fest) is
internal and renaming it would churn saved device state; comments that cite Strongfest as the design case stay; the
"Power Plant Volt" theme name stays (reads as a theme); `audits/*evidence.json` still hold the dry-run roster and are in
the repo (`dumps/` is gitignored).

## Which group fits me? (11/10, feature gaps #13 novice group picker)

Kurt: lean into strongman being open to people from the barbell / gym crowd without alienating their gyms; his sister
and her partner trained eight weeks from zero and had a great day. The picker is for them: no strongman numbers asked.
`lib/website/groupPicker.ts` (pure): three gym numbers (deadlift, any overhead press, "heaviest thing you can pick up
and walk with"), each event mapped to a lane from its name first, then its spec implement (bars by scoring type: a
max-weight axle is a press, a reps axle is a deadlift), the division's weight compared to the lane number (per-hand
weights doubled for carries, added-plate weights plus the empty implement). Bands: reps 0.75 / 0.9, max-weight opener
0.7 / 0.85, carries 0.8 / 1.0. A division fits when nothing is over, is a stretch when one event is over by at most 10%,
heavy otherwise, unrated when nothing could be compared (no weights, or no number for that lane). Ranking: fits first
with the heaviest fit on top (a capable athlete is not sent to the lightest group), then stretches lightest first, then
heavy, unrated last. Pulls, drags, time-only events and cells the promoter left empty are listed as not compared, never
guessed. `divisionGenderTag` reads gendered names so the panel can filter (All / Women's / Men's; unnamed groups stay in
every view). `parseLiftInput` takes "315", "140 kg", "140kg x 3"; `numbersFromPRs` seeds from profile PRs.

Surface: `components/website/GroupPickerClient.tsx` on the show page above Events & Weights, upcoming and live shows
with 2+ divisions (completed shows have standings to read). Collapsed by default ("Try it"); inputs with lb / kg,
gender filter when names carry one, PR seeding when signed in; ranked cards with a Suggested / Fits / A stretch / Heavy
for now / No weights tag, one plain sentence, event chips with the weight and verdict, "Register in <group>" carrying
`?division=<id>` into registration (RegisterClient preselects a known id, falls back to the first). Step 1 of
registration points back to the panel ("Not sure which one?"). Every sentence names the promoter as the one who places
athletes. Catalina-style shows with experience classes and no weights read "No target weights published for this group.
Ask the promoter, they can place you."

Checked: tsc clean, 724 pass (7 new: lanes, Riverside demo lands in Group 4 with Group 5 heavy and the truck pull not
compared, a stretch ranks above heavy, no numbers / no weights, per-hand and added-plate maths, parsing, gender tags).
Browser (`shots/picker1.py`, `picker2.py`, `~/Downloads/zt_ui_1110/picker_*.png`): Riverside ranked and filtered,
kg toggle, completed show hides the panel, Iron Harbor seeded the press from the staging profile's PR, men's filter
changed the suggestion to Novice Men with the "closest" note, Register key preselected Novice Men in step 1, hint
present. Staging deadline bumped for the probe and put back.

Left on purpose: bodyweight is not asked (weight-class names are not parsed into limits; the gender filter covers the
first-impression problem and the promoter covers the rest); no per-promoter band tuning; teams (054) will reuse the
panel unchanged since the unit of comparison is still one athlete's numbers.

### Addendum: division format gate (11/10 afternoon, migration 054)

Kurt, same day: the helper is for non-traditional classes only. A promoter sets a meet up as either standard weight
classes (kg) or custom groups / thresholds; a traditional show never sees "Which group fits me?".

- **Schema (054).** `meets.division_format` text, null or `'weight_classes'` / `'custom'`, public column grant (046
  pattern). Null = the promoter has not chosen, which is every meet before this migration. `zt_publish_meet` (024 body)
  and `zt_save_meet_config` (007 body) write it (`coalesce(incoming, current)`, so a phone that sends none keeps the
  server's choice); `zt_my_meets`, `zt_get_my_meet` (053 bodies) and `zt_public_meet_by_slug` (005 body) return it. The
  same two writers now carry `divisions.weight_cap_kg` (045): the dashboard save writes the payload value (null clears),
  the phone publish keeps the desk's cap when the payload has none. The teams migration is renumbered to 055.
- **Model.** `Meet.divisionFormat?`, `Division.weightCapKg?` (`lib/types.ts`); `MeetRow.division_format`,
  `DivisionRow.weight_cap_kg` with absent-stays-absent mapping both ways (`lib/sync/mapping.ts`); `normalizeState`
  keeps both (it rebuilds Meet and Division from an explicit key list, which is where the first probe lost the save);
  `PUBLIC_SHOW_MEET_COLS` and the scorer's `MEET_COLS` select it; `PublicShowSummary.divisionFormat`,
  `PublicRegistrationMeet.divisionFormat` + `divisions[].weightCapKg`.
- **Grouping style.** `resolveDivisionGroupingStyle(format, labels)`: weight_classes is Traditional whatever the names
  say; custom can never read as Traditional (class-like names show as Mixed); null keeps the 11/5 inference.
- **Gate.** `showsGroupPicker(show, eventCount)` in `lib/website/groupPicker.ts`: hidden for weight_classes, shown for
  custom, and for an unset meet shown only when the names do not read as weight classes. Completed shows and shows
  without events stay hidden as before. The /register step-1 hint follows `divisionFormat !== 'weight_classes'`.
  Consequence for existing meets: a show like Iron Harbor (Novice / Open / LW / HW names) hides the helper until its
  promoter picks Custom; the Riverside demo (Group 1..5) keeps it.
- **Promoter UI.** Meet Details step: "Division format" key group, Standard weight classes (kg) vs Custom groups /
  thresholds, one explanation line each, and a "Not set yet" note until chosen. Divisions step: when weight classes is
  on, each line gets a kg cap (20..300, draft input committed on blur / Enter, blank = open class, out-of-range snaps
  back) and the add placeholder says weight class; otherwise the placeholder reads "division or group".
- **Tests** `test/groupPicker.test.mjs` +3 (gate matrix, mapping round-trips incl. PostgREST numeric strings and the
  explicit-null clear, normalizeState); `test/fake_supabase.mjs` grant list + division_format. 727 pass, tsc clean.
- **Probes** (`~/.aki/tmp/zt/shots/format1.py`, `format2.py`; screenshots `~/Downloads/zt_ui_1110/format_choice_*.png`,
  `divisions_weight_classes.png`, `picker_custom_iron_harbor.png`, `register_weight_classes_no_hint.png`): unset Iron
  Harbor = no picker, Traditional label, no hint; dashboard pick Standard + cap 105 on Open Men LW, save, reload =
  both persisted, picker and hint gone; pick Custom, save = picker back, label Mixed, hint back (signed in, deadline
  open). Typing "1" into the cap is refused, "105" sticks. Staging Iron Harbor left at `custom`, caps cleared,
  deadline back to 2026-11-07.

- **Standard tables (Kurt, same afternoon).** `lib/divisions/standardClasses.ts`: Strongman Corporation 2026 (kg-only
  since 1/1/2026: women 57 / 64 / 73 / 82 / HW, men 80 / 90 / 105 / 120 / HW; masters tables differ and are not
  offered) and IPF (women 47 / 52 / 57 / 63 / 69 / 76 / 84 / 84+, men 59 / 66 / 74 / 83 / 93 / 105 / 120 / 120+;
  sub-junior / junior 43 / 53 not offered), both checked against the published pages on 11/10. Divisions step, weight
  classes on: table select + Women / Men toggles + "Add N classes"; names already on the meet are skipped (case-
  insensitive), heavyweight lands with no cap, every generated name carries a gender word the picker's filter reads.
  `addDivision` accepts `weightCapKg`. 4 tests in `test/standardClasses.test.mjs`; 731 pass. Probe `shots/format3.py`,
  screenshot `divisions_standard_quickadd.png` (men-only SC add, second tap disabled, IPF men then offers the 5 missing).

Left on purpose: USS and other federations' tables are not bundled (promoters type their own caps); the
format cannot be cleared back to unset from the dashboard (once chosen, it is one of the two); the weigh-in desk still
owns cap edits on meet day (`zt_desk_division_cap`), the Divisions step is for setup.

## Teams (11/10 late afternoon, migration 055)

Kurt: a division can be a team of N (the Catalina Strongman Mixer 4 partner format is the reference). Each teammate
registers and pays on their own; the team forms after registration. Defaults Kurt approved: start a team / join by code /
"find me a partner" opt-in on by default; the captain names the team, the promoter can rename it.

- **Schema (055).** `divisions.team_size` int 1..6 (1 = individual, the default for every existing division). `teams`
  (meet, division, name 2..60, join code unique per meet, 6 characters without 0 / O / 1 / I, captain, `athlete_id` =
  the one roster row the team competes as). `registrations.team_id` (set null on team delete) and
  `registrations.looking_for_partner`. RLS: staff and members read teams; every write goes through an RPC.
- **Rules (SQL, `supabase/055_teams.sql`).** `zt_team_create` (name the team, become captain), `zt_team_join` (code,
  same division, space left), `zt_team_leave` (refused once the entry is accepted: "ask the promoter"; the captaincy
  passes to the next member), `zt_team_rename` (captain or staff; the roster row is renamed with it),
  `zt_set_partner_flag`, `zt_team_up` (both athletes flagged; my team with space wins, then theirs, otherwise a new team
  named "First & First"), `zt_my_registration(slug)` (the signed-in athlete's live entry, team, and the partner board
  with first name + last initial; a team-division entry wins over an individual one in the same show). The 034 submit
  body takes `teamCode` and `lookingForPartner`; auto-accept shares the team's roster row. The 007 status body reuses the
  team row on accept (no second cap slot), clears `team_id` on decline / withdraw and deletes the row only when no other
  member is accepted. `zt_list_meet_registrations` returns `team_id`, `team_name`, `looking_for_partner`. Publish and
  config save carry `team_size`; save refuses shrinking a division below its largest active team. An individual with
  results cannot be moved onto a team. Checked on staging as two accounts (create, join, bad code, leave after accept
  refused, rename by non-captain refused, withdraw keeps / deletes the shared row, team up both ways, full team refused).
- **Model and API.** `Division.teamSize?` (2..6 kept, 1 dropped on load; the save sends a missing value as 1, so
  shrinking back to individual sticks). `RegistrationRequest.teamId / teamName / lookingForPartner`;
  `RegistrationSubmission.teamCode? / lookingForPartner?`; `Team`, `TeamMember`, `PartnerBoardEntry`,
  `MyRegistration`; seven `PromoterApi` methods (`getMyRegistration`, `teamCreate`, `teamJoin`, `teamLeave`,
  `teamRename`, `setPartnerFlag`, `teamUp`) as thin RPC wrappers, listed in the lazy-fixture method table. The preview
  backend has no accounts, so it answers "no entry" and refuses the actions with one line.
- **Promoter UI.** Divisions step: an Individual / Team of 2..6 select on every line, the athlete count reads "teams"
  for a team division, and one note explains the flow when any division is a team. Registrations list: under the
  division, "Team: <name>" or "Team of N, no team yet" (+ "looking for a partner").
- **Athlete UI.** Register step 1: the division radio reads "· team of N"; a team division adds a cell with the flow in
  one sentence, an optional join code (prefilled from a teammate's share link `?team=<code>`, uppercased) and the
  "Find me a partner" box (on). Step 3 review gets a Team row. After submit, and again at the top of the form on a
  return visit, `components/register/TeamPanel.tsx` (`zt_my_registration`): with a team, the card (name, Rename for
  the captain, "1 of 2 spots filled", code + Copy code / Copy link / Share… via the Web Share API when the browser has
  it, members with status, Leave while pending; accepted reads "ask the promoter"); without one, Start a team / Join a
  team / Find a partner (the flag, the board with Team up; Team up is disabled until the box is ticked).
- **Tests.** `test/teams.test.mjs` (8: mapping both ways incl. the explicit 1, normalizeState 2..6, updateDivision
  patch, public projection, registration row fields, the seven wrappers' parameter names, signed-out = null, preview
  refusal, share link) and the submit payload assertion in `test/supabaseApi.test.mjs`. 739 pass, tsc clean.
- **Probes** (`~/.aki/tmp/zt/shots/teams1.py`, `teams2.py`, `teams3.py`; screenshots `~/Downloads/zt_ui_1110/`
  `divisions_team_of.png`, `register_team_cell.png`, `team_panel_no_team.png`, `team_panel_captain.png`,
  `team_panel_member_full.png`, `team_panel_return_visit.png`, `team_panel_board.png`,
  `registrations_team_column.png`): temp division "Tag Team Open" (team of 2) on staging Iron Harbor; the select shows
  Team of 2; A registered, started Harbor Hogs, code issued; B opened the share link with the code prefilled, registered
  and landed on the full team (both auto-accepted, so Leave was hidden as designed); with B set back to pending: return
  visit shows the panel above the form, Leave worked, the board listed "Slate S. · Harbor Hogs, 1 open", a bad code
  surfaced the SQL message, Team up rejoined, the captain renamed to Harbor Hogs II, the promoter list shows the team on
  both rows sharing Lot #1. Temp rows removed, deadline back to 2026-11-07.

Left on purpose: no separate promoter Teams view (the registrations list carries the team; renaming from the dashboard
is the captain's or the SQL staff path for now); renaming the roster athlete in the scorer does not rename the team;
the team's results and standings are the existing single-athlete ones (one row, one lot); payments stay per athlete
with the promoter. IG-sized result cards and the gym "intro strongman sessions" tag are next.

## Astra GP audit fixes (11/10 evening, migration 056)

Thirteen findings on the 11/10 picker + format build, all fixed; the per-finding table is
`audits/astra-gp-2026-11-10-disposition.md`. The shape of it: the whole-meet phone publish no longer overwrites the
promoter's division format, the desk's kg caps or the dashboard's team sizes on an existing meet (056; a linked phone shows
those three controls read-only with a note); the registration hint uses the show page's own picker gate
(`groupPickerShown` in the public projection); the picker converts the on-screen numbers when lb / kg flips, keeps PR seeds
in pounds, ignores holds / throws / pushes / bench presses, doubles a per-hand carry after adding the empty implement, says
"above your comparison band" instead of "over your number", explains that timed events are compared by implement weight,
and its segmented controls work like native radios. Caps outside 20..300 are named before the database refuses them; the
fake public allowlist equals the staging grant and is asserted; a renamed standard class is not re-added. The medium-weight
Red Hat Mono file was replaced (it had lost every letter but A). 749 pass, tsc clean; staging repros and a 390 px browser
pass in the disposition file.

## Scoring audit vs Iron Podium (11/10 night, no migration)

Kurt: "scoring heuristics for strongman needs to match actual strongman scoring exactly ... the first question is going to be 'how do we know that the scoring is right' when all anyone has ever seen is Iron Podium." Report: `audits/slate-2026-11-10-scoring-vs-iron-podium.md`.

- **Method.** Iron Podium's docs (Strongman Point System, scoring formats, tiebreakers) plus nine finished 2025 scoreboards read from `ironpodium.com/api/get_scoreboard/<id>` (raw JSON in `~/.aki/tmp/zt/ip_boards/`). SC and USS publish no scoring text of their own; SC requires results on Iron Podium.
- **Matches already.** N-down-to-1, zero = 0, split points on event ties, distance+time, reps+time, time-only. Replayed Idaho 2025 Novice Men (6 athletes, 5 events) event-by-event: every point total equal.
- **Was wrong: the overall tiebreak.** Iron Podium's default is "lookback" (most 1sts, then 2nds, then 3rds, still level = shared place; bodyweight is the alternative). Ours was event wins then final-event points, which reverses a real 4th/5th in Idaho and splits a real shared 2nd at Red River. Fixed: `lib/engine/tiebreak.ts` holds the five rules (`lookback` default, `bodyweight`, `event_wins`, `final_event`, `none`) with labels; the engine, builder, scorer sheet and standings headers all read it. `StandingRow.placeCounts` carries the 1st/2nd/3rd counts. Existing meets keep their stored rule; new meets get lookback.
- **Also fixed.** `standingsAdapter` recomputed its own tie signature (points|wins|final) against its own header rule; it now reads the engine's `isTiedOverall`. `time_or_implements` scores a missing split at the cap, so "3 stones, no split" ties "3 stones @ 60.00" instead of sitting below it.
- **Open (report, items 1-5).** Wessels attempt tiebreak on max weight, hold events (longer time wins), max-distance display suffix, kg/m entry, "impl" wording on non-medley reps+time events. Supabase column default / publish coalesce still say `event_wins` (only used on a null the app never sends); fold into the next migration.
- **Tests.** `test/ironpodium_replay.test.mjs` (Idaho replay, Red River, QRF, bodyweight, normalisation, labels, missing split). showHistory test split into lookback default and event_wins variant. 762 pass, tsc clean.

## IG result cards (11/10 night, no migration)

Newcomer strategy step after teams: an athlete posts her finish to Instagram the night of the meet. Nothing new is stored; the card is rendered from the public show data on request.

- **Route** `GET /shows/<slug>/card/<athleteId>?size=square|story|link` (`app/shows/[slug]/card/[athleteId]/route.tsx`, nodejs). Sizes in `lib/website/resultCard.ts` `RESULT_CARD_SIZES`: square 1080x1080 (IG post), story 1080x1920 (IG/FB story, sheet inset 200 px top and bottom so the IG UI never covers it), link 1200x630 (FB post, link preview). 400 on a bad size, 404 on an unknown show, athlete, or an upcoming show. `&download=1` adds a Content-Disposition file name. Buffered, not streamed: a Satori layout error inside a streamed body came back as an empty 200 (seen 11/10; Satori wants `display: flex` on any div with more than one child, so every mixed-text line is one template string).
- **Data** `buildResultCardData(show, athleteId)` reads `buildDivisionResultsView` (the standings table's adapter), so the card cannot disagree with the table: place with T- when the engine says tied, "Nth of field" with the field from `scoringField` (same as the profile), total points, event wins, every event's mark / place / points, Official Final / Provisional / Live, DEMO badge on fixtures. Scratched athletes with no score get no card (the Share key is hidden for them); a scratch who scored reads "Scratched" / DNF.
- **Pixels** `lib/website/resultCardImage.tsx`: the og.tsx sheet (white sheet on the ground, ink rules, Red Hat Mono, wordmark with the Set Stone). `og.tsx` now exports `loadFonts`, `Stone`, `Wordmark` and the ink constants for both. Name shrinks to fit (`fitMono`), meet name clips with an ellipsis, event names use nowrap/ellipsis, the wide card prints the placings on one line instead of the table. `next.config.mjs` ships the TTFs with the route.
- **UI** `components/website/ResultCardButton.tsx`: `ResultCardToggle` ("Share card" / "Close") in a new last column of every standings row on the show page; the size strip (`ResultCardSizes`) renders under the table, outside the horizontal scroller, for the open row. Tap a size: fetch the PNG, `navigator.share({ files })` when the browser can share files (that is what lands in Instagram on a phone), otherwise a download with a note. Profile history rows carry the in-place button when the show is listed and the athlete placed (`ShowHistoryEntry.cardSlug`, `athleteId`).
- **Tests** `test/resultCard.test.mjs` (every placed athlete on every completed demo show matches the table; field size; T- label; nulls; sizes, hrefs, file names, ordinals; fitMono / clip). showHistory asserts `cardSlug`. 772 pass, tsc clean. Browser probe at 390 px (`shots/cards_probe.py`): 4 toggles, 3 keys, story download 104,808 bytes, note text; screenshots `~/Downloads/zt_ui_1110/card_*.png`, `show_row_*.png`.
- **Not done** a card on the live board (`/m/<slug>`), the promoter's "all podiums" sheet, and the profile button could not be probed locally (demo profiles carry no show history).

## Scoring audit follow-ups + account age rule (11/11, migration 057)

Closes items 1, 2, 3 and 5 of `audits/slate-2026-11-10-scoring-vs-iron-podium.md` and roadmap set-up item 5 (Kurt 11/11:
"13 rule and date of birth in sign-up, as a precaution"). Item 4 (kg / m entry) stays open on purpose: `maxWeightLbs`,
`distanceFeet` and the PR board / group picker / archive conversions are all unit-named, so a unit switch is its own build
with a payload migration, not a label swap.

- **`lib/engine/eventKinds.ts` (new)**: `SCORING_TYPES`, `normalizeScoringType`, `normalizeMaxTiebreak`,
  `normalizeImplementLabel` (1..12 chars, control characters out, "impl" = absent), `implementWord`, `usesTimeCap`,
  `scoringTypeLabel(ev, 'short'|'long'|'setup')`, `scoringRuleText`. The four private label maps (MeetSetupSheet,
  ShowDetailClient, prepSheet, briefing) and the TV spec line now read from here, so a new kind shows up everywhere at once.
- **Hold events** (`scoringType: 'max_time'`): one time, longer wins, cap ignored by the engine (the form calls it "Clock
  limit"). Pad: good = Drop (stamps the clock), no = No hold, "Hold time (s)" field; stop-and-stamp works like a finish.
  PR board ranks a hold by time ("41.30 s hold"); show history marks it finished whenever time > 0.
- **Wessels rule** (`EventDef.maxTiebreak: 'attempts'`): on a weight tie the earlier attempt wins. `bestLiftAttempt(r)`:
  typed `Result.maxWeightAttempt` > tape (`attemptLog` good + no-lift presses with a weight) > rising-bar grid (good/fail
  keys up to the best weight) > 0 = unknown, which ranks below any known attempt and ties another unknown. Display
  "270 lbs (att 2)" only when the rule is on. Pad shows "att n" under BEST and an "Attempt # of best lift" field.
- **Max distance** (`EventDef.distanceOnly` on time_or_distance): furthest mark wins, no "(DNF)", clock ignored, keys
  dead on the pad (the typed mark is the entry); lane 2 keeps only its distance field. Form checkbox under Time or Distance.
- **Implement word** (`EventDef.implementLabel`): standings print "3 stones @ 41.20s" / "0 stones"; pad qty cap takes the
  word; TV spec line "5 stones". Form field "Word for one (standings)" beside the count.
- `meetBuilder.applyKindFlags` runs on parse, add and update: each flag exists only on its own kind and arrives normalised,
  so a type change never leaves a stale flag in `events.config`. No new columns: flags ride in `config`, the attempt in
  the result payload.
- **Account age**: `lib/auth/age.ts` (`parseDob`, `ageOn`, `dobProblem`, `latestAllowedDob`, `isMinor`). Sign-up has a
  required date-of-birth input with `max` = today minus 13 years (the browser refuses younger dates before submit; the
  JS check is the fallback for a browser without date validation), sent as `date_of_birth` in the sign-up metadata.
  057: `profiles.date_of_birth date`, check `profiles_min_age` (13..120 years), owner update grant, `handle_new_user`
  stores it and raises "You must be 13 or older" on an under-age value (unparseable = null). Not in `zt_public_profiles`
  or `PROFILE_COLUMNS`; magic-link first sign-ins stay null. Privacy table row updated. Terms unchanged (already 13).
- 057 also sets `meets.tiebreaker_rule` default to `'lookback'` and re-creates `zt_publish_meet` (056 body) with the
  same fallback; `zt_save_meet_config`'s literal is unreachable and left.
- Staging: 057 applied; verify queries pass; constraint refused a 12-year-old date; the auth trigger stored 1990-05-05 and
  refused 2020-01-01 (probe inside a rolled-back DO block, 0 leftovers). Browser (`shots/formats_dob.py`,
  `Downloads/zt_ui_1111/`): sign-up DOB input max 2013-11-11, 2020 blocked (`rangeOverflow`), 2010 valid; event form
  shows the hold type, Wessels note, distance-only toggle and the word field, cancels with no draft, no page errors.
- Tests: `test/scoring_formats.test.mjs` (16), `test/age.test.mjs` (4). 792 pass, tsc clean.

## Gym intro strongman sessions tag (11/11, migration 058)

Kurt 11/11: "Start the gym intro-sessions tag." A beginner's first question to a directory is "who will teach me?"; the
listing now answers it. Three gym columns, one filter, one public section. Held item "#2 first-timer flag" (an athlete-side
flag) is a different thing and stays held.

- 058: `gyms.intro_sessions text default 'not_provided'` (yes | on_request | no | not_provided, check
  `gyms_intro_sessions_chk`), `intro_sessions_note` and `intro_sessions_url` (300 chars each). Select to anon and
  authenticated, update to authenticated (the owner RLS policy already scopes the row). `not_provided` is the silent default:
  the mapper leaves `introSessions` undefined and no page shows anything.
- `lib/website/types.ts`: `IntroSessions`, `StrongmanGymListing.introSessions / introSessionsNote / introSessionsUrl`,
  `GymFilterQuery.introOnly`. `supabaseGyms.ts` reads the three columns (`normalizeIntroSessions`, unknown = not_provided).
  `filters.ts`: `introOnly` keeps `yes` and `on_request`.
- Owner form (`MyGymClient.tsx`, fieldset "New to strongman" above Equipment): select, then note ("When, how much, who to
  ask") and link, shown only for yes / on_request. `myGym.cleanGymPatch` clears note and url for no / not_provided and runs
  `cleanUrl` on the link. `INTRO_SESSIONS_OPTIONS` carries the labels.
- Directory (`GymsBrowser.tsx`): checkbox "New to strongman: only gyms that run intro sessions"; `/gyms?intro=1` (or `true`)
  preselects it; reset clears it; card chip "Intro sessions" or "Intro on request" in pen colour. Blurb mentions the filter.
- Gym page (`app/gyms/[slug]/page.tsx`): section "New to strongman?" with the sentence for the answer (yes / on request / no),
  the note, the link ("Sign up or read more"), and for "no" a key to `/gyms?intro=1`. Hidden for not_provided.
- Staging: 058 applied, columns and grants verified. Browser (`shots/intro1.py`, `Downloads/zt_ui_1111/`): owner set
  Hercules Gym (Syracuse) to yes with note and link, saved; public page section with note and link; `/gyms?intro=1` checkbox
  on, one card with the "Intro sessions" chip; on_request shows "Intro on request"; reset to not_provided afterwards (row
  verified back to defaults). No page errors.
- Tests: `test/introSessions.test.mjs` (5: normaliser, filter, patch cleaning). 797 pass, tsc clean.

## kg / m units, session 1 (11/12, migration 059)

Kurt 11/12: "Build kg/m, option B, start session 1." Scope note in `audits/slate-2026-11-12-kg-m-scope.md`. Option B: a
meet picks its unit once and every number in that meet is stored in that unit; the engine never converts. Normalising to
one unit happens only where meets are compared (PR board, show history, trainFor), which is session 2.

- Model: `Meet.units?: 'imperial' | 'metric'`, present on the object only when metric (absent = imperial, like
  `divisionFormat`). Field names `distanceFeet`, `maxWeightLbs`, `courseFeet` keep their historical names; comments say
  "in the meet's unit". `lib/units.ts` holds everything unit-shaped: labels (`weightUnit`, `distanceUnit`, words),
  `DEFAULT_PLATES` (metric 25 / 20 / 15 / 10 / 5 / 2.5 / 1.25), `COURSE_MAX` (5280 ft, 1610 m), mirror helpers
  (`mirrorWeightLabel`: kg beside lb on an imperial meet, lb beside kg on a metric one), converters at 1 decimal.
- 059: `meets.units text not null default 'imperial'`, check `meets_units_chk`, select granted to anon and authenticated.
  `zt_publish_meet` and `zt_save_meet_config` validate the value and refuse a change when the meet has results;
  `my_meets`, `get_my_meet`, `public_meet_by_slug` return it. `meetToRow` always sends the normalised value, so rows never
  carry null. SQL guard 041 still caps course at 5280 as a backstop (1610 m fits under it).
- Engine: `scoreSingleEvent`, `calculateDivisionStandings`, `generateEventRunOrder`, `calculatePlateLoading`,
  `describeSetup`, `buildTransitionDeltas`, `normalizeEventSpec`, `validateEventSpec`, `specSegments`,
  `eventWeightDisplay`, TV `eventSpec`, prep sheet rows and the briefing all take `units` (default imperial) and only
  change their labels. Callers (`strongman-app.jsx`, Scoreboard, standings adapter, exports, TV model, show page,
  register page, prep sheet, pit crew) pass `meet.units`. Course validation on a metric meet: 1 to 1610, half-meter steps.
- Meet setup (`MeetSetupSheet.tsx`): new "Units" radiogroup under the collar field, inside a fieldset that is disabled once
  the meet has results ("Locked: this meet has results. Weights and marks stay in pounds and feet."). Switching converts
  nothing and resets the plate inventory to that unit's default set; the note says so. Collar label, plate buttons,
  `EventForm` labels (tare, collar, target, light tier, rising bar, course distance with `max`), `JudgePad` caps and
  override labels, `PitCrewSheet`, TV title "Units" field (lb · ft / kg · m), prep sheet CSV header all follow the unit.
- Tests: `test/units.test.mjs` (14): helpers, model and mapping round trip, engine labels in kg / m, metric plate load
  47.5 = 25 + 20 + 2.5, transitions, spec range, mirror label, TV spec line. Fixtures updated for the new column
  (`fake_supabase`, `grants` staging string re-read 11/12, `register` shape). 811 pass, tsc clean.
- Staging: 059 applied, default and grants verified, all ten meets `imperial`. Browser (`shots/units1.py`,
  `Downloads/zt_ui_1112/`): Iron Harbor (0 results) flipped to metric, kg plates and kg collar label, saved, metric
  after reload, Add Event shows kg / m with course max 1610; dryrun (39 results) fieldset locked with the lock note;
  Harbor reverted to imperial, row and plates back to the imperial defaults. One fix from the shots: the event-spec
  help text said "kilograms beside every weight" on a metric meet; it now names the mirror unit.
- Not in this session (session 2): PR board, athlete group picker, show history, result cards and `trainFor` still
  assume pounds and feet when they compare across meets; 053 adopt-result path needs the kg case. Session 3: metric meet
  end to end (register, judge, TV, show page, exports) in the browser, then an Astra audit.
