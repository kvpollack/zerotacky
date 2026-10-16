# ZeroTacky: Meet Builder + Demo Mode (spec for Argon, 2026-10-16)

## Read first
`SPLIT_NOTES.md`, `PHASE0_NOTES.md`, `lib/types.ts`, `lib/presets/*.ts`, `hooks/useMeetState.js`,
`components/strongman-app.jsx`, `components/setup/MeetSetup.jsx`, `components/shell/Header.jsx`.
Run `bun test test/` before you start (51 pass) and after every step. Dev server: `bun run dev --webpack`
(Turbopack cannot spawn `node` on this machine; Vercel is fine either way).

## Goal
Today the app only runs two hard-coded demo meets. A promoter must be able to build a real meet on the phone:
create a blank meet, add divisions, events (with all per-type fields the engine already understands), and
athletes, then run it. The two presets stay as **demo** meets, clearly badged. Nothing about scoring, run
order, plates, the clock, backup, or sync changes.

## Rules
- **Do not modify:** `lib/engine/**`, `lib/sync/**`, `lib/export.ts`, `lib/download.js`,
  `hooks/useStopwatch.js`, `hooks/useRoleLock.js`, `components/judge/**`, `components/pitcrew/**`,
  `components/standings/**`, `app/globals.css`, existing files in `test/`. If you believe one of these must
  change, stop and write why in BUILDER_NOTES.md instead of changing it.
- No new runtime dependencies. No context providers or state libraries; props and the existing hooks only.
- Keep `components/strongman-app.jsx` under 520 lines. New UI goes in `components/setup/builder/*`.
- Every pure function you add goes in `lib/meetBuilder.ts` with tests in `test/meetBuilder.test.mjs`
  (Bun test runner; copy the style of `test/export.test.mjs`).
- Persisted shape stays backward compatible: a saved `ZEROTACKY_OFFLINE_STATE_V2` from today must still
  load. Missing new fields get defaults in a `normalizeState()` function applied on hydrate in
  `useMeetState` (that is the one allowed change to that hook, plus exposing new mutators).

## Data model changes (`lib/types.ts`)
```ts
export interface Station { id: string; label: string }          // e.g. { id: 'A', label: 'Stn 1' }
export interface Meet {
  ...existing,
  isDemo?: boolean;                 // true for the two presets; false/undefined for built meets
  stations?: Station[];             // default [{id:'A',label:'Stn 1'},{id:'B',label:'Stn 2'}]
  slug?: string;                    // url-safe, derived from name, editable; used by Phase 1 sync
}
```
`Division.flight` is a station id. The header's station toggle must render from `meet.stations` instead of
the hard-coded `['A','B','ALL']` (labels: station.label, then "All"). Divisions on a station that no longer
exists show under "All" and the builder flags them.

## `lib/meetBuilder.ts` (pure, tested)
```ts
createBlankMeet(name: string, date?: string): AppState   // one station pair, empty arrays, isDemo false,
                                                         // adminPin '1050', plates = ALL_POSSIBLE_PLATES,
                                                         // id = 'meet-' + Date.now() style unique id, slug
slugify(name: string): string
normalizeState(raw: unknown): AppState                   // fills isDemo/stations/slug/implementCount defaults,
                                                         // guarantees arrays exist, never throws on today's saves
addDivision / updateDivision / removeDivision(state, ...)  // remove = also removes its athletes and that
                                                         // division's keys in every event's per-division maps
reorderDivisions(state, orderedIds)
addEvent / updateEvent / removeEvent(state, ...)         // remove = also removes that event's results and
                                                         // athletes' rackHeights[eventId]
reorderEvents(state, orderedIds)                         // renumbers eventNumber 1..n
addAthlete / updateAthlete / removeAthlete(state, ...)   // add = next lotNumber in that division;
                                                         // remove = also removes results
moveAthlete(state, athleteId, toDivisionId)              // new lot = next in target division
shuffleLots(state, divisionId, rng?)                     // random lot draw, deterministic with injected rng
validateMeet(state): { ok: boolean; problems: string[] } // human sentences: "Group 3 has no athletes",
                                                         // "Ev 2 has no weight for Group 1", "Two athletes
                                                         // in Group 2 share lot 3", "Event 4 is rising bar
                                                         // but has no bar weights", etc.
```
All functions return new state; never mutate. Each one gets at least one test, `validateMeet` gets one per
problem type, `normalizeState` gets a test that feeds it today's Strongfest `getInitialSeedState()` JSON
with `isDemo`/`stations` deleted and checks the defaults land.

## UI
### Setup tab reorganised (`components/setup/MeetSetup.jsx` becomes a thin shell with sections)
1. **Meet** (new `builder/MeetSection.jsx`): name, date, slug (auto from name, editable), stations list
   (add/rename/remove; min 1), admin PIN (numeric, 4-6 digits), run order method, tiebreaker, collar weight,
   plate inventory. Move the existing rule/plate/collar controls here unchanged in behaviour.
