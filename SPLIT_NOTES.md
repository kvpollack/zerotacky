# ZeroTacky split (2026-10-16)

Mechanical split of the 2,820-line `components/strongman-app.jsx` monolith. Zero behavior change.
Done by script (`~/.aki/tmp/zt_split.py`) slicing the original by line range, so code was moved, not retyped.

## Layout
| Path | What |
|---|---|
| `lib/types.ts` | Data model: Meet, Division, Athlete, EventDef, Result, ScoredRow, StandingRow, RunOrderItem, PlateLoad, TransitionRow, ThemeDef, MeetPreset, AppState |
| `lib/engine/scoring.ts` | scoreSingleEvent, calculateDivisionStandings |
| `lib/engine/runOrder.ts` | generateEventRunOrder, resolveAthleteHeightCallout |
| `lib/engine/plates.ts` | calculatePlateLoading |
| `lib/engine/transitions.ts` | describeSetup, parseMeasure, formatSigned, buildTransitionDeltas |
| `lib/engine/index.ts` | re-exports |
| `lib/presets/{strongfest,york,index}.ts` | seed meets, MEET_PRESETS, DEFAULT_PRESET_ID, getInitialSeedState |
| `lib/constants.ts` | storage keys, plates, THEMES |
| `hooks/useMeetState.js` | meet state + localStorage + data-only mutators |
| `hooks/useTheme.js`, `useStopwatch.js`, `useRoleLock.js` | theme, master clock, volunteer role lock |
| `components/strongman-app.jsx` | orchestrator: cross-tab state, derived values, renders active tab (499 lines) |
| `components/shell/{Header,BottomNav}.jsx` | sticky header, bottom nav |
| `components/{judge/JudgePad,pitcrew/PitCrew,standings/Standings,setup/MeetSetup}.jsx` | one file per tab, props only |

Engine is plain TypeScript, strict-mode clean, no React imports. UI stays .jsx.

## Allowed deviations from verbatim
- Type annotations on engine/preset signatures and a few `const x: T[] = []` lines.
- Two type-only `!` assertions in transitions.ts (`prev!.value`, `pitCrewCallout!.title`): no runtime effect.
- `export` added to moved constants/functions; section banner comments dropped.
- `app/layout.tsx`: manifest path typo fixed (`/manifest.sjon` -> `/manifest.json`).

## Verification (all run 2026-10-16)
1. Line audit: every original non-blank line exists verbatim in the new files except the 67 listed above (signatures, exports, banners, old import).
2. `tsc --checkJs` across lib/hooks/components: zero undefined-name errors; lib/ clean under strict.
3. `next build --webpack` compiles successfully (page-data step fails under Bun's Node shim for baseline AND split identically; needs real Node to complete locally. Vercel uses real Node.)
4. Side-by-side browser run, baseline vs split, 35-step meet-day script (reps, ground-touch, lock & advance, timer stamp, DNF distance, DNS 2-tap, flight switch, setup edits, preset switch with confirm, rising bar, pit crew weight sync, trump light tier, 2-lane heats, stones splits, 4-post yoke, role lock, wrong/right PIN, daylight toggle): every screen-text hash and the final localStorage state identical. Separate check of setup mutations (plates, walk-on, rules, collar, event weight): saved state identical.

## Known bugs deliberately NOT fixed (next pass)
- Clock state at App level re-renders the whole tree at 60fps (`useStopwatch` makes this easy to isolate now).
- Role lock not persisted across refresh (`useRoleLock`).
- "FINISHED ALL" hardcodes `implementsCompleted: 5` (JudgePad); stamp path uses `implementCount || 5`; no event defines `implementCount`.
- `useRef(null)` / implicit-any JS diagnostics in hooks/components are pre-existing and harmless.

## Working rule for future edits (Argon or otherwise)
Change one file at a time. Engine changes go in `lib/engine/*` with tests; UI changes in the tab component; new state in a hook.

## Independent verification (Aki, SLATE/ZEROTACKY thread, 2026-10-16)
- Line audit: 2,641 non-blank baseline lines; 61 not verbatim = 10 import/export, 9 banners, 39 signature/brace lines, 3 typed/asserted lines. No unexplained edits.
- Engine tests (36, `~/.aki/tmp/zt_tests/engine.test.mjs`) pass against `lib/engine/index.ts`; sync mapping round-trips both presets losslessly (9 tests).
- Browser smoke a-g on `next dev --webpack` (Bun; Turbopack cannot spawn `node` here): all pass. Reload persists preset, plates, theme.
- Deviations from spec: `saveResultPatch` kept its 2-arg closure in the container (not moved to useMeetState, no signature change); `JudgePad.jsx` is 670 lines (spec asked for 4 sub-components, cap 600). Both accepted; JudgePad gets split when MasterClock is isolated for the perf fix.
- `next build` not runnable locally (no real Node). Vercel (real Node) is the build gate; deploy path is GitHub -> Vercel.
