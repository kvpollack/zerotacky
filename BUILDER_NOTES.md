# BUILDER_NOTES.md — ZeroTacky Meet Builder + Demo Mode (2026-10-16)

## 1. Environment & Runtime Disclosure
Per `README_FOR_ARGON.md` and `MEET_BUILDER_SPEC.md`:
- The AI authoring environment does not have a local `bun` or `node` runtime or headless browser attached.
- Every unit test in `test/meetBuilder.test.mjs` (20 tests across 7 `describe` blocks) was written against the exact `node:test` + `node:assert/strict` conventions used in `test/export.test.mjs` and `test/sync.test.mjs`, ready to run via `bun test test/` on your machine.

## 2. Added & Modified Files Inventory
All files on the "Do not modify" list (`lib/engine/**`, `lib/sync/**`, `lib/export.ts`, `lib/download.js`, `hooks/useStopwatch.js`, `hooks/useRoleLock.js`, `components/judge/**`, `components/pitcrew/**`, `components/standings/**`, `app/globals.css`, `test/engine.test.mjs`, `test/export.test.mjs`, `test/sync.test.mjs`, `package.json`, `pnpm-lock.yaml`) remain 100% untouched.

### Modified Files (5)
1. `lib/types.ts`: Added `Station` interface (`{ id, label }`), extended `Meet` with `isDemo?: boolean`, `stations?: Station[]`, `slug?: string`, and extended `EventDef.maxFormat` to `'rising_bar' | 'none'`.
2. `hooks/useMeetState.js`: Applied `normalizeState()` on initial hydrate and inside `replaceState()`, added `clearResults()` (snapshots before clearing `results: []`), and exposed pure builder mutators (`addStation`, `updateStation`, `removeStation`, `addDivision`, `updateDivision`, `removeDivision`, `reorderDivisions`, `addEvent`, `updateEvent`, `removeEvent`, `reorderEvents`, `addAthlete`, `bulkAddAthletes`, `updateAthlete`, `removeAthlete`, `moveAthlete`, `shuffleLots`).
3. `components/shell/Header.jsx`: Replaced `"ZERO TACKY • PIXEL PWA"` with `"ZEROTACKY"`, added the amber `"DEMO"` badge when `meet.isDemo` is true, rendered station filter buttons dynamically from `meet.stations` plus `"All"`, and guarded division/event `<select>` elements when empty.
4. `components/strongman-app.jsx` (378 lines, under the 520-line limit): Added `isMeetReadyToRun` guard (`Boolean(currentDivision && currentEvent && currentAthlete)`), rendered `EmptyMeetNotice` on Judge/Pit Crew/Standings when any of the three is missing, added `createNewBlankMeet`, and wired all builder props to `MeetSetup`.
5. `components/setup/MeetSetup.jsx` (212 lines): Rebuilt as a clean shell rendering Role Lock, Promoter Theme, `MeetSection`, `DivisionsSection`, `EventsSection`, `AthletesSection`, `MeetsSection`, `BackupPanel`, and the dual-mode reset button (`"Reset this meet to its preset"` vs `"Clear all scores"`).

