# Astra audit: station event order and Roster Order

**Verdict: merge after listed fixes, not as is.** The new engine produces the expected athlete order on both stations, and the station override survives the exercised sync and reload paths. The rollout is unsafe with old scoring or publishing phones. Pit Crew also chooses the wrong next division under **All**, which can give the loader another station's weight.

## Findings and disposition

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| EO-H1 | HIGH | Mixed builds disagree on station order and Roster Order; an authorized old editor can erase the override | Open rollout gate. Update and verify every scoring/publishing device before enabling the feature |
| EO-M1 | MED | Pit Crew under All takes the next division from the whole meet, not the current station | Open source fix for Slate; retest the All cases below |
| EO-L1 | LOW | Setup still promises that Ev 1 always runs in lot order | Open copy fix |
| EO-L2 | LOW | Station position tag is clipped in the closed event picker at 375 px | Open UI fix |

No source fixes were made during this audit. The HIGH was reported in chat as soon as the old/new mismatch and authorized overwrite were verified.

## Scope and version

- Requested build: **`d090cf88c58a9c0054ee915436df4bf809a74f3a`**. Initial source fingerprint: **291 tracked blobs, zero mismatches**. Final fingerprint found six concurrent website/account-file changes, listed below. All remaining tracked blobs, including the event-order engine, scorer, setup and sync code, still matched the requested build.
- Actual browser target: `https://zerotacky-git-v2-kvpollack-6654.vercel.app/scorer`, staging Supabase **`hryiqiopkihkcrkdyllg`**. The preview alias can move; the source fingerprint is not deployment-byte attestation.
- **320 project tests passed, 0 failed, 27 files.** Separate TypeScript `--noEmit --incremental false` run exited 0 without diagnostics.
- Independent checks covered all **54 combinations** of three-event permutations, target positions and run methods, plus malformed orders, missing stations, builder normalization and the requested two-station examples.
- Used one newly created **disposable audit** meet, `astra-event-order-04e390d5`, with five fictional Audit Groups and 15 fictional athletes. Did not score or modify the shared Strongfest staging copy. No production requests, SQL, schema changes, source/config edits or delegation.
- Two isolated headless Chrome contexts at **375 × 812** exercised the preview. The main sync run seeded the documented local state/link shape with real account/PIN-issued authority. A separate ordinary `/join` check covers the user-facing join path. External hosts other than the preview and staging backend were blocked; `vercel.live` was blocked intentionally.
- Evidence: `audits/astra-2026-10-21-event-order-evidence.json`. Reproduction harnesses and screenshots are retained at `~/.aki/tmp/astra-event-order/`.

## EO-H1: mixed-build rollout is unsafe

**Evidence level: exact pre-feature source execution plus staging permission/write probes. No production mutation or live old-deployment browser test.**

Fetched the five relevant files from pre-feature main **`7ed5033b9feeadde34129a9cf89d5486b03d6310`**. Its `rowToMeet` keeps only `{id,label}` for stations. Its `normalizeState` also strips `eventOrder` and normalizes `lot_order` to `reverse_overall`. The old generator's unknown-method branch behaves as reverse overall even before a reload. Temporary harness copies repointed runtime imports to the existing local helpers; the old parsing and run-order logic itself was unchanged.

With lots **1, 2, 3** and keg scores **7, 2, 10**:

| Scenario | New build | Old source |
|---|---|---|
| Station B basket after keg, reverse overall | 2, 1, 3 | 1, 2, 3 |
| Truck under Roster Order | 1, 2, 3 | 2, 1, 3 |

A join code or judge PIN does **not** authorize configuration saves. On the disposable meet:

- Anonymous `zt_save_meet_config`, with join code and with a valid PIN grant: **401 permission denied**.
- Signed-in nonmember with the valid grant: **400, no permission to edit**.
- Anonymous `zt_publish_meet` with the grant but no publish key: **401**. Signed-in nonmember: **403, belongs to another promoter**.
- Owner `zt_save_meet_config` with a legacy-shaped stations payload: **200**; subsequent server read confirmed Station B's `eventOrder` was gone. Restored the station override before phone testing. This dashboard RPC also sets `is_demo=false` (`007_gate_fixes.sql:448`), so the initially demo fixture became a real-flagged test row. It remained unlisted and registration-closed; the entire disposable meet was deleted after testing.

