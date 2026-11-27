# ZeroTacky UI audit, part 2 merged with the build order (2026-11-27)

Part 2 is the signed-in review (promoter, gym owner, admin, plus the meet-day scorer): one reviewer (Fable), 35 findings, report `Downloads/ZT_Site_Audit_Part2_2026-11-27/Audit.md` with about 200 screenshots and `metrics.json`. It was run on the staging preview at the pass 1 build. This file merges it with what is left of part 1 (`audits/ui-audit-merged-2026-11-13.md`) into one build order. Merged by Slate.

Numbering: part 1 rows keep their numbers (row 7, row 23). Part 2 findings are **S1 to S35** (S for signed-in), in the report's own order.

## 1. Where the build stands

| Pass | Scope | State |
|---|---|---|
| 1 | Tokens: rules, caps, weight, measure, title bands, header, footer | Live, main `52b408cf` (11/19) |
| 2 | Phone directories: stacked show rows, gyms paged at 24, short intros, More filters, 44 px links (rows 1, 4, 13, 20) | Live, main `90bdf56a` (11/27) |
| 3 | Public page content order (rows 7, 8, 12, 14, 17, 19, 23, then 15, 16) | Not started |

Part 2 was written before pass 2 shipped, so it does not see pass 2. Nothing in it conflicts with pass 2.

## 2. What I checked before merging

Each part 2 claim that drives the order was checked against the code or the live site. The rest stand as the reviewer measured them and get reproduced at build time.

| Claim | Check | Result |
|---|---|---|
| Results pages may load zoomed out on a phone (pass 1 table, open question 2) | Production, true phone emulation (iPhone descriptor), probe `tmp/zt/shots/mobile_width.py` | **Confirmed, and it is live today.** Four show pages with a standings table lay out at 1,008 to 1,310 px on a 390 px phone (`/shows/all-out-strongfest-2026` at 1,137). Part 1 row 9 was marked fixed in pass 1 and was not: the pass 1 probe never loaded a page with a results table. Cause and fix in section 3. |
| S27, the scorer's bottom key strip does not stay put | Scorer demo on the local build at 375×667 and 390×844 | **Confirmed.** GOOD REP and NO REP sit at y 732 to 844 and the strip at y 860 on load. On a 667 px phone both keys are below the fold; on an 844 px phone the strip is. The strip is `sticky` inside a wrapper that is only as tall as itself (`ScorerShell.tsx`, `ScorerNav`), so it has nothing to stick against. |
| S3, native controls draw dark on the bright page | `app/globals.css` | **Confirmed in code.** `color-scheme: dark` is set by the steel theme block (line 186) and the bright web sheet does not reset it. |
| S5, disabled pen keys are a pale tint | Code search | **Confirmed.** `disabled:opacity-40` appears 39 times in 18 component files. Part 1 row 25 fixed `/join` only. |
| S30, TV keys go live on tap | `components/scorer/LiveControl.tsx` | **Confirmed.** Both key groups call `driveTv` directly from `onChange`. |
| S1, 9 px labels in the builder | Code search | **Confirmed.** `text-[9px]` is in `MeetSetupSheet.tsx` (13), `RosterImport.tsx` (7) and other scorer parts, which the promoter editor tabs reuse. |
| S19, a completed unlisted show 404s | `lib/website/data.ts` (migration 037 rule) | **By design, with a gap.** An unlisted meet keeps its show page only once its results are marked submitted to the federation. The dry run was never submitted, so it 404s. The finding stands as "nothing on the dashboard says so". |
| S22 and S23, admin claims | `AdminClaimsClient.tsx` | **Confirmed.** `break-all` on the claimant block, `toLocaleString()` dates, the disabled reason only in `title`. |
| S12, location formatter | My pass 2 screenshots | **Confirmed and wider.** The phone show row reads "Oslo Not provided" and "Not provided" as a venue. Same formatter. |

## 3. Fixed while merging: results pages on phones

The standings table has a "Share" column whose header is visible only to screen readers. That element is absolutely positioned, the table's scroll wrapper was not, so the element escaped the wrapper and made the whole document as wide as the table. A phone then loads the page zoomed out.

The fix is one class (`relative`) on every horizontal scroll wrapper on website, legal and promoter pages: `ShowDetailClient.tsx` (two), `PrepSheetClient.tsx`, `MarkdownBlocks.tsx`, `CheckInDeskSection.tsx`, `RegistrationsSection.tsx`. A test in `test/directory.test.mjs` fails if a wrapper in those files loses it. On the local build the probe passes on 26 pages, including the Scarlet results page that was 1,413 px wide. Tests 857 to 858, tsc clean. **Built locally, not pushed.**

## 4. Overlaps between part 1 and part 2

