# Staging meet-day dry run, 2026-10-21

**Verdict: scoring and recovery worked in this run, but the PIN-change and completed-board issues need fixes before freeze.** The meet is left **Completed / Final / Unlisted**, with **39 result rows**. Every score is synthetic audit data, not an official athlete result. Production was only opened read-only for comparison; no production join or score writes.

## Findings

| ID | Step / device | What happened | What should happen | Severity | Suggested fix |
|---|---|---|---|---|---|
| DR-01 | 1 + 4, promoter laptop and already-joined judge | Saved a new PIN successfully. An old-PIN judge then wrote a locked 1-rep result; server accepted it. New login with the old PIN was rejected. Existing grants are tied to join code, not PIN changes. | Per the brief, previously authorized phones lose write permission on their next write after a PIN change. | SHIP | Revoke/re-version device grants when the PIN actually changes. Show a re-auth prompt, preserving unsynced scores. Temporary procedure: rotate the code too. |
| DR-02 | 7, public phone/TV board | Server flags are Completed + Final, but even a freshly opened board still says LIVE SCOREBOARD, retains the green live indicator and stale Up Now names/events. No Final label is rendered. The meet remains unlisted as requested, but its direct board is still accessible. | Final standings remain accessible and are visibly final; no athlete appears actively up after close-out. | SHIP | Carry lifecycle state into the board, render Final and suppress/clear Up Now on completion. |
| DR-03 | 6, spectator phone at 375x667 | Full meet name is truncated once timestamp appears; station event lines truncate before the division. | A spectator can identify the meet, athlete and division without guessing. | SHIP | Same fix as MS-06: wrap title and use phone-friendly station strips. |
| DR-04 | 4, judge after Rotate Code | Write is blocked and UI offers Re-join, but the error reads `401: new row violates row-level security policy for table "results"`, with queued writes waiting. | A volunteer understands that access changed and how to recover without losing an attempt. | DAY-OF | Translate this to an expired-access message. Until fixed, record outstanding scores before rejoining, then verify them on the board. |
| DR-05 | 5, pit crew transition card | The card can show a Group 5 badge while its text says the next lifter uses the same Group 4 setup. The badge describes the next group, while the text describes the next athlete. | Current-lifter and next-group instructions cannot be confused during loading. | DAY-OF | Separate “next athlete” from “next group”; have the crew lead call each group change explicitly. |
| DR-06 | 2, phone previously on an unscored demo | Join attaches the correct dry run, but an unscored previous meet gets no recovery snapshot. A scored demo with five results was preserved exactly. Source only snapshots previous state when results exist. | Prior setup/roster should also be recoverable if the phone held unsaved work. | LATER | Snapshot nonempty meet state, not only scored state. Export a backup before reusing a setup phone. |
| DR-07 | 1 + 7, fixture permissions | Astra has `meet_members.role=owner` and can edit the meet, but is not `meets.owner_id`. Deletion is reserved to that canonical owner. | The test brief and owner label should distinguish management membership from canonical delete authority. | DAY-OF | Kurt/Slate, retain the canonical owner account for destructive lifecycle work. UI blank/wrong-name guards were tested; canonical-owner server deletion was not. |

## Per-step results