The brief's tentative PIN-gating explanation needs correcting. Dashboard configuration saves are **account owner/member gated**, not PIN gated. Phone configuration publishes use **`zt_publish_meet`**, not `zt_save_meet_config`, and require account membership or a legacy publish key. An ordinary joined judge cannot wipe the override simply by scoring. A publishing-capable old promoter can.

`hooks/useMeetSync.js:175–200` auto-publishes configuration for publishing links. `lib/sync/controller.ts:452–460` only pulls remote configuration into **device** links; an existing admin/publishing link keeps its local configuration. Refreshing an old promoter page alone therefore does not establish that its stored meet settings are correct.

**Required rollout procedure:** stop scoring/config edits; close or refresh every old scorer, pit-crew and publisher tab onto the new deployment; use one authoritative promoter to set Station B and Roster Order; rejoin or explicitly reconcile other publishing phones before allowing them to publish. Verify the actual station picker order on every judging phone, and verify unchanged roster order with scored disposable test data before switching to the real meet. Never put audit scores into Strongfest. Do not rely on a green sync dot. If this coordinated check cannot be done before the test block, keep global order and defer the feature.

A legacy-key publish was not exercised in this round. Its authorization route is established by the source, not a new live key test. The dashboard timestamp guard protects a stale revision, not an old client that loads the latest revision but discards unknown fields.

## EO-M1: All gives Pit Crew another station's next setup

**Evidence level: live staging preview UI and source.** `components/strongman-app.jsx:398–415` selects the next event using the current division's station but selects the next division from `filteredDivisions`. Under All, that list contains the whole meet.

Reproduction with Station A groups 1–2 and Station B groups 3–5:

1. Select **All → Group 5 → Ev 2 Keg** and open Pit Crew.
2. Actual next setup: **Ev 1, Group 1**, `Strike Ev 2 → Build Ev 1`, **280 lb → 100 lb**.
3. Select **Station 2** with the same group/event. Correct next setup: **Ev 1, Group 3**, **280 lb → 140 lb**.
4. Under **All → Group 2 → final Truck**, it offers **Group 3, 320 lb → 340 lb**, crossing stations rather than ending Station A's changeovers.

The helper `buildTransitionDeltas` renders the supplied weights correctly; the caller supplies the wrong next division. Scope the transition's division list to the effective station, even under All. Keep a clear fallback for genuinely unassigned divisions. Retest both examples and a final group/final event under All. Until fixed, require a station filter for Pit Crew; the filtered-station cases passed.

## EO-L1: run-method copy contradicts the new behavior

**Evidence level: source and live UI.** `components/setup/builder/MeetSection.jsx:199–201` still says **“Run Order Methodology (Events 2+)”** and **“Event 1 always runs by lot number.”** In this feature, Ev 1 can run second on Station B and must follow keg results under reverse methods. The engine and the test correctly do that.

Use **“Athlete run order”** and explain that reverse methods start in lot order until an earlier event on that station has results. The new Roster Order explanation itself is clear and agrees with the tested behavior. Stations-step copy also explains the fixed leaderboard event numbers correctly.

## EO-L2: position tag does not fit at 375 px

**Evidence level: measured browser layout and screenshot.** The closed picker was **168 px** wide. “Ev 2: Keg Over Bar · 1st here” measured **158.53 px** before accounting for padding and the dropdown arrow. The screenshot visibly clips the suffix after **“1st”**. The page itself did not overflow horizontally, and option values remained event IDs.

Keep Ev 2 as the identity, but put the station position in a small visible adjacent label or otherwise reserve space for it. Native dropdown-popup rendering on a real iPhone/Android was not tested. Local screenshot: `~/.aki/tmp/astra-event-order/header-375.png`.

## Checks that passed

