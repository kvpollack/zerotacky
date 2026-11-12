# ZeroTacky kg / m build: Astra audit brief (2026-11-12)

Repo `zerotacky-v2`, main `86514d46`. Three sessions, two migrations (059, 060), both on prod. 819 tests pass, tsc clean.
Read first: `audits/slate-2026-11-12-kg-m-scope.md` (the design choice), then the three sections at the end of
`UI_TRANSITION_NOTES.md` ("kg / m units, session 1 / 2 / 3 probe").

## The design to audit against (option B)
A meet picks `imperial` or `metric` once. Every number in that meet is stored in the meet's unit under the historical
field names (`distanceFeet`, `maxWeightLbs`, `courseFeet`, `divisionWeights`). The engine never converts; it only labels.
Conversion happens in exactly three places: the mirror label beside a weight (show page, prep sheet, PR board), the PR
board ranking (`toLb` / `toFt`), and the group picker ratio (division weight to pounds). Absent `units` on the object means
imperial; the DB column is `not null default 'imperial'`.

## Files
- `lib/units.ts` (new, every helper), `lib/types.ts` (`MeetUnits`, `Meet.units?`)
- Engine: `lib/engine/{scoring,transitions,plates,runOrder}.ts`, `lib/events/spec.ts`
- Readers: `lib/website/{format,briefing,prepSheet,standingsAdapter,prBoard,showHistory,groupPicker}.ts`, `lib/tv/model.ts`,
  `lib/export.ts`, `lib/exportFederation.ts`, `lib/promoter/{contract,rules}.ts`, `lib/sync/{mapping,meetApi}.ts`
- UI: `components/scorer/{MeetSetupSheet,PitCrewSheet}.tsx`, `components/setup/builder/EventForm.jsx`,
  `components/judge/JudgePad.tsx`, `components/tv/{TvBoard,SheetA,SheetB,TvIdle}.tsx`,
  `components/website/{ShowDetailClient,PrepSheetClient,GroupPickerClient}.tsx`, `components/register/RegisterClient.tsx`,
  `components/strongman-app.jsx`, `app/m/[slug]/ScoreboardClient.tsx`
- SQL: `supabase/059_meet_units.sql`, `supabase/060_adopt_units.sql`
- Tests: `test/units.test.mjs`, `test/units2.test.mjs`

## Questions for the audit
1. Any print point still hardcoding lb / lbs / ft / kg where the meet unit should decide (grep `lb|ft` outside
   `lib/units.ts`, fixtures and `MeetSection.jsx`, which is dead UI).
2. Any place that converts where it should not (engine arithmetic, plate maths, judge pad inputs), or fails to convert
   where meets are compared (anything that reads results from more than one meet).
3. The lock rule: units frozen once results exist, enforced in `MeetSetupSheet` (fieldset) and in SQL
   (`zt_publish_meet`, `zt_save_meet_config`). Is there a path that bypasses both (import, clone, adopt, offline sync)?
4. The flip: switching converts nothing and resets `availablePlates` to the unit's default set. Does anything else need a
   reset (collar weight, event tares, light-tier weights, course distances, spec ranges)?
5. `COURSE_MAX.metric = 1610` sits under SQL guard 041's 5280 backstop. Any other validator with an imperial constant
   (spec ranges, `SPEC_LIMITS`, judge pad caps, import parsers)?
6. 060 adopt: kg-only archive shows become metric, anything with lb / ft rows stays imperial with kg / m converted. Is
   "mixed shows stay imperial" the right call, and does `importedDisplay` still read correctly beside the labels?
7. PR board: ranking in pounds, printing in the show's unit with a pound mirror on metric rows. Is the mirror wanted on
   imperial rows too when the athlete has mixed history?
8. Group picker: athlete numbers canonical pounds, toggle starts in the show's unit, PR seeds display in kg on a metric
   show. Does `convertDisplayUnit` round-trip without drift?
9. Registration contract (`PublicRegistrationMeet.units`) and the public show row (`PUBLIC_SHOW_MEET_COLS`): any consumer
   that caches or snapshots meet data and could miss the column?
10. Exports (`export.ts`, `exportFederation.ts`): headers and values carry the unit through the engine display strings;
    confirm a federation importer would not read a kg column as lb.

## Fixtures on staging for a hands-on check
- `metric-test-open-2026` (listed, registration open, 1 locked result; join code and PIN in `tmp/zt/metric_test_staging.txt`)
- `the-scarlet-strongman-show-2024` (adopted kg-only archive show, 180 results, `units = metric`)
- `iron-harbor-classic-2026` (imperial, 0 results, free to flip), `all-out-strongfest-2026-dryrun2` (imperial, 39 results, locked)