| Step | Result | Evidence / limits |
|---|---|---|
| 1. Promoter laptop | PASS for management; PIN revocation FAIL | My Meets shows the fixture. All eight tabs inspected. Five groups, 13 athletes, three events, station allocation/override, Roster Order, Event Wins, plates 100/55/45/35/25/15/10/5/2.5, collar 0 match the fixture. New PIN save returned 200. DR-01 explains the failure. |
| 2. Admin phone | PASS; unscored snapshot limitation | The actual Meet Day Open link resolves to Join with the current code; Promoter + PIN opens the dry run, not an old local meet. Second scored-demo profile joined correctly with an exact recovery snapshot. Initial harness looked for the card heading as a link; corrected to its actual Open link and passed. |
| 3. Two judge phones | PASS on the fixture's event types | Station 1 scored Groups 1-2 in E1/E2/E3; Station 2 scored Groups 3-5 in E2/E1/E3. Roster buttons were checked against lot order in all 15 group/event combinations. 39 rows recorded. Included zeros/no successful lift, tied reps/times and a later correction. After Hannah, queue advanced to Nadia then Edward. Fixture has two reps events and one time-or-distance event, no max-weight event; that type was not fabricated or added. |
| 4. PIN / rotate | MIXED | Wrong PIN rejected. Old PIN no longer authenticates, but already-issued grant still writes after PIN change (DR-01). Rotate Code blocks old judge; rejoin with current code/PIN recovers. Signed-in owner-member phone writes after rotation without rejoining. |
| 5. Pit crew | PASS for plate arithmetic; transition wording note | Group 3's 50 added pounds = one 25 per side; Group 4's 200 = one 100 per side; Group 5's 300 = 100+45+5 per side. Zero collar adds nothing. Truck pull says Pickup for Group 1 and Box Truck for the others, with no plate loading. Custom target 51 displays 25.5 per side, one 25 plate and an explicit 1-pound total remainder warning. |
| 6. Spectators | PASS for score updates and controls; readability FAIL | Phone/TV boards populated while judging; station Up Now content and division filters rendered, Group 5 filter and Phone/TV toggle worked. Ties produce averaged event points. Correction reached TV in 2.27 s including explicit Sync now; a capped 42.5-ft result reached TV automatically in 3.43 s. Athlete/Spectator join hides Judge Pad and Meet Setup and shows read-only floor data. |
| 7. Close-out | MIXED | Listing save 200, Completed/Final/Unlisted verified on server. Board still serves all 39 rows, but does not present final lifecycle (DR-02). Delete confirmation disabled for blank and wrong name. No deletion was submitted; source separately rejects live/completed deletes and checks canonical owner. |
| 8. Offline / reload | PASS in browser network emulation | Offline phone stored two attempts (5 and 6 reps). On reconnection plus Sync now they reached server/TV in order, one row per athlete/event. Server times 16:44:33.911328 and 16:44:33.912020 UTC. Reload retained judge role and grant; pending queue empty. This was Chromium offline mode, not hardware airplane mode. |
| 9. Same-division collision | PASS for bounded last-write-wins case | Two judges wrote 5 then 7 reps to the same athlete/event. Final server and TV value was 7. That athlete's other events remained 1 rep and 28 seconds during the collision. This was closely sequenced independent phones, not a timestamp-identical race; absence of every possible transient flicker is not certified. |

## Saturday checklist

- Open the real meet from My Meets. Check its name on every phone; use the Meet Day join link for the admin phone.
- Set the PIN **before** joining judges. If revoking access, rotate the code as well until DR-01 is fixed. Keep one owner-account phone signed in.
- Assign one judge to each station. Station 1: Basket, Keg, Truck. Station 2: Keg, Basket, Truck. Confirm the selected group before scoring.
- Pit crew: Group 1 uses the pickup; Groups 2-5 use the box truck. Collar is zero. Verify basket plate amounts separately from the keg/total-load callouts. Read remainder warnings.
- If offline, keep the phone and local state intact. Reconnect, use Sync now, and confirm the scores on TV. Before any rejoin after an access error, record all waiting attempts; verify and re-enter missing ones afterward.
- Do not treat a tied total as a tied placing until Event Wins and the secondary tiebreaker are applied.
- At close-out export a backup/results record, set Completed and Final, and verify the board. Until DR-02 is fixed, announce final results separately because its Live/Up Now labels are stale.

## Evidence and fixture state

- Source `d6d80efc` differs from brief `c26917f0` only by the two audit briefs. **363 tests pass, 0 fail; TypeScript clean**. Live preview was exercised; deployment SHA itself was not independently fingerprinted.
- Staging fixture: `all-out-strongfest-2026-dryrun`, ID `da868c90-7d0d-4413-ae1d-d933a8f47ebc`. It remains Completed/Final/Unlisted with 5 divisions, 3 events, 13 athletes and 39 unique result keys. No reset performed.
- Join code was rotated and PIN changed. Current test credentials are kept locally in `~/.aki/tmp/astra-freeze/final-code.secret.json`; the original staging credential file is now stale. Credentials are redacted from report evidence.
- [Evidence JSON](astra-2026-10-21-dry-run-evidence.json); [captures](dry-run-2026-10-21/). All testing stayed in this Astra thread. No app code, SQL, configuration, or production data was changed.
