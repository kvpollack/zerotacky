# Disposition: Astra event-order audit (2026-10-21)

Report: `astra-2026-10-21-event-order.md` at v2 `d090cf88`. Verdict was "merge after fixes". Fixes below are on v2; the HIGH is a rollout gate, not a code change, and stays open until the device check is done.

| ID | Sev | Finding | Disposition |
|---|---|---|---|
| EO-H1 | HIGH | Old builds drop `eventOrder` and treat `lot_order` as reverse overall; an old publishing phone can erase the override on save | **Open, rollout gate.** Procedure below. No code can fix a phone that has not refreshed. Astra's correction accepted: config saves are owner/member gated (`zt_save_meet_config`, `zt_publish_meet`), not PIN gated; a joined judge cannot wipe the override by scoring. |
| EO-M1 | MED | Pit Crew under All took the next division from the whole meet, so the loader saw another station's weight (100 lb for 140 lb) | **Fixed.** `strongman-app.jsx`: next setup now walks `filteredDivisions` restricted to the current division's `flight` (same station under All; identical to before under a station filter; orphaned divisions pair by their dead id). Retested on dev: All, Group 5, keg -> Ev 1 Group 4 (Station 2's first group); All, last Station 1 group, truck -> "Final group of the final event on this station". |
| EO-L1 | LOW | Setup copy said "Event 1 always runs by lot number" | **Fixed.** `MeetSection.jsx`: heading "Athlete run order"; copy: the first event on a station runs by lot number, reverse methods take over once an earlier event on that station has results. |
| EO-L2 | LOW | " · 1st here" suffix clipped in the closed picker at 375 px | **Fixed.** `Header.jsx`: options carry a short "1." prefix when the station has a custom order; the position moves to its own line under the pickers ("Ev 1 runs 2nd of 3 on Station 2"). No line when the station runs meet order. |

Not findings, noted: `runOrder.ts` "has results" is meet-wide, not per division (pre-existing; `previousEventDisplay` can blank for a division that has not run that event; athlete order unaffected in the tested case). Parked in ROADMAP s5 as a follow-up.

## EO-H1 rollout procedure (before turning on Station 2 order + Roster Order on prod)
1. Merge v2 -> main, confirm the prod build is live (`vercel_status.py`).
2. Stop scoring and config edits. Close every scorer, Pit Crew and promoter tab on every phone, then reopen `zerotacky.com/scorer` so each loads the new build (a stale tab keeps old code and, for publishing links, old local config).
3. One promoter phone only (Kurt): Meet Setup -> Stations -> Station 2 order keg, basket, truck; Meet -> Athlete run order -> Roster Order. Confirm the save.
4. Every other phone rejoins with the code (device link) or, if it is a publishing link, confirm its Stations step shows the same order before it publishes anything.
5. On every judging phone: pick Station 2, confirm the event picker shows "1. Ev 2: Keg Over Bar" first and the line "Ev 2 runs 1st of 3 on Station 2"; pick Station 1, confirm meet order and no position line. Judge pad strip reads "Run Order (Roster)".
6. Do this with the disposable test meet first if there is time; never put test scores into Strongfest.
If the phones cannot all be refreshed and checked before the Thursday test block, keep global order and leave the feature for after the show. Strongfest runs fine on the old behaviour; judges score events in whatever order the floor runs them.