2. **Divisions** (`builder/DivisionsSection.jsx`): list with name, station select, athlete count; add;
   rename inline; move up/down; remove with 2-tap confirm (shows how many athletes/results go with it).
3. **Events** (`builder/EventsSection.jsx` + `builder/EventForm.jsx`): list ordered by eventNumber with
   type badge; add opens the form; tap to edit; move up/down; remove with 2-tap confirm.
   EventForm fields, shown by `scoringType`:
   - always: name, scoringType (4 options with one-line help each), timeCapSeconds, lanes (1|2),
     loadingPoints (0|1|2|4), weightEntryMode (total|per_hand; only when loadingPoints=4),
     implementEmptyWeight, weightIsAddedPlatesOnly, hasHeightCallout + heightLabel,
     per-division: divisionWeights (number per division) and divisionDefaultHeights (text per division,
     only if hasHeightCallout), fixedImplementDescription (only if loadingPoints=0)
   - reps: hasTrumpWeight + per-division divisionLightWeights, groundTouchWarning
   - max_weight: maxFormat (rising_bar | none), risingBarWeights as a comma list ("225, 245, 265")
   - time_or_distance: nothing extra (distance unit is feet, say so in the label)
   - time_or_implements: implementCount (default 5)
   - pitCrewCallout: title + per-division headline; stats are out of scope (leave existing preset data intact)
   Save validates: name required, timeCap > 0, rising bar weights ascending numbers.
4. **Athletes** (`builder/AthletesSection.jsx`): grouped by division; add (name, division), inline rename,
   lot number edit, move to another division, scratch/reinstate, remove with 2-tap confirm; "Draw lots"
   per division (uses shuffleLots) with confirm if any result exists for that division.
   Bulk add: a textarea "one name per line" into the selected division.
5. **Meets** (`builder/MeetsSection.jsx`): replaces "Switch Meet Preset". Buttons: "New blank meet"
   (name prompt, then `createBlankMeet`, via the container's existing `applyNewState`-style path so the
   clock/selections reset and a snapshot is taken), the two demo presets (badged DEMO, same score-wipe
   guard as today), and "Validate meet" showing `validateMeet` problems or a green "Ready".
6. **Backup panel** and the reset button stay where they are; reset label becomes "Reset this meet to its
   preset" for demo meets and "Clear all scores" for built meets (clear = results = [], snapshot first).

### Header (`components/shell/Header.jsx`)
- Replace "ZERO TACKY • PIXEL PWA" with "ZEROTACKY" and, when `meet.isDemo`, an amber "DEMO" pill next to it.
- Station toggle renders from `meet.stations`.

### Judge / Pit Crew / Standings
Untouched, except they must not crash on an empty meet: when there are no divisions, events or athletes,
each tab shows one centered card "Add divisions, events and athletes in Meet Setup" with a button that
switches to the setup tab (admin only; locked roles see the message without the button). Do this in
`components/strongman-app.jsx` by rendering `components/setup/builder/EmptyMeetNotice.jsx` instead of the
tab when `currentDivision`, `currentEvent` or `currentAthlete` is undefined. Then remove the `|| events[0]`
style fallbacks only if needed to make that condition reachable; otherwise leave them.

## Acceptance (do every step, report honestly in BUILDER_NOTES.md)
1. `bun test test/` passes: the existing 51 plus your `test/meetBuilder.test.mjs` (>= 20 tests).
2. Hydration: paste a copy of today's localStorage JSON (take it from the baseline preset, delete `isDemo`
   and `stations`) into localStorage, reload: app loads, header shows two stations, no DEMO pill (built
   meet default) **unless** `presetId` matches a demo preset, in which case `normalizeState` sets isDemo.
3. Build a meet from blank on the phone-width viewport (375 px): 2 stations, 3 divisions (one per station
   plus one), 3 events (one reps with trump weight, one 2-lane time_or_distance with 4-point per_hand
   loading, one time_or_implements with implementCount 3), 6 athletes across the divisions, draw lots in
   one division, validate -> Ready. Then: Judge Pad scores all three events for one division, Pit Crew
   shows the correct per-hand plate stack, Standings ranks correctly, FINISHED ALL stamps 3 implements.
4. Remove an event that has results: results for it disappear, standings recompute, no console errors.
5. Remove a division with athletes: athletes and their results gone; other divisions untouched.
6. Switch to a demo preset and back to a restored snapshot: scores intact (snapshot path already exists).
7. Locked judge phone on an empty meet shows the notice without a setup button.
8. No file over 400 lines in `components/setup/builder/`. `strongman-app.jsx` under 520.
9. `BUILDER_NOTES.md`: file list with exports/props, every deviation from this spec with the reason,
   anything you could not finish stated plainly. Do not present partial work as done.
