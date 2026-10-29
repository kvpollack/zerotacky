# Astra audit brief: scorer polish release (2026-10-26)

Audit request from Slate (Kurt's assistant). Everything below is live on prod at main `b8fc2a78` (= v2 `e8277b75`). The 10/21 freeze audit (`audits/astra-2026-10-21-freeze-disposition.md`) is the baseline; this set is what shipped after the 10/24 meet. 389 tests pass, tsc clean. No new SQL in this set except migration 023 (Show History), which is listed for completeness.

## What to audit (in priority order)

1. **Collar weight per event** (10/26). `EventDef.collarWeightPerPair?` rides in `events.config` (jsonb, no migration). `lib/engine/plates.ts` uses the event value; the meet value (`meet.collarWeightPerPair`) is the fallback for events built before this shipped. EventForm shows the field only for 2- and 4-point loads, prefilled from the meet default on a new event; 0 on the event means no collars even if the meet says 5. Meet tab field relabeled "Default Collar Weight / Pair". Files: `lib/types.ts`, `lib/engine/plates.ts`, `lib/meetBuilder.ts` (addEvent prefill, sanitizer clamps >= 0), `components/setup/builder/EventForm.jsx`, `EventsSection.jsx`, `MeetSection.jsx`, `components/setup/MeetSetup.jsx`, `components/promoter/PromoterMeetDetailClient.tsx`, `lib/website/firstShow.ts`. Questions: does a judge phone that pulls config after the promoter changes one event's collar see the new load? Does an event saved with loadingPoints 1 or 0 correctly drop the field to 0? Any path where `collarWeightPerPair` could be a string?

2. **Event form locks the other tabs** (10/26; promoter editor only). While an EventForm draft is open, `requestTab()` in `PromoterMeetDetailClient.tsx` refuses any tab but Events (click and arrow keys), turns the sticky bar red, moves focus to it, and shows "The other tabs stay locked until you do." The bar gained "Discard draft" (closes the form through a `closeFormSignal` counter prop on `EventsSection`). Questions: keyboard-only and screen-reader experience of the refusal (aria-disabled on tabs, aria-live on the bar); can the lock strand a promoter (form open, Events tab somehow hidden)? Does Discard draft lose anything the promoter would expect to keep?

3. **Promoter build order** (10/26). Tabs are now Meet, Divisions, Events, Stations, Listing, Registrations, Athletes, Meet Day. Rationale: weights are per division, stations order events, entries open from Listing, accepted entries land on the roster. Offline Setup (`components/setup/MeetSetup.jsx`) swapped Events/Stations the same way. Section headings take a `sectionNumber` prop (Events/Stations/Athletes). DivisionsSection "step 3" references became "step 4". First-show guide (`lib/website/firstShow.ts`) reordered; its "step N" cross-references were checked (6 = Listing, 7 = Registrations, 9 = Meet Day). Questions: any remaining hard-coded tab or step numbers in copy, help text, or the `/guide/*.png` alt text? Does the new order break any readiness check or empty-state hint that assumed the old sequence?

4. **Pit crew transition card, DR-05** (`components/pitcrew/PitCrew.jsx`). Badge now reads "Next group: X" (or "Next: Ev N • X"), the next-lifter line is labelled "Still in <current group>", and the change rows are headed "When <group> starts". Question: is the two-"next" confusion actually gone on a 375 px phone, and does the header badge still fit beside the title at that width?

5. **No Resume card after Final** (10/26). `SyncLink.competitionStatus` cached on every `pull()` (`lib/sync/controller.ts`); `readResume()` in `lib/landing.ts` returns null for completed/cancelled; `refreshResumeStatus()` does one anonymous `meets` select per splash visit and writes the status onto the link; `components/shell/RootLanding.tsx` drops the card when it comes back true. Empty rows or network error leave the card alone; a reopened meet brings it back. Questions: does the anon select work under the current `meets` RLS for a meet the phone joined by code? Any flash of the card before the live check resolves, and is that acceptable?

6. **Scoring: withdrawn athletes with no scored result** (shipped with 023). `scoringField()` / `resultHasScore()` in `lib/engine/scoring.ts`: such athletes leave the points field (N), placed N+1 with 0 pts. Question: any division or tiebreak path that still counts them?

7. **Show History (023), for completeness.** Table `athlete_accounts`, trigger `registrations_link_account`, RPCs `zt_link_athlete_account`, `zt_meet_athlete_accounts`, `zt_athlete_show_history`; promoter Linked Accounts section under Athletes; public athlete page section. Already in use on prod (Kurt linked `sf-ath-13`). Lower priority: audit the RPC permission surface if time allows.

## Out of scope
Show page "(Demo Results)" suffix (trivial, shipped `cd0cc9ea`). Migration 024 (`p_key` drop) and Astra LATER items MS-12/13/14 are the next release, not this one.

## How to test
- Staging (v2 branch, Supabase ref `hryiqiopkihkcrkdyllg`): https://zerotacky-git-v2-kvpollack-6654.vercel.app . Staging promoter login (test account, owns fixture meet `23da26d1-…` Iron Harbor Classic): slate.staging@zerotacky.com / `Zt-staging-2026!`. Staging dry-run meet `da868c90-7d0d-4413-ae1d-d933a8f47ebc` is Completed/Final (good for item 5). Promoter editor fixture meet `23da26d1-3694-463f-90bc-99ef608def31` (items 1 to 3).
- Offline scorer with demo data: `/scorer?demo=demo-show-strongfest-2026` (items 1, 4).
- Tests: `bun test test/` from the repo root. New tests this set: `test/landing.test.mjs` (resume + refresh), `test/controller.test.mjs` (status cache), `test/engine.test.mjs` (collar override), `test/sync.test.mjs` (config round trip), `test/meetBuilder.test.mjs` (prefill/clamp).

## What I want back
Same format as 10/21: a table with ID, severity (SHIP / DAY-OF / LATER), finding, and your suggested fix, written to `audits/astra-2026-10-26-polish-findings.md`. I will answer with a disposition file and fix every SHIP item before the next release.
