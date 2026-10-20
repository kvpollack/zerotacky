# Audit: per-station event order and Roster Order run method (2026-10-21, evening)

One push on v2, `d090cf88`, and it is meet-day code: the run-order generator, the judge pad's event picker, Pit Crew's next event, and the Stations step. Meet is Saturday 10/24; Wed+Thu are all-day phone testing, Friday is the freeze. Kurt's plan: prod Thursday if this comes back clean, otherwise hold it to after the show and Strongfest runs with the global event order as before. So this one has a deadline: findings by Thursday morning, a HIGH as soon as you have it.

Same access as before: v2 preview `https://zerotacky-git-v2-kvpollack-6654.vercel.app` against staging Supabase `hryiqiopkihkcrkdyllg`, your staging account still works. Expect `tsc` clean and `bun test test/` 320 pass (305 before, 15 new in `test/eventOrder.test.mjs`). `ROADMAP.md` s5 first item has the spec and what shipped. No SQL in this round: `Station.eventOrder` rides inside the existing `stations` jsonb and `run_order_method` has no DB constraint, so no migration.

## Why
Jess's Strongfest athlete email: Groups 1 and 2 run basket deadlift, keg over bar, truck pull; Groups 3 to 5 run keg over bar first; athletes go in roster order every event, no reshuffle for the last one. The app had one global event order and two automatic athlete orders. Two decisions Kurt made that shape what you will see: the leaderboard, CSV and show pages keep Ev 1/2/3 by meet number for everyone (no per-station columns), and "Ev 2" stays the event's identity everywhere; the station position is only a small tag.

## What changed
- `lib/types.ts`: `RunOrderMethod` adds `'lot_order'`; `Station.eventOrder?: string[]` (event ids; absent = meet order).
- `lib/engine/eventOrder.ts` (new): `normalizeEventOrder` (unknown and duplicate ids dropped, missing events appended in meet order, returns `undefined` when the result equals meet order so saved data never carries a no-op override), `stationEvents`, `stationForDivision`, `stationById` (`'ALL'` -> undefined), `eventsForDivision`, `nextEventOnStation`, `priorEventsOnStation`, `stationPosition`, `hasCustomEventOrder`, `moveEventInOrder`.
- `lib/engine/runOrder.ts`: `generateEventRunOrder(event, division, athletes, events, results, method, stations?)`. Prior events are now the events earlier in the division's station order that have results, not lower `eventNumber`s. `lot_order` (or no completed prior events) -> lot number order.
- `lib/meetBuilder.ts`: `updateStation(id, { label?, eventOrder?: string[] | null })` normalises or clears the order; `addEvent`, `removeEvent`, `reorderEvents` re-normalise every station's order; `normalizeState` does the same on load and accepts `lot_order`.
- `lib/sync/mapping.ts`: `rowToMeet` keeps `eventOrder` (strings only) when a station row carries it.
- UI: `StationsSection.jsx` shows "Event order on this station" per station with up/down arrows and "Reset to meet order" (only when 2+ events); `Header.jsx` lists events in the order of the filtered station (or the current division's station under All), tag ` · 1st here` only when that station has a custom order; `strongman-app.jsx` passes `meet.stations` to the generator and computes Pit Crew's next event on the station; `MeetSection.jsx` adds the "Roster Order" option (3-column grid) and exports `runOrderShortLabel`, which `JudgePad.jsx` now uses for the strip label.

## What to look at, in priority order
1. **Run order correctness on a two-station meet.** On the preview, the staging Strongfest copy already has Station 2 set to keg, basket, truck. Score keg for Group 4 or 5 (Station 2), then open basket for that group: with `reverse_overall` the keg results should drive the order; with `lot_order` nothing should move. Then the mirror case: score basket for Group 1 (Station 1), open keg for Group 1, order should follow basket results. Then the thing I most want a second pair of eyes on: a division whose `flight` points at a removed station, or a meet with `stations` absent from the row. Both should fall back to meet order with no throw.
2. **Phones that have not refreshed.** A judge phone on the current prod build receives a `stations` jsonb carrying `eventOrder` from a promoter on the new build. Old `rowToMeet` maps `{id,label}` only, so the old phone drops the field and runs meet order, and if that old phone then saves config it writes stations back without `eventOrder`. Is that save path reachable from a joined phone (`zt_save_meet_config` is admin-PIN gated, I think), and how bad is the mixed-build window Wednesday if some phones update late? Say what you find; the fix may just be "everyone updates before testing".
3. **Sync round trip.** Set an order on one phone, confirm the other phone's header picker reorders within a sync tick, confirm `normalizeState` on reload keeps it, confirm removing an event on one phone clears or shortens the other phone's order without an error.
4. **Pit Crew next setup.** Under a station filter the next event is the station's next; under All it is the current division's station's next. Check the transition rows ("Strike Ev 2 -> Build Ev 1") use the right weights for the next division, and the last event on a station shows no next setup rather than wrapping to the other station's order.
5. **Header picker.** Switching the station filter changes the option order and the selected event stays selected (value is the id). Under All with divisions on two stations, confirm which station's order wins and whether that is confusing on the phone. Tag text `1st here` etc. is short on purpose; flag if it truncates on a 375 px screen.
6. **Stations step.** Arrows clamp at the ends, "Reset to meet order" clears the key, an order that happens to equal meet order shows as meet order (no stale override). The list only renders with 2+ events; with 1 event there is nothing to order.
7. **Engine edge cases in `eventOrder.ts`.** Empty events, a station order referencing ids from another meet, duplicate ids, `eventOrder` as a non-array in the row (string, object). `normalizeEventOrder` is the single gate; break it if you can.
8. **Copy pass** on the Stations step text and the Roster Order explain line. Kurt's rule stands.

## Known, not claimed
- Leaderboard, CSV export and `/m/<slug>` show pages are unchanged and show events by meet number. That is the decision, not an omission.
- Per-division custom athlete order (ROADMAP s5 item 3) is not built.
- The strongfest preset still carries the real roster (your 10/20 note), after 10/24.
- Hydration mismatch on `/website/account` while signed in predates this round.

## Report
`audits/astra-2026-10-21-event-order.md`, same format and three verdict options. Findings by Thursday morning so Kurt can decide prod before the Thursday test block; a HIGH on item 1 or 2 right away.
