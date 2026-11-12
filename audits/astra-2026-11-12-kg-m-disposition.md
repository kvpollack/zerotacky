# kg / m audit, disposition (Slate, 2026-11-12)

Astra report: `astra-2026-11-12-kg-m.md` (snapshot `86514d46`). Build: migration 061 + the files below. Full write-up with
mechanisms and probe results: `UI_TRANSITION_NOTES.md`, "kg / m audit fixes (11/12, migration 061)". Tests 837 pass,
typecheck clean. Staging: 061 applied, live four-context probe `shots/units4.py` passed (KM-01 through KM-04).

| Finding | Disposition | Where |
|---|---|---|
| KM-01 judge keeps `units: 'metric'` after a metric -> imperial refresh | Fixed | `lib/sync/mapping.ts` `applyServerMeet`, `hooks/useMeetSync.js` |
| KM-02 admin phones skip config refreshes, can republish stale units | Fixed, three layers: `configAt` re-read, `STALE_CONFIG` refusal in `zt_publish_meet`, publish stops after a pre-pull config change | `lib/sync/controller.ts`, `lib/sync/meetApi.ts`, `supabase/061_units_audit.sql` |
| KM-03 offline results upload without unit provenance | Fixed: `payload.units` stamp, `zt_results_check_units` trigger, rows held on the phone with the server text | `lib/sync/mapping.ts`, `lib/sync/controller.ts`, `components/judge/JudgePad.tsx`, `components/judge/padModel.ts`, 061 |
| KM-04 board / TV keep stale config | Fixed: re-fetch on `meetUpdatedAt` change | `app/m/[slug]/ScoreboardClient.tsx` |
| KM-05 picker convert / parse grammars differ | Fixed: one grammar | `lib/website/groupPicker.ts` |
| KM-06 picker ratio from rounded display text | Fixed: canonical unrounded pounds in state | `components/website/GroupPickerClient.tsx`, `lib/website/groupPicker.ts` |
| KM-07 metric courses accepted by SQL, hidden by UI | Fixed: unit-aware `zt_check_event_spec` + trigger, `validateMeet` | 061, `lib/meetBuilder.ts` |
| KM-08 imperial plate defaults on metric ingestion | Fixed in publish, adopt, normalizeState, blank meet | 061, `lib/meetBuilder.ts` |
| KM-09 federation Bodyweight unlabeled | Fixed: `Bodyweight (lb)` | `lib/exportFederation.ts` |
| KM-10 PR ranking precision | Fixed: exact converters | `lib/units.ts`, `lib/website/prBoard.ts` |
| D1 flip resets | Built: confirm + clear of every unit-bearing number | `lib/meetBuilder.ts` `planUnitFlip`, `components/scorer/MeetSetupSheet.tsx` |
| D2 PR mirrors on imperial rows | Built | `lib/website/prBoard.ts`, `lib/units.ts` |

Found during the re-probe and fixed in the same build: both 061 trigger functions needed `security definer` (a judge
phone's anon role cannot `select ... for share` on `meets`; it surfaced as a code / PIN refusal).