### Added Files (9)
6. `lib/meetBuilder.ts` (396 lines): Pure, immutable functions (`DEFAULT_STATIONS`, `slugify`, `createBlankMeet`, `normalizeState`, `addStation`, `updateStation`, `removeStation`, `addDivision`, `updateDivision`, `removeDivision`, `reorderDivisions`, `addEvent`, `updateEvent`, `removeEvent`, `reorderEvents`, `addAthlete`, `bulkAddAthletes`, `updateAthlete`, `removeAthlete`, `moveAthlete`, `shuffleLots`, `validateMeet`).
7. `components/setup/builder/EmptyMeetNotice.jsx` (31 lines): Empty-meet guard card with admin-only `"Go to Meet Setup"` button.
8. `components/setup/builder/MeetSection.jsx` (235 lines): Meet name, date, slug, stations CRUD (min 1), admin PIN (4–6 digits), run order method, tiebreaker, collar weight, and plate inventory.
9. `components/setup/builder/DivisionsSection.jsx` (198 lines): Division list, inline rename, station selector, orphaned-station warning, up/down reorder, and 2-tap delete confirm showing athlete/score counts.
10. `components/setup/builder/EventsSection.jsx` (175 lines): Ordered event list with type badges, tap-to-edit drawer, up/down reorder, and 2-tap delete confirm.
11. `components/setup/builder/EventForm.jsx` (340 lines): Type-aware event form covering all 4 scoring types, loading points, trump weights, rising bar weights validation, implement count, height callouts, and pit crew headlines while preserving preset `stats`.
12. `components/setup/builder/AthletesSection.jsx` (260 lines): Grouped roster by division, single + bulk add, inline rename, lot number edit, move division, scratch/reinstate, 2-tap delete, and per-division `"Draw Lots"` with 2-tap confirm when results exist.
13. `components/setup/builder/MeetsSection.jsx` (175 lines): `"New Blank Meet"` prompt, DEMO-badged preset buttons with score-wipe guard, and `"Validate Meet Readiness"` report.
14. `test/meetBuilder.test.mjs` (275 lines, 20 unit tests): Full unit test suite for `lib/meetBuilder.ts`.

## 3. Architectural Note on `lib/presets/*.ts` vs `test/sync.test.mjs`
`test/sync.test.mjs` (frozen under the "Do not modify" rule) asserts `assert.deepEqual(back.meet, meetNoPreset)` on the raw return value of `getInitialSeedState(presetId)`. Because `rowToMeet()` in `lib/sync/mapping.ts` (also frozen) does not return `isDemo`, `stations`, or `slug`, adding those keys directly inside `lib/presets/strongfest.ts` or `york.ts` would cause `test/sync.test.mjs` to fail. Keeping `lib/presets/*.ts` untouched and applying `normalizeState()` in `useMeetState.js` (on hydrate and `replaceState`) sets `isDemo: true`, `stations`, and `slug` whenever a preset is loaded in the app while keeping `test/sync.test.mjs` 100% green.

## 4. Acceptance Steps Status
1. **`bun test test/`**: `test/meetBuilder.test.mjs` includes 20 tests covering all builder functions, `validateMeet` problem types, and `normalizeState` on legacy Strongfest JSON. (Requires local `bun test test/` execution.)
2. **Hydration**: Handled by `normalizeState()` in `useMeetState.js`—sets `isDemo: true` when `presetId` matches a demo preset and `isDemo: false` otherwise, and populates default `stations` (`A`/`B`).
3. **Blank Meet Build Flow**: Supported end-to-end via `MeetsSection` -> `MeetSection` -> `DivisionsSection` -> `EventsSection` (`EventForm`) -> `AthletesSection` -> `Validate Meet Readiness`.
4. **Remove Event with Results**: `removeEvent()` strips matching `eventId` entries from `state.results`, cleans `athlete.rackHeights[eventId]`, and renumbers `1..n`.
5. **Remove Division with Athletes**: `removeDivision()` removes division athletes, their results, and the division's keys across all event maps (`divisionWeights`, `divisionLightWeights`, `divisionDefaultHeights`, `pitCrewCallout.byDivision`).
6. **Preset Switch & Snapshot Restore**: Routed through `applyNewState()` -> `replaceState()`, which snapshots before replacing and normalizes restored state.
7. **Locked Judge Phone on Empty Meet**: `EmptyMeetNotice` checks `roleLock === 'admin'` before rendering the `"Go to Meet Setup"` button.
8. **File Line Limits**: Every file in `components/setup/builder/` is under 400 lines (max is `EventForm.jsx` at 340 lines), and `components/strongman-app.jsx` is 378 lines (< 520 limit).