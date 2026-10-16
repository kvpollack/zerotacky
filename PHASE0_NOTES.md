# Phase 0: meet-day hardening (Aki, 2026-10-16)

Builds on the Opus split (SPLIT_NOTES.md). Tests: `bun test test/` (51). Dev: `bun run dev --webpack` on this
machine (Turbopack needs a real `node` binary to spawn PostCSS; Vercel has one).

## Done
1. **Manifest typo** (Opus): `app/layout.tsx` -> `/manifest.json`. PWA install now standalone.
2. **Clock isolation** (`hooks/useStopwatch.js`, `components/judge/MasterClock.jsx`, `StopStampButton.jsx`):
   elapsed time lives in refs; a rAF loop plus a 250 ms interval fallback (rAF pauses when the screen is
   hidden) pushes to subscribers. Only the two display components re-render per frame. Stamps read
   `performance.now()` at the tap, so they are exact regardless of display rate. API:
   `{ timerRunning, start, stop, toggle, resetStopwatch, getElapsedMs, getElapsedSeconds, subscribe }`.
3. **Role lock persisted** (`hooks/useRoleLock.js`, key `ZEROTACKY_ROLE_V1`). A locked phone reloads locked
   and lands on its role's tab.
4. **Stone count per event**: `implementCount` on EventDef; York Ev 5 = 5; FINISHED ALL and stop-and-stamp
   both use `currentEvent.implementCount || 5`.
5. **Real Strongfest roster** (`lib/presets/strongfest.ts`): 14 athletes from the Iron Podium director view,
   lot numbers in listed order. Groups 3 and 5 have one athlete each.
6. **Backup & export** (`lib/export.ts` pure + tested; `lib/download.js`; `components/setup/BackupPanel.jsx`):
   JSON backup (share sheet on touch devices, download on desktop), restore from file (validated, confirm,
   snapshots current state first), results CSV (per-event score/place/points + totals), copy standings text.
7. **Auto-snapshots** (`hooks/useMeetState.js`, key `ZEROTACKY_SNAPSHOTS_V1`): ring of 8, taken when scores
   change (>= 60 s apart) and always before preset reset / import / restore. Restore list in Setup.
   `replaceState(next, reason)` is the only way to swap the whole meet; `applyNewState` in the container
   resets selections and the clock.
8. `lib/sync/{mapping,queue}.ts` landed (pure, tested) for Phase 1; not wired yet.

## Still open in Phase 0
- `isDemo` flag + "New blank meet" + meet builder (divisions, events, athletes CRUD). Spec: MEET_BUILDER_SPEC.md.
- `Header.jsx` still says "ZERO TACKY • PIXEL PWA"; brand line and a DEMO badge come with the builder.
