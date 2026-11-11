# Scoring audit: ZeroTacky engine vs Iron Podium (2026-11-10)

**Question (Kurt):** "How do we know the scoring is right, when all anyone has ever seen is Iron Podium?"

**Answer:** after this audit the engine reproduces Iron Podium's published rules and nine real 2025 scoreboards for everything a USS / Strongman Corporation meet uses day to day: N-down-to-1 points, zero = 0, split points on event ties, distance+time and reps+time tiebreaks, and the "lookback" overall tiebreak. One rule was wrong before today (the overall tiebreak) and is fixed; four event formats Iron Podium offers are not modelled yet and are listed below as open items.

## Sources

- Iron Podium docs, "Strongman Point System", "Selecting a Scoring Format", "Tiebreakers": https://ironpodium.com/docs/getting_started#scoring-format-heading
- Nine finished 2025 scoreboards read through the public JSON (`ironpodium.com/api/get_scoreboard/<id>`, pulled 2026-11-10): Idaho Strongman Championships (18445), 2025 Roger Tully Memorial (19053), Tri-Cities Showdown (18864), Mullet Eagle Jamboree (18546), Red River (18946), 2025 QRF Invitational (18719), Summer Slam 25 (18594), Iowa Games (18767), Strongman Showdown 2025 (19045). Eight are USS-sanctioned, one unsanctioned. Raw pulls: `~/.aki/tmp/zt/ip_boards/`.
- Strongman Corporation and USS publish no scoring rule text on their sites (checked 11/10: Athlete Info, Host a Show, FAQ). SC requires scores "on Iron Podium" or sent within 7 days; USS score sheets show split points and "COUNT BACK". Iron Podium is the de facto rulebook.

## Rule-by-rule

| Rule | Iron Podium (docs + observed) | ZeroTacky before | Now |
|---|---|---|---|
| Points per event | N for 1st down to 1, N = athletes in the class | same | same |
| Zero / no lift | 0 points | 0 points, place N | same |
| No-show | removed from the class before scoring (N shrinks) | withdrawn with no score leaves the field | same |
| Event tie | pooled points split equally (3-way tie for 2nd of 8 = 6 each) | same formula | same |
| reps | ties split, no time | same | same |
| lbs (max) | ties split | same | same |
| lbs + attempts (Wessels) | earlier attempt at the same weight wins | **not modelled**: ties split | open item 1 |
| ft + mm:ss | full course ranked by time; short of the course ranked by distance, time entered as the cap | same (finished = time within cap; otherwise distance) | same |
| reps + mm:ss | more reps, then earlier split of the last rep | same as `time_or_implements` | same; missing split now scores at the cap (was: below any recorded split) |
| mm:ss (time only) | faster wins | `time_or_distance` with a finish time | same |
| ft / m (max distance) | further wins | `time_or_distance` with no finish; display appends "(DNF)" | open item 3 |
| +mm:ss (hold, longer wins) | longer time wins | **no scoring type** | open item 2 |
| kg / m units | selectable | lbs / ft only | open item 4 |
| **Overall tie** | **"lookback": most 1sts, then 2nds, then 3rds; still level = shared place; bodyweight as the alternative** | **event wins, then final-event points** | **lookback default; bodyweight, event_wins, final_event, none selectable** |

### The overall-tiebreak finding, with the real case

Idaho 2025, Novice Men, 6 athletes, two on 9.0 points. Iron Podium placed the athlete with a shared 3rd (squat) 4th and the athlete whose best was 4th 5th. ZeroTacky's `event_wins` rule (0 wins each, then final event: 3.0 vs 1.5) would have reversed them. Red River 2025 Masters W 165: two athletes level on 1st/2nd/3rd/4th counts stayed tied at 2nd on Iron Podium even though their final-event points differed; the old rule would have split them. QRF 2025 Open SHW: three event wins beat a final-event 7-of-8; both rules agree there. All three are now tests (`test/ironpodium_replay.test.mjs`).

The docs stop lookback at 3rd places ("so forth through 3rd placements"). The engine does the same: level through 3rds shares the place. Iron Podium's lookback was applied only on finalized meets; the Roger Tully board (event 5 never scored) shows ties unbroken, so nothing in that meet contradicts the rule.

## Changes (all local, tests 762 pass, tsc clean)

- `lib/engine/tiebreak.ts` (new): `TIEBREAKER_OPTIONS` (value, label, short, explain), `DEFAULT_TIEBREAKER = 'lookback'`, `normalizeTiebreakerRule`, `describeTiebreaker`, `compareTiebreak`. One list drives the engine, the meet builder, the scorer Meet Setup sheet and the standings headers.
- `lib/types.ts`: `TiebreakerRule = 'lookback' | 'bodyweight' | 'event_wins' | 'final_event' | 'none'`; `StandingRow.placeCounts: [1sts, 2nds, 3rds]`, `StandingRow.bodyweight`.
- `lib/engine/scoring.ts`: `calculateDivisionStandings` sorts by total, then `compareTiebreak`, then lot number; `isTiedOverall` = level under the chosen rule. Zero-score rows never earn a place count. `time_or_implements`: missing split scored at the cap.
- `lib/meetBuilder.ts`: new meets default to lookback; unknown stored values normalise to lookback (every stored meet so far carries an explicit rule, so existing meets keep what the promoter chose).
- `lib/website/standingsAdapter.ts`: uses the engine's `isTiedOverall` instead of recomputing a points|wins|final signature (its own header said it must not re-implement the formula; it did).
- UI: `MeetSection.jsx` re-exports the shared options; `Standings.jsx`, `LeaderboardTable.jsx`, `ShowDetailClient.tsx` print `describeTiebreaker(rule).short`.
- Presets / fixtures: York preset and the demo shows use lookback; Iron Harbor rules summary says so.
- Tests: `test/ironpodium_replay.test.mjs` (Idaho replay, Red River shared tie, QRF wins, bodyweight, normalisation, labels, missing split); `test/showHistory.test.mjs` split into the lookback default (Emily and Jessica share 2nd, as Iron Podium would) and the event_wins variant.

Not changed: Supabase `meets.tiebreaker_rule` column default and the publish function's `coalesce(..., 'event_wins')`. Both only apply when the app sends null, which it never does. Cosmetic; fold into the next migration.

## Open items (not fixed today)

**Update 11/11:** items 1, 2, 3 and 5 shipped (UI_TRANSITION_NOTES.md "Scoring audit follow-ups", tests `test/scoring_formats.test.mjs`); item 4 stays open as its own build (unit-named payload fields). Original list kept below.

1. **Max weight with attempt tiebreak (Wessels).** Needs an event option (`maxTiebreak: 'attempts'`) and the attempt number of the best good lift from the judge pad's `attemptLog`. Common at US meets; the Idaho promoter wrote "Wessels rules" and still used plain lbs on Iron Podium, so plain split is a defensible default.
2. **Hold events (longer time wins).** Hercules hold, crucifix and hammer hold need a new scoring type (`max_time`) where the pad enters one time and the longer time ranks first.
3. **Max distance display.** A pure distance event run as `time_or_distance` prints "N ft (DNF)". Needs an event flag (`distanceForMax`) that drops the suffix and relabels the pad.
4. **kg / m entry.** Pad and standings are lb/ft; the group picker already converts for display. Promoter-level unit choice is a later build.
5. **"impl" wording** on reps+time events that are not medleys (stone over bar, sandbag toss): the engine is right and the label says implements, so the fix is an event-level label.
