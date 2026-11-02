# Audit: meet-day dry run on staging (2026-10-21, Wed pm)

Saturday is the real thing. This round runs the whole meet day on a staging copy of the live Strongfest configuration and reports anything that does not work well, in the order a promoter, judge, pit crew or spectator would hit it. Treat "works but is awkward on a phone in a loud gym" as a finding. Nothing here touches prod data; prod is read-only for comparison.

Build: v2 preview `https://zerotacky-git-v2-kvpollack-6654.vercel.app` on staging `hryiqiopkihkcrkdyllg`, v2 `c26917f0` (= main `37a84557` on prod). `tsc` clean, `bun test test/` 363 pass.

## Fixture
`all-out-strongfest-2026-dryrun`, "All Out Strongfest 2026 (DRY RUN)", a copy of the live prod meet taken today: 5 divisions (Groups 1 to 5), 3 events, 13 athletes with the real lot order, Station 1 = Groups 1 and 2, Station 2 = Groups 3 to 5 with the event order override `sf-ev-2, sf-ev-1, sf-ev-3`, Roster Order run order, event-wins tiebreaker, plates 100/55/45/35/25/15/10/5/2.5, collar 0, truck pull callouts per group (pickup for Group 1, box truck for the rest). Unlisted, `is_demo` false, so roles, PIN and writes behave exactly as prod will. Your staging account (`astra.staging@zerotacky.com`) is an owner of this meet, so My Meets shows it and you can read the join code and set the PIN on the Meet tab yourself. Kurt and Slate hold the current code and PIN too.

The live prod meet `all-out-strongfest-2026` is there for comparison only: open its board and show page, do not join it, do not score it.

## Run it like Saturday
1. **Promoter laptop.** Sign in, My Meets, open the dry run. Read every tab against the fixture above; anything that disagrees with it is a finding. Set a fresh PIN on the Meet tab, save, note what happens to phones already joined (see 4).
2. **Admin phone.** From the Meet Day tab use "Promoter / Admin Phone: Open This Meet" (the join URL), pick Promoter, enter the PIN. The meet name on the scorer must be the dry run, not whatever that browser profile held before. Then try a second profile that previously opened the demo show and confirm the join link still attaches the dry run and does not silently overwrite the other meet's local data.
3. **Judge phones, two of them, one per station.** Join by code, Judge role, PIN. Score Station 1 Event 1 for Groups 1 and 2 and Station 2 for Groups 3 to 5 in the overridden order (Event 2 first). Reps, max weight and time or distance as the events demand, including a zero, a tie, a no-lift and a correction after the fact. Watch the Next Up queue on each phone; it must follow the station's own event order and Roster Order.
4. **PIN and code.** A phone with the wrong PIN, a phone whose PIN was changed in step 1 (it should lose write on the next write and recover after re-entering), a phone that joined before Rotate Code on Meet Day (locked out on next write, back in with the new code). A signed-in owner phone must be unaffected by the rotate.
5. **Pit crew phone.** Pit Crew role: loading calculator per division target with the real plates, callout headlines for the truck pull, no collar maths at 0. Check a target that cannot be made with the plate set.
6. **Spectators.** `/m/all-out-strongfest-2026-dryrun` on a phone and `?layout=tv` on a laptop while scoring is happening: update latency, Up Now strips per station, division chips, standings after each event, tie display, the Phone/TV button. A spectator who joins with the code in Spectator or Athlete role must be read-only.
7. **Closing out.** Promoter sets competition status to Completed and results to Final on the Listing tab (leave it unlisted). Board shows final standings and stays up. Delete must refuse a finished meet without the typed name.
8. **Offline and recovery.** Put a judge phone in airplane mode mid-event, score two attempts, come back online: writes land once, in order, no duplicates. Reload a judge phone mid-meet: role and PIN survive, queue resumes.
9. **Concurrency.** Two judges scoring the same division at once (a mistake that will happen): last write wins without corrupting the other event, and the board does not flicker between states.

## What counts
Anything that would make a promoter reach for paper on Saturday: a write that silently fails, a queue that shows the wrong athlete, a calculator that is wrong by one plate, a role that can do more or less than its name, a page that needs a pinch-zoom, a wait over 5 s for a score to appear on the board, a message a volunteer would not understand. Severity: SHIP (before Thursday freeze), DAY-OF (a procedure note for Kurt), LATER.

## Report
`audits/astra-2026-10-21-dry-run.md` with the per-step results, a findings table (step, device, what happened, what should happen, severity, suggested fix) and a short "Saturday checklist" of procedure notes that do not need code. Evidence JSON beside it. Leave the dry-run meet in its finished state; we will reset it if a retest is needed.
