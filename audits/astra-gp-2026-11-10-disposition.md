# Disposition: Astra GP audit (group picker and division format), 2026-11-10

Audit: `audits/astra-2026-11-10-group-picker-division-format.md` on build `9aacc44c`. Timing note: the hold reached this
thread after `3e7fd23b` (teams, migration 055) was already on main and green, so the fixes below sit on top of 055 and
the SQL part is migration 056. Every finding is fixed; nothing was deferred. 749 tests pass (731 audited + 8 teams + 10
here), tsc clean.

| # | Sev | Disposition | Where |
|---|-----|-------------|-------|
| GP-01 | High | **Fixed (056).** `zt_publish_meet` on an existing meet keeps the server's `division_format` (`coalesce(meets.division_format, excluded.division_format)`); a never-chosen meet still takes the phone's value. Staging repro: `weight_classes` set, stale phone publishing `custom` left `weight_classes`; null then phone `custom` gave `custom`. On a phone linked to a published meet the format control is read-only with a note (`MeetSetupSheet.serverConfig`, set from `sync.link` in `strongman-app.jsx`). | `supabase/056_publish_server_wins.sql`, `components/scorer/MeetSetupSheet.tsx`, `components/strongman-app.jsx` |
| GP-02 | Med | **Fixed.** `PublicRegistrationMeet.groupPickerShown` is computed in `toPublicRegistrationMeet` with the show page's own gate (`showsGroupPicker` + resolved style + 2 or more divisions); step 1 shows the hint only when true. Both backends build through that projection. The two style functions moved to `lib/website/groupPicker.ts` (pure) and are re-exported from `supabaseShows.ts` to avoid a circular import. Browser: Iron Harbor (custom, 0 events) now hides the hint, matching its show page. | `lib/promoter/rules.ts`, `lib/promoter/contract.ts`, `components/register/RegisterClient.tsx`, 7-case test |
| GP-03 | High | **Fixed (056).** `weight_cap_kg = coalesce(divisions.weight_cap_kg, excluded.weight_cap_kg)`: the desk / dashboard cap wins over a stale phone; a division with no cap yet takes the phone's. Same rule applied to `team_size` (server's for an existing division; the dashboard save is the writer). Staging repro: desk 105 survived a phone republishing 90; team size 2 survived a phone sending 1; a new division took the phone's cap 80 and team size 3. The old-phone / missing-cap case still passes by construction. Caps and team size are read-only on a linked phone (same note as GP-01). | `supabase/056_publish_server_wins.sql` |
| GP-04 | Med | **Fixed.** `divisionCapProblems()` (20..300, named per division) runs in `validateMeet`, in the dashboard save before the RPC and in the phone publish before the RPC; the message names the class and the range. | `lib/meetBuilder.ts`, `lib/promoter/supabaseApi.ts`, `lib/sync/controller.ts`, test |
| GP-05 | Low | **Fixed.** Fake allowlist is the exported `PUBLIC_MEET_COLS`, equal to the staging anon grant read on 11/10 (31 columns, incl. `results_submitted_at`, `imported_from`, `imported_slug`). `test/grants.test.mjs` asserts exact equality with that list, that `PUBLIC_SHOW_MEET_COLS` and the scorer `MEET_COLS` are inside it, and that `staff` / `admin_pin` / `join_code` / `owner_id` are not. | `test/fake_supabase.mjs`, `test/grants.test.mjs` |
| GP-06 | Low | **Fixed.** `missingStandardClasses` also matches by gender + kg cap, and a renamed heavyweight by gender + capless open / HW name; a capless Novice does not stand in for the heavyweight; women's 105 does not satisfy men's 105. Divisions step passes caps. | `lib/divisions/standardClasses.ts`, `MeetSetupSheet.tsx`, test |
| GP-07 | Med | **Fixed.** `eventLane` returns `unknown` for holds, throws, tosses, pushes (a push press stays overhead) and bench / chest / floor / incline presses before any implement-word matching. Archive names from the report are the regression cases. | `lib/website/groupPicker.ts`, test |
| GP-08 | High | **Fixed.** Inputs are typed in the toggle's unit; switching converts what is on screen (`convertDisplayUnit`, explicit-unit text left alone). Browser at 390 px: 315 / 135 / 200 lb suggests Group 4; kg shows 143 / 61 / 91 and still Group 4; back to lb 315 / 134 / 201, Group 4. | `GroupPickerClient.tsx`, `groupPicker.ts`, test |
| GP-09 | Med | **Fixed.** PR seeds stay canonical pounds and are rendered with `lbToDisplay(lb, unit)`; bench / chest presses no longer seed the overhead field (GP-07 exclusion). | same |
| GP-10 | Med | **Fixed.** Card copy says "above your comparison band" (stretch and heavy); verdict label `Over` is now `Above band`; the ranking note says "closest of the N rated" and states how many groups have no weights and are listed last, unranked. The explanation under the cards describes the bands in plain words. | `groupPicker.ts`, `GroupPickerClient.tsx`, tests updated |
| GP-11 | Med | **Fixed.** `divisionWeightLb` adds the empty implement first, then doubles a per-hand carry: 100 lb per hand + 25 lb handle = 250 lb. | `groupPicker.ts`, test |
| GP-12 | Low | **Fixed.** `SegmentedRadio` for the unit and gender groups: one tab stop (the checked option), Arrow / Home / End move and select, Space selects. Browser: ArrowRight from lb selects and focuses kg; one `tabindex=0` in the group. | `GroupPickerClient.tsx` |
| GP-13 | Med | **Fixed (explanation side).** Timed and distance events are compared by their published implement weight; the panel now says so instead of claiming they are not compared. Chosen over excluding them because a timed yoke's weight is the comparison a first-timer needs; pulls and drags stay uncompared. | `GroupPickerClient.tsx`, test pins the behaviour |

Also from the report, recorded without a code change: the show detail route is served `no-store` on Vercel (the brief's
60-second stale window was wrong; the show list's 60 s caches only the format label) and `/register` reads the meet in
the browser.

Unrelated fix riding along (Kurt, 11/10): `public/fonts/red-hat-mono-latin-500.woff2` was a bad subset from the 11/9 type
pass (149 glyphs; the only letter was A, so medium-weight caps drew every other letter from the Consolas fallback and the A
stood taller). Replaced with the Google Fonts latin subset (231 glyphs, same as the 400 and 700 files).

Verification: `npx tsc --noEmit` exit 0; `bun test test/` 749 pass, 0 fail; 056 applied to staging with both stale-phone
repros; browser probes `~/.aki/tmp/zt/shots/gpfix1.py` to `gpfix3.py`, screenshot `~/Downloads/zt_ui_1110/picker_gpfix_390.png`.
Staging Iron Harbor restored (format custom, caps cleared, team sizes 1, deadline 2026-11-07, probe division removed).