| Part 2 | Part 1 | How they merge |
|---|---|---|
| Pass 1 table, standings overflow | Row 9 | Section 3. |
| S5 disabled keys | Row 25 | One disabled grammar for the whole site, the scorer's hatch. |
| S18 three views of one meet's results | Row 23 podium and standings repeat | Build once: the report's stats and podium blocks become the shared results layout. |
| S9 account hub | Row 19 account intro | The hub strip replaces the intro. |
| S12 and the title band copy | Row 5 title band (pass 1) | "REGISTRATION: REGISTRATION OPEN" and the trailing comma are pass 1 leftovers. |
| S17 clipped check-in table, S32 station keys | Rows 1 and 20 (pass 2) | Pass 2 covered public directories only. Both stay open. |
| S13 one status function | Row 14 status repeated three to four times | The function comes first, then the repeats go. |

## 5. Build order

Five groups. Effort is the reviewer's (S or M per finding).

**A. Defects and pass 1 corrections (all S, one session, website only).** Things that are wrong today.
- Section 3 fix (ready).
- S3 native controls in light scheme on the bright sheet. An unchecked box reads as checked.
- S4 grey slabs in ruled grids with an odd cell count (pass 1 overshoot).
- S2 placeholders in muted 400 with "e.g."; values in ink in both modes.
- S12 location formatter and the title band copy; REG FORM key only while registration is open.
- S6 the reason a key is disabled printed under it. S23 admin dates and `break-all`.
- S24 waitlist state in the band and on the final key, and S26 one fee sentence, because both mislead an athlete today.

**B. Meet day (scorer and judge pad; its own pass because pass 1 fenced the scorer off on purpose).**
- S27 fixed bottom strip and a fixed GOOD REP / NO REP bar. S28 both keys solid. S29 LOCK SCORE in pen.
- S32 ruler hidden under 600 px, select cells as the hit area, station keys to 44 px. S34 total in ink bold. S33 short step labels. S35 role picker.
- S30 and S31 TV keys, after decision 1 below.
- This changes what judges hold on meet day. It ships only after a full dry run on two phones, and the EO-H1 caution applies again until the build is on every phone.

**C. Pass 3 as planned (public content order), plus what part 2 adds to it.**
- Rows 7, 8, 12, 14, 17, 19, 23, then 15 and 16.
- S13 one status function (dashboard, title band, register, scorer title block), built first because row 14 depends on it.
- S25 inline validation on register step 1. Public half of S18 with row 23.

**D. Signed-in forms (one editable grammar, one save model).**
- S1 one `Field` and one `Value`, the five builder tabs ported (M). S5 hatch for disabled keys. S16 toggle states.
- S7 one sticky save bar per meet with dirty dots (M). S8 the same bar on Account and My Gym. S10 the colour warning as one line with a fix key. S14 one header line and one heading tier.

**E. Signed-in structure.**
- S11 dashboard triage, sorted with a "Needs you" line (M). S9 account hub strip (M).
- S15 five tabs in the meet editor (M). S17 Meet Day on a phone (M). S18 Results tab (M).
- S21 admin band. S22 Remove Listing moved and a "Decided, last 7 days" list with undo (M). S20 import keys and gym band. S19 dashboard line for hidden results.

**Recommended order: A, B, C, D, E.** A is live defects. B is ahead of C because a judge who has to scroll before every call is a scoring risk and the fix is small; it is behind A only because it needs the dry run. D before E because E's new layouts should be built from the one field grammar.

## 6. Decisions for Kurt

| # | Question | My default |
|---|---|---|
| 1 | TV keys (S30): apply on tap, or wait for Publish? | Keep apply on tap, add a "TV now: Sheet A · Bright" line and a mark on the selected key, move Publish Update away from them. |
| 2 | Unlisted completed shows (S19): should results be reachable before they are marked submitted? | Keep the 037 rule. Add the dashboard line "Results hidden: unlisted" with a one-tap fix. |
| 3 | Account roles: self-declared, or derived from what the account does? | Keep self-declared (they drive the opt-in directory). Show the derived facts in the hub strip. |
| 4 | Judge pad offline: run a throttled-network pass? | Yes, inside group B. |
| 5 | Phone nav row still scrolls sideways (left over from pass 2). | Wrap to two rows of three on phones. Needs your eye first. |
| 6 | Part 1, still open: is the gym directory meant to be browsed without a zip? Is Resume the only third key on `/`? | Unchanged. |

Open question 2 in the report (does the results page load zoomed out on a real phone) is answered by section 2. After the fix ships, open `/shows/all-out-strongfest-2026` on your phone once to confirm.

## 7. Keep list (part 2 adds)

- Scorer: the hatched disabled key, judge pad digit sizes (88 px rep count, 44 px clock), the size of the GOOD REP and NO REP keys, standings density, and the locked-score state with its next-athlete key.
- Results: the report page layout.
- Register: step chips and the computed age line.
- Admin: the claims copy ("typed into the form, unverified"), the shows queue's "Listed or hidden, last 7 days" with undo, and the red Delete Meet block.

## 8. Staging data the review changed

For anyone comparing counts later: one ownership claim rejected (Albany Strength), one listing report marked handled (5 Stones Fight Club), one submitted show listed (Keystone Iron Classic 2027). The dry run was listed and then unlisted again; the Metric Test Open TV board was set to Sheet B by a mis-tap and set back. No registration submitted, nothing deleted.