- **Station B Group 4 and Group 5, basket after keg:** the preview displayed **2, 1, 3** under reverse overall with the deliberately distinct lot/score fixture. Group 1's mirror case, keg after basket on Station A, also displayed **2, 1, 3**.
- **Roster Order:** preview displayed **1, 2, 3** for those tested groups/events, including Group 5's final Truck. Source tests additionally exercised reverse previous event and every three-event permutation.
- **Sync:** owner Reset cleared the saved override and the other phone's picker changed in **2.78 s**; reordering keg first propagated in **2.95 s**. These are observed click-to-update times in this run, not latency guarantees. Reload preserved the custom order.
- **Event removal:** changed Station B to keg, truck, basket, then deleted the unscored Truck through the owner UI. The other phone received two events and order **`[e2,e1]`**, with no observed page error. The owner did not remove any scored event.
- **Header selection:** switching stations preserved the selected event ID. Under All, the current division's station controlled option order. Clicking All first selects the first meet division by the existing Header behavior; selecting a Station B division then displays B's order.
- **Pit Crew with Station 2 selected:** Group 5 keg changed to Group 3 basket with correct weights; Group 5 Truck showed no further changeover. It did not wrap to another event.
- **Station controls:** first/up and last/down arrows were disabled. Reset removed the key. Builder checks verified an inverse arrow move and removing an event collapse a no-op override to an absent key.
- **Malformed input:** empty events, non-array order strings/objects, foreign IDs, duplicate IDs and mixed types normalized without throwing in the exercised helper/mapping/state paths. Missing, null and empty station rows fell back to meet order. Local-only preview browser cases confirmed an orphan station assignment, absent stations and a string order fall back without page errors. One-event and zero-event meets showed no station-order list.
- **Ordinary judge flow:** Find meet → Judge → server PIN check opened the scorer as judge with no Meet Setup control. A score entered through the UI and subsequently locked was verified on the staging server as **2 reps, locked true**, with HTTP 200. The two increments occurred across harness attempts before the lock-button locator was corrected; this is one final score, not two distinct score-write test cases.
- **Browser limitations:** no observed Playwright page errors in the completed scenarios. Early harness attempts used a grant-less seeded judge, omitted Find meet, or matched only part of a button's accessible name. Those attempts were corrected; their exits are not counted as passes. The first was an expected spectator downgrade, not a product regression. Real-device touch and native select-popup behavior remain untested.

One existing edge observation is not promoted to a new run-order blocker: “has results” in `runOrder.ts:31–33` is meet-wide, not division-specific. Another division's result can make the previous-event display become blank for a division that has not performed that event. The exercised three-event example retained the same athlete order through the overall-points fallback. This audit does not claim complete coverage of partial-score scheduling or more complex four-plus-event cases.

## Cleanup and release decision

Owner cleanup returned HTTP 200 and deleted **5 divisions, 2 remaining events, 15 athletes and 10 result rows**. Follow-up reads confirmed zero rows for this meet in meets, divisions, events, athletes, results, live_state and registrations. The initially demo fixture became real-flagged through the owner dashboard save probe, but its final pre-delete read confirmed **unlisted, registration closed, upcoming**. Its identity remained the disposable audit UUID/name/slug throughout. All browser contexts were closed and the explicitly issued test grants were revoked; meet deletion removed remaining meet-scoped data. Temporary session/token copies were removed after packaging.

The final source fingerprint detected concurrent changes outside this feature in `app/sitemap.ts`, `components/website/AccountClient.tsx`, `components/website/WebsiteShell.tsx`, `lib/auth/profile.ts`, `lib/auth/useAuth.ts` and `lib/website/data.ts`. The initial full suite and TypeScript results apply to the clean d090cf88 tree, not those later edits. The other **285 tracked blobs** still matched, including every event-order/scorer/setup/sync file examined here. Those unrelated edits are not audited or cleared by this report.

Fix EO-M1 and both LOWs, then retest. Close EO-H1 through a verified all-device rollout, not just a code merge. **Do not call this build cleared for mixed-device meet-day use.** Leaderboard, CSV and public show event numbering staying global is the agreed behavior, not a finding. Geocoder rate limiting remains outside this audit.
