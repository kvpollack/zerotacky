# ZeroTacky: kg / m support, scoping note (Slate, 2026-11-12)

Item 4 of the 11/10 scoring audit (`audits/slate-2026-11-10-scoring-vs-iron-podium.md`): Iron Podium lets a promoter run a
meet in kilograms and metres; ZeroTacky is pounds and feet everywhere. This note says what that touches, the two ways to
build it, and which one I would build. No code was written.

## What is imperial today (inventory, from the repo on 11/12)

**Stored numbers that are implicitly pounds or feet** (`lib/types.ts`)
- Meet: `availablePlates` (default `[100, 55, 45, 35, 25, 15, 10, 5, 2.5]`, `lib/constants.ts`), `collarWeightPerPair`.
- Event: `divisionWeights`, `divisionLightWeights`, `risingBarWeights`, `implementEmptyWeight`, `collarWeightPerPair`,
  spec `courseFeet` (1..5280, half-foot steps, `lib/events/spec.ts`).
- Result payload: `maxWeightLbs`, `distanceFeet` (the names carry the unit). `reps`, `timeSeconds`, `implementsCompleted`
  are unit-free.
- Already metric by design and staying so: division `weightCapKg` (054 standard classes), check-in desk bodyweight in kg
  with an lb toggle (`lib/desk/rules.ts`, `CheckInDeskSection.tsx`), roster import bodyweight (kg header converts to lb).

**Code that prints or parses a unit** (files with `lb`/`lbs`/`ft` literals, non-test): 30 files, the heavy ones being
`lib/website/fixtures.ts` (24, demo data), `JudgePad.tsx` (16), `lib/events/spec.ts` (15), `lib/website/groupPicker.ts`
(14), `PitCrewSheet.tsx` (12), `prBoard.ts` (11), `engine/scoring.ts` (11), `EventForm.jsx` (11), `showHistory.ts` (10),
`prepSheet.ts` (9), `engine/transitions.ts` (8). The rest are 1 to 6 lines each.

**Cross-meet surfaces** (compare numbers from different meets, so they need one canonical unit): PR board (`prBoard.ts`,
`zt_prs` / claim results), "Which group fits me?" (`groupPicker.ts`, profile PRs are canonical pounds, Astra GP-09), show
history and IG result cards, "train for this show" (`trainFor.ts`), prep sheet (already prints an lb-with-kg pair:
`format.ts` `kgLabel`).

**SQL that knows the key names**: `053_adopt_archive.sql` writes `maxWeightLbs` / `distanceFeet` into adopted results and
converts archive `kg` rows to lb (`round(value * 2.20462, 1)`); `040/041` spec guards validate `courseFeet`; `001_schema`
comments. Archive on staging: 50,963 `lb` rows, 65,554 `ft`, 511 `kg`, 0 `m`. The archive is 1% metric.

## Two ways to build it

**A. Store imperial, convert at the screen.** Add `meets.units` (`'imperial' | 'metric'`). Every stored number stays lb/ft.
One `lib/units.ts` (`toDisplayWeight`, `fromInputWeight`, `toDisplayDistance`, labels) and every print / parse point
calls it. Cross-meet surfaces untouched.
- Cost: every one of the 30 files above, plus every numeric input in EventForm, JudgePad, PitCrewSheet and MeetSection
  (type 100 kg, store 220.46, show 100.0).
- The real problem is plate math. A kg meet has 25 / 20 / 15 / 10 / 5 / 2.5 / 1.25 kg plates. Stored as pounds they are
  55.116 / 44.092 / ..., the loading engine (`engine/plates.ts`) then works in floats with rounding slop, and the pit
  crew sheet prints "55.1 lb" plates to a crew holding 25 kg discs unless every plate line converts back. Fixable, but
  it is the engine fighting its own storage.
- Rounding: 100 kg -> 220.46 lb -> 100.0 kg survives one round trip at 1 decimal; a promoter editing "220.46" in a
  pounds-only admin surface would see noise.

**B. Store in the meet's unit, label from `meets.units`, normalise only where meets are compared.** Add `meets.units`
(`'imperial' | 'metric'`, default imperial, set at meet creation, locked once a result exists). The engine (`scoring.ts`,
`plates.ts`, `transitions.ts`, `tiebreak.ts`) is arithmetic and never looks at the unit, so it is unchanged: a kg meet
loads 25 kg plates from a `[25, 20, 15, 10, 5, 2.5, 1.25]` inventory with the same code. Labels (`lb`/`kg`, `ft`/`m`) come
from one helper. Cross-meet surfaces convert to canonical pounds / feet at read time using the meet's unit.
- Cost: `meets.units` column + `zt_publish_meet` / `zt_save_meet_config` / sync mapping (1 migration); unit helper; label
  changes in the same 30 files but no input conversion (type 100, store 100); `MeetSection` unit picker (and the plate
  inventory default flips with it); `053` adopt keeps kg for a kg archive show instead of converting; PR board, group
  picker, show history, result cards, trainFor read `meet.units` and normalise (5 files, plus `zt_prs` must expose
  `units`); `courseFeet` validation range in metres (1..1610, 0.5 steps).
- Honest downside: `maxWeightLbs` / `distanceFeet` / `courseFeet` become misnamed in a metric meet. Renaming them is a
  payload migration across 053 and the spec guards (040/041) plus every reader. I would keep the names in phase 1 with a
  type comment ("in the meet's unit") and rename later if it ever bites; the engine treats them as numbers either way.

## Recommendation: B

B keeps the engine honest (plates are real plates), keeps typed numbers round, and limits conversion to the five
cross-meet readers, which are exactly the places that already convert (group picker lb/kg toggle, prep sheet kg label,
053 kg -> lb). A pushes conversion into every input and makes plate math lie.

Rough size, my estimate, not measured: three build sessions like today's.
1. Migration + helper + labels (engine untouched, 797 tests must still pass with no behaviour change for imperial meets),
   unit picker on the meet form, plate default per unit, `courseFeet` range per unit. Tests: label helper, metric plate
   load, metric scoring display.
2. Cross-meet normalisation: `zt_prs` exposes `units`; prBoard, groupPicker, showHistory, resultCardImage, trainFor convert
   metric results to lb/ft before ranking or seeding; 053 adopt stops converting kg for a metric target meet.
3. Browser probe of a metric meet end to end (form, pad, pit crew, TV, prep sheet, PR board) and an Astra audit, since
   every print point changes.

Not in scope: mixed-unit meets (one event in kg, another in lb; Iron Podium does not do this either), metric bodyweight
classes (already kg), archive backfill (the 511 kg rows already convert on adopt).

## Open questions for Kurt
- Does a promoter ever need to flip units after publishing? My default: locked once any result exists; before that, flip
  converts nothing (numbers are re-typed) and warns.
- Default for new meets: imperial (today's behaviour), or follow the promoter's locale? My default: imperial, picker on
  the meet form.
