# ZeroTacky v2 rehearsal audit, 2026-10-17

**Gate verdict: merge 10/21: NO.** The ownerless claim and registration foreign-key blockers are fixed. Live scoring, offline recovery and registration-to-judge now have real browser evidence. However, a joined phone rejects the real nondefault admin PIN and unlocks with `1050`, and a stale publisher can delete an accepted, unscored entrant while leaving its registration accepted. Both must be fixed before this build becomes the meet-day build. The second-account switch remains blocked by email confirmation.

## Scope and verification

- Audited working copy: `9c5025b56a6a15ad23685e81020f14e2d8511e63`. All **168 tracked blobs** matched the GitHub v2 tree at the start. There is no local `.git` checkout; comparison used read-only GitHub Git Data requests and Git blob hashes.
- `bun test test/`: **206 pass, 0 fail, 16 files**. The Python wrapper later exited 120 while handling its output; the complete test log records the successful suite. Non-emitting TypeScript was independently rerun after its wrapper lost the first result: **TSC_EXIT=0**, `--noEmit --incremental false`.
- Real Chrome contexts: admin, judge, projector, anonymous registrant/second account, stale admin. Additional dashboard tabs shared only the admin context. Mobile contexts were 430 px wide; projector was 1280 px. No delegated findings.
- Initial creation/claim/scoring ran at `http://localhost:3079`. Local development reloads interrupted some page loads, so I copied only these audit contexts' persisted test state to the supplied staging preview and continued there: `https://zerotacky-git-v2-kvpollack-6654.vercel.app`. This origin transfer was test setup, not a normal user journey or proof of cross-origin sync. The preview used staging `hryiqiopkihkcrkdyllg`; production URLs were blocked by the harness. GitHub reports a successful Vercel deployment for the audited commit; I did not independently prove every byte served by the mutable preview alias.
- No project source/config changes, fixes, SQL, migrations, Auth configuration changes, production requests or production data changes. Persistent writes were confined to fictional audit rows in staging. The supplied key and account password are omitted from this report.
- Evidence levels below are explicit: browser UI, browser-origin REST/RPC, source, or unit tests. Fault injection blocked selected browser requests; it did not fake server successes. A passing unit test is not called a live account-switch test.

## Part 1: every disposition in PROMOTER_NOTES section 5

| # | Disposition | Verdict | Independent evidence / remaining gap |
|---|---|---|---|
| 1 | Ownerless claim | fixed | Signed-out key publish returned 200; signing in on the same phone retained the saved-key explanation and account identity; claim returned 200; `/promoter` listed the meet and its tabs worked. Forget followed by keyless Publish update returned 200. `hooks/useMeetSync.js:31-38,186-195`; `components/setup/SyncPanel.jsx:95-128`; `006_ownership.sql:81-107`. |
| 2 | Composite registration FK | fixed | Accept then Decline in the dashboard returned 200, nulled only athlete linkage and removed the unscored athlete from the judge. Separately, actual `withdrawn` RPC returned 200 for accepted, unscored Six. Scored Five was refused. `007_gate_fixes.sql:18-20,289-310`. New stale-publish inconsistency is R2, not a claim that this FK still throws 23502. |
| 3 | Account queue bound to user ID | partial | Keyless link stored owner UUID. Real sign-out kept two queued rows and showed paused; triggering focus with network restored sent zero admin REST writes; original owner sign-in drained queue. Unit tests cover differing IDs and source wires session user ID (`controller.ts:191-225`; `useMeetSync.js:49-57,113-116`). A second real account could not sign in: `Email not confirmed`. No live wrong-account pass claimed. |
| 4 | Hidden PIN + server PIN check | regressed | Join RPC really returns `admin_pin:null`, and direct server checking/throttling works. But scorer hydration inserts `1050`, so joined-phone UI never calls the RPC. Correct `7391` refused; `1050` accepted; 11 wrong UI attempts only showed `Wrong PIN`. See R1. Local PIN and role-key tampering also bypass UI lock. |
| 5 | Listing revision RPC | partial | Two real tabs: A closed; stale B's valid federation change returned 400 and the reload message; registration remained closed. Whitelist ignored attempted `owner_id`, `join_code`, `admin_pin` changes. But old direct UPDATE grants still bypass revision/cap rules: authenticated browser PATCH set cap 1 with six roster athletes, 204. See R4. No confirmed nonowner/member account was available for a separate live authorization matrix. |
| 6 | Commit then reread | partial | Listing and immediate meet reread paths gained `committed:true`, with passing unit coverage. Create still catches child-read failure as a bare failure; real Create RPC 200 followed by blocked divisions read showed `TypeError: Failed to fetch`, left Create enabled, and the meet existed. `supabaseApi.ts:287-295,377-390`; `PromoterDashboardClient.tsx:78-100`. See R3. |
| 7 | Anonymous submit hardening | partial | Duplicate UI submit refused; long name, unknown waiver, weight 1001 and expired waitlist refused by real RPC. Unique index, length checks, inbox cap and rate buckets present (`007:34-36,98-221`). Advertised 1..1000 bound still accepts 0.5, verified as a stored pending registration. Failed validations roll back transactional rate increments; no load/DoS claim or IP-spoof resistance claim. See R7. |
| 8 | Manual roster cap | partial | Dashboard 6-at-cap-5 refused; raise to 6 then save succeeded; lowering to 5 refused. Correct UI/RPC behavior. Direct PATCH can undo the cap invariant (R4), and `006` full-publish/scorer writes do not share `007`'s config-save guards. Do not describe this as a database-wide cap guarantee. |
| 9 | Accepted athlete division/name policy | partial | Dashboard moving Five to Alpha returned the specific registered-division refusal. Name/bodyweight corrections remain allowed by the explicit decision. Stale full publish still deletes an accepted unscored athlete and leaves status accepted, R2. `007:361-388` applies to dashboard save, not `006` publish. |
| 10 | Sticky auto-publish refusal | partial | Scored-event removal really auto-published and received 004 refusal; “Last publish was refused” survived a successful read tick and cleared after restoring and successful publish. Exact scored-athlete deletion requested by the brief did not auto-publish: roster/result came back from pull, zero publish calls, no refusal. `useMeetSync.js:171-184` omits athletes from config signature; see R5. |
| 11 | Fresh migration upgrade dry run | not fixed | Not performed by this audit, per no-SQL boundary. Staging behavior proves relevant 007 functions are active, not that an untouched 001/002/004 database upgrades. Slate's proposed dry run has no result supplied here. |
| 12 | C5 schema/roadmap docs | fixed | `ROADMAP.md:21-23` correctly names 003, describes entry_fee_display rather than an existing registration_fee amount and includes 007. `PHASE1_SYNC_NOTES.md:207-209` describes keyed claim and user-ID binding. |
| 13 | C6 waiver evidence | partial | Current version `a995ce0eab26` stored on live registrations; arbitrary version refused. No rendered event/date/venue/promoter snapshot is persisted (`007:205-212`). Acceptance timestamp does not reconstruct overwritten listing values. Legal approval remains Kurt's pre-signup prerequisite. |
| 14 | M13 / M16 accepted deferrals | not fixed (accepted deferrals) | Unknown register/promoter lookups remain client-resolved; privacy contact and SLA-confirmation placeholders remain (`legal/PRIVACY.md:51`). Preserved as accepted M4/operator work, not newly reopened blockers. |
| 15 | M19 browser/server-boundary depth | partial | This audit adds real multi-context browser/server observations, including offline, claim and registration. No automated deployed E2E suite was added to the repository. Second-account switch and actual token expiry remain unverified; initial fixture tests did not catch R1/R2/R3. |
| 16 | STYLE shell bar / preview badge | fixed | Live browser no longer showed the skeleton badge; `WebsiteShell.tsx:30-37` guards it by backend configuration and uses plain sentences. A separate stale live Listing sentence remains, STYLE below. |

## Findings to fix or explicitly decide

| ID | Severity | File:line | What | Why it matters | Suggested fix |
|---|---|---|---|---|---|
| R1 | **HIGH** | `lib/meetBuilder.ts:136-139`; `hooks/useMeetState.js:30-33`; `hooks/useRoleLock.js:15-22,49-65` | After join omits the secret PIN, normalization restores `1050`; hook trusts any local PIN and bypasses `zt_check_admin_pin`. Actual server PIN `7391` returned true directly, but UI said `Wrong PIN`; UI accepted `1050` with zero PIN RPC calls. Editing local PIN to `8642` also unlocked; setting role key to admin bypassed the prompt entirely. | This is a new v2 regression for ordinary, non-tampering users: the real nondefault PIN no longer unlocks a joined phone, and a public default does. The localStorage bypass also means the role lock is not an authorization boundary. It does not establish unauthorized access to owner dashboard RPCs. | Preserve “PIN absent” through hydration and require linked volunteer phones to use server verification regardless of local PIN; enforce any genuinely privileged operation server-side rather than trusting local role state. |
| R2 | **HIGH** | `supabase/006_ownership.sql:127-138`; `007_gate_fixes.sql:18-20,260-262,361-388`; `lib/sync/controller.ts:232-237` | With stale phone athlete/result pre-pulls blocked, full publish returned 200 and deleted newly accepted, unscored Six. Registration remained `accepted` with `athlete_id:null`; judge lost Six; dashboard no longer showed On Roster and Accept was disabled. | Normal partial connectivity plus an older admin copy can silently remove a registered athlete from the floor. Fixing the FK now lets this previously blocked deletion succeed. Accepting the same accepted status is a server no-op, so direct repeated Accept does not repair it. | Apply accepted-linkage, division and cap invariants to every publish/write path, and reject stale authoritative roster replacement instead of proceeding after failed pre-pull. |
| R3 | **MED** | `lib/promoter/supabaseApi.ts:276-295,377-390`; `lib/promoter/db.ts:146-155`; `components/promoter/PromoterDashboardClient.tsx:78-100` | Create commits, then child fetch fails; UI reports only `TypeError: Failed to fetch` and allows Create again. Both fault-test meets persisted. Save also has an outer bare catch if buildMeetDetail's child read throws. | The user cannot distinguish a committed write from rollback and may retry a completed mutation. This is the same gate finding, not fully fixed. | Track commit completion across all downstream reads and handle committed failures in both Create and detail-page UI with reload rather than retry. |
| R4 | **MED** | `supabase/006_ownership.sql:19-25`; `007_gate_fixes.sql:498-586` | Authenticated direct REST PATCH still works outside `zt_update_listing`; I set cap 1 with six athletes, got 204 and reread cap 1, then restored cap 8. | New validation/revision rules can be bypassed by an old client or owner/member request; “all dashboard writes are RPCs” describes only the new client. Whitelist itself did not permit ownership/PIN changes. | Remove unused direct UPDATE grants or enforce equivalent invariants at the table boundary. |
| R5 | **MED** | `hooks/useMeetSync.js:171-184`; `components/setup/SyncPanel.jsx:167-168` | Athletes are excluded from auto-republish signature despite UI saying roster changes republish. Confirmed deletion of scored One made no publish call; the next pull restored athlete/result without an error message. | The exact rehearsal step and displayed behavior do not match; removals can appear undone rather than refused. Scored-event deletion proves the sticky-error implementation itself works. | Route roster removals through a guarded authoritative operation or disallow them with a clear local explanation; make UI copy match the supported behavior. |
| R6 | **LOW** | `components/promoter/RegistrationsSection.tsx:176-195` | Dashboard only offers Accept/Decline, not Withdraw. Actual withdrawn status worked through the authenticated RPC. | The requested “withdraw from dashboard” step cannot literally be performed, although Decline exercises the same unscored deletion path. | Add the intended Withdraw action or revise the supported workflow/runbook to say Decline. |
| R7 | **LOW** | `supabase/007_gate_fixes.sql:192-200` | Server promises 1..1000 but checks `<=0`, so hostile anonymous input `bodyweight:0.5` was stored. | Validation disagrees with its documented range and allows implausible values. | Use the agreed lower bound consistently in server validation, fixtures and tests. |

Other limits of the hardening: `zt_rate_check` runs in the submit transaction, so an exception later in submission rolls back that hit. It limits successful submissions, not all failed attempts. Anonymous email is not ownership-verified; an attacker can reserve someone else's email/division with a syntactically valid request. Inbox caps and throttles reduce volume but do not establish identity. I did not flood staging or claim CAPTCHA/IP spoof protection was tested. Listing `venue` is arbitrary JSON at `007:574`, unlike the typed UI shape; type/size validation is not established by the whitelist test.

## Part 2: numbered live rehearsal observations

### 1. Key phone, signed out: PASS

Created **Astra Rehearsal 20261017** through the scorer's blank-meet UI, two divisions, two reps events and four fictional athletes. Pasted the supplied staging key in Sync and published: HTTP 200, meet `413ea354-3dce-48a7-ab77-dd240b9e1375`, slug `astra-rehearsal-20261017`, initial join code `3V4EZ4`. Link recorded `auth:key`, no user ID. No existing Strongfest row was touched.

### 2. Claim and keyless account publish: PASS

The now-confirmed `astra-gate-20261017@zerotacky.com` signed in through Account. Back on scorer, Publishing as and the saved-key explanation were present. Publish update returned 200. Dashboard listed the meet as this account's and all seven tabs were available. Forget then Publish update also returned 200; sync link became `auth:account`, user ID `182bf6c7-bbfb-4db7-91b0-42f51a92cbf8`. Final owner RPC read returned this owner ID. Membership was exercised indirectly as requested; no SQL/member-table inspection.

### 3. Judge scoring and PIN: FAIL (PIN), scoring PASS

Independent context joined by code and selected Judge. Scored One and Two in Press, Two in Deadlift; later edited One from 3 to 4 Press reps offline and Two from 2 to 3 after rotation. Five and Three also received Press results.

Changed admin PIN through Setup from default to `7391`; auto-publish returned 200. Judge had normalized local PIN `1050`. Correct `7391` and wrong `0000` showed **“Wrong PIN”**; eleven repeated wrong UI attempts never throttled, and `1050` unlocked. Zero UI requests to `zt_check_admin_pin`. Direct RPC returned true for `7391`; after that one successful check, nine wrong requests returned false and the next two returned **“Too many attempts from this device. Wait a few minutes and try again.”** This confirms server throttling but not UI integration. Later local PIN `8642` and local role `admin` bypasses also reproduced.

### 4. Projector: PASS

Independent projector loaded `/m/astra-rehearsal-20261017?layout=tv`, displayed scores from the judge, switched to phone layout, then loaded TV with `theme=volt`. Exact athlete-row waits confirmed One's edited **4 reps** and Two's edited **3 reps**, not merely another row already displaying the same value. Final screenshot visually checked: six athletes across both divisions, five results, five unique result IDs. TV DOM reported theme `volt`.

### 5. Guard from the phone: FAIL for exact athlete-auto-publish step; scored-event substitute PASS

Confirmed **Delete Astra One (1 score)** on admin. There were **zero publish calls**; One and the result came back from server pull; no “Last publish was refused” appeared. This is R5, not evidence that 004 failed.

To exercise 004 from a real phone, deleted scored **Astra Deadlift** instead. Auto-publish returned 400:

> Event Astra Deadlift has 1 recorded result(s) and cannot be removed. Mark the athlete withdrawn, or Reset scores first.

The Sync panel's **“Last publish was refused:”** persisted across a successful read tick. Restored the captured test-meet JSON through Restore from File / Replace & Restore; publish returned 200 and the error cleared. No Reset scores was used.

### 6. Account switch: COULD NOT RUN second-account segment; sign-out/owner recovery PASS

Went offline on admin, scored Three in Press and retained two queue entries (score and live state). Blocked REST temporarily while returning online and signing out so queued work could not escape before the sign-out action. Removed that interception once paused. UI:

> Signed out. This meet was published from your account; sign back in to resume syncing. Scores stay on this phone meanwhile.

Queue stayed at two; a focus-triggered cycle sent zero admin REST writes while signed out. Created `astra-rehearsal-second-20261017@zerotacky.com` through Account. Signup required confirmation; password sign-in returned HTTP 400 **“Email not confirmed”**. I did not confirm it, change Auth or invent a second identity. Original owner signed back in and queue drained to zero. “Different ZeroTacky account” is unit/source verified only, not a live two-identity result. Actual JWT expiry/refresh failure was not induced.

### 7. Registration to judge and withdrawal: PASS core flow; exact Withdraw UI unavailable; stale-publish FAIL separately

Listed/opened the meet with cap 5 and designated test contact. Fresh anonymous browser submitted Five successfully, repeated the same email/division and got 400:

> An active or pending registration already exists for this email in the selected division.

Submitted Six successfully while still pending. Accept Five returned 200; judge added `reg-ath-4552d90a` without rejoining. Accept Six at a full roster returned:

> Astra Rehearsal 20261017 is at its athlete cap (5). Raise the cap in Listing before accepting Astra Registrant Six.

Dashboard has no Withdraw button. Decline Five (unscored) returned 200, cleared linkage and shrank judge roster from 5 to 4. Reaccepted and scored Five. Decline then refused:

> Astra Registrant Five has recorded results (Astra Press), so the request cannot be declined. Results are read-only here; mark the athlete withdrawn on meet day instead.

After raising capacity later, accepted Six and called authenticated `zt_set_registration_status(...,withdrawn)` from the browser: 200, status withdrawn and athlete_id null. Actual withdrawn call for scored Five was refused with the same event named and **“cannot be withdrawn.”** Dashboard division edit for Five refused:

> Astra Registrant Five registered for a specific division. To move them, decline or withdraw the registration and accept it again under the new division.

Server closed-status and expired-waitlist checks also refused. Separate hostile probe stored bodyweight 0.5, R7. Later stale-publish test deliberately left Six accepted without a roster row, R2.

### 8. Listing race: PASS current UI/RPC; direct-write bypass R4

Two loaded dashboard tabs. A closed registration with 200. B retained its old revision and saved a valid federation edit: 400:

> This meet changed since you opened it (saved 2026-10-17T19:04:24Z). Reload to see the latest version, then redo your edits.

Server registration stayed closed. An initial stale-tab attempt with a facility name but missing address was stopped by client validation and was not counted as a race test. RPC patch keys owner_id, join_code and admin_pin were ignored, confirmed by returned row. Direct authenticated PATCH later bypassed cap validation, as described in R4; restored to 8 afterward.

### 9. Cap: PASS dashboard flow

At five roster athletes/cap five, added fictional Walkin Seven in dashboard. Save refused:

> The roster has 6 athletes but the listing cap is 5. Raise the cap in Listing or remove athletes before saving.

Raised cap to 6, preserved the dirty roster draft, saved again: 200. Lowering cap to 5 refused:

> The roster already has 6 athletes; the cap cannot be lower than that.

Later direct probe temporarily set cap 1 through the old PATCH grant, then restored it to 8. Final cap is 8, six roster athletes, registration closed.

### 10. Stale publish: FAIL accepted-unscored integrity; scored rows preserved

Seeded a separate key-admin context with this test meet's earlier four-athlete/no-score state. Blocked its athlete/result GETs to reproduce failed pre-pull while allowing the real Publish RPC. Publish refused with 400:

> Athlete Astra Registrant Five has 1 recorded result(s) and cannot be removed. Mark the athlete withdrawn, or Reset scores first.

After restoring network, the first publish still refused while state caught up; after six-athlete local state arrived, the next publish succeeded. This is not a claim that awaited pull synchronously updates React state before publish.

Then froze a current six-athlete state, blocked pre-pulls again, and reaccepted unscored Six from dashboard/RPC. The stale phone published successfully (200), deleting Six. Registration reread: **status accepted, athlete_id null**. Dashboard removed On Roster and disabled Accept; judge dropped Six on its next pull. No result was lost.

Final surviving roster: **Astra One, Astra Two, Astra Three, Astra Four, Astra Registrant Five, Astra Walkin Seven**. Five results survived: One Press 4, Two Press 3, Two Deadlift 4, Five Press 1, Three Press 1. Two's Press was 2 at the earlier stale-publish check and became 3 in the later rotation test. Six has no result and is absent from roster despite accepted status.

### 11. Offline: PASS

Judge offline: unlocked One's existing Press result, incremented 3 to 4, relocked; local queue held the write. Reconnect drained to zero and projector One row changed to 4 reps. Server final inventory contains five result IDs, all unique, not a duplicate for the edit. Admin offline/sign-out recovery described in #6 also persisted Three's score.

### Additional: join-code rotation PASS

Dashboard Rotate Code returned `3BVLHL`. Old judge-code result write returned HTTP 401 **“new row violates row-level security policy for table \"results\"”**; queue was retained. Rejoined using new code through `/join`; pending queue survived, drained, and Two's Press edit to 3 reached the projector. Rotated code was used only on the test meet. Keyless/account phone authorization is covered by earlier publishing; an actual expired-token case is still unverified.

### Additional: commit-then-read failure FAIL

Created two unlisted blank test meets through dashboard while blocking only the post-create divisions GET. Real `zt_create_meet` returned 200 both times. The first UI was sampled too early, so I did not treat its empty alert/disabled button as final evidence. For the second, waited for the actual error: **“TypeError: Failed to fetch”**; **Create & Open Meet was enabled again**. Owner meet listing confirms both rows persisted. No second click creating a duplicate was needed to establish R3.

## Part 3: cleanup inventory for Slate

**Leave these for deliberate staging cleanup; this audit did not run delete SQL.** The accepted/null-link Six state is preserved as failure evidence. All test names/emails are fictional. No existing Strongfest meet or athlete was changed.

### Meets and memberships

| Slug | Meet UUID | Remaining children |
|---|---|---|
| astra-rehearsal-20261017 | 413ea354-3dce-48a7-ab77-dd240b9e1375 | 2 divisions, 2 events, 6 athletes, 5 results, 3 registrations, live_state station A |
| astra-commit-fault-20261017 | e96b1a95-7b6d-4a70-bda0-09b773b1954f | Blank dashboard-create meet; no athlete/result rows intentionally added |
| astra-commit-fault-retry-20261017 | 89388c63-367e-4cf1-b93c-66eb0e72841b | Blank dashboard-create meet; no athlete/result rows intentionally added |

Owner account `astra-gate-20261017@zerotacky.com`, UUID `182bf6c7-bbfb-4db7-91b0-42f51a92cbf8`, existed before this rehearsal and was reused. Each new meet creates/claims its owner membership for that account. Second account signup: **astra-rehearsal-second-20261017@zerotacky.com**, display name Astra Second Delete Me; unconfirmed, no working session or owned meet. Its Auth/profile row ID was not independently fetched; clean by exact email.

### Registrations

| Email | Registration UUID | Final status / linkage |
|---|---|---|
| astra-rehearsal-five@zerotacky.com | 4552d90a-414a-44f7-a6c5-697b0433386a | accepted / reg-ath-4552d90a, scored |
| astra-rehearsal-six@zerotacky.com | ea4cd1c8-ba0f-4809-86e9-ac09030add5f | accepted / null after stale publish, deliberately preserved |
| astra-rehearsal-probe@zerotacky.com | 27252407-d891-4b9b-8614-6b02057e7b6c | pending / null, bodyweight 0.5 |

Fictional emergency contact on these: Astra Emergency 2025550100. No emails/DMs were sent by the audit outside normal Supabase signup confirmation behavior.

### Child-row identifiers (all under rehearsal meet UUID)


**divisions**

- `div-1792263615883-2` (Astra Beta)
- `div-1792263619882-4` (Astra Alpha)

**events**

- `ev-1792263626018-6` (Astra Press)
- `ev-1792263626117-8` (Astra Deadlift)

**athletes**

- `ath-1792263626183-10` (Astra One)
- `ath-1792263626249-12` (Astra Two)
- `ath-1792263626315-14` (Astra Three)
- `ath-1792263626383-16` (Astra Four)
- `reg-ath-4552d90a` (Astra Registrant Five)
- `ath-1792263923359` (Astra Walkin Seven)

**results**

- `ev-1792263626117-8_ath-1792263626249-12` (reps=4)
- `ev-1792263626018-6_reg-ath-4552d90a` (reps=1)
- `ev-1792263626018-6_ath-1792263626183-10` (reps=4)
- `ev-1792263626018-6_ath-1792263626315-14` (reps=1)
- `ev-1792263626018-6_ath-1792263626249-12` (reps=3)

**live_state**

- `station=A`

Deleted/recreated during testing: `reg-ath-ea4cd1c8` (Six) was created, withdrawn, reaccepted and finally removed by stale publish. `reg-ath-4552d90a` (Five) was declined/unlinked then reaccepted under the same ID. Astra One and the Deadlift event were locally removed during guard checks; current server rows survive. Failed duplicate/bounds/closed/deadline submissions created no additional registration rows.

Rate-limit side effects: PIN bucket `pin:3V4EZ4`; submission bucket `submit:meet:413ea354-3dce-48a7-ab77-dd240b9e1375`; best-effort submit IP bucket for this harness's network if forwarded. The IP bucket key was not exposed or queried. These are staging throttle bookkeeping, not competition entries. Final volunteer code is `3BVLHL`; the staging publish key is unchanged.

## Part 4: additions to the 10/24 runbook and merge gate

1. **Do not ship this v2 build or 007 to the current production client.** Fix R1/R2 first, then rerun the failed steps on the exact candidate. 007's header already warns about old clients and omitted PIN; a deploy does not force every cached/offline phone to reload. Require each volunteer to load the new client and demonstrate a nondefault real-PIN check before accepting the cutover.
2. Finish the **fresh 001/002/004 upgrade dry run** before a production paste. Slate owns execution; this audit supplies no migration-run evidence. Include existing accepted registrations when testing rollback/upgrade behavior, not only a blank meet.
3. Confirm **two disposable accounts** ahead of the next rehearsal. Repeat queued owner -> different verified account -> owner and token expiry/refresh failure. Successful sign-out/owner recovery is not a substitute for the second identity.
4. Publish/claim while connected; verify the meet in the account dashboard, then Forget the legacy key and successfully publish again before relying on account-pause semantics. A link published with a key is deliberately classified `auth:key` even if a JWT accompanies it (`controller.ts:246-249`); a saved key is a full capability, not an account-bound session.
5. Use one designated configuration publisher. Do not publish an old backup or second admin copy after accepting entrants until every phone has refreshed and the missing guards are fixed. The rehearsal demonstrated real accepted-athlete loss under failed pre-pull, even though scored-result deletion was refused.
6. Before going live, join each judge, lock one fictional practice result, watch the exact athlete row on the projector, then test offline/reconnect. Verify pending count is zero and the score exists remotely before changing phones. Preserve a backup before rejoin or rotation; this rehearsal recovered the queue, but the UI briefly reloaded the old server result before the retained write flushed.
7. A sticky publish refusal means the new config is not online. Restore the correct config or mark a competitor withdrawn rather than deleting scored parents. Do not follow “Reset scores first” during a live meet just to clear an error. Roster deletion needs its own clear guarded workflow (R5).
8. For registration, use reload-and-redo on a revision conflict; raise cap before walk-in adds. Current dashboard's action is Decline, not Withdraw. Resolve the waiver legal review and operator privacy contact before real signups; version hashing does not preserve the rendered venue/date/organizer evidence.
9. If Create/Save reports a fetch error, **reload and inspect the dashboard before retrying** until R3 is fixed. Both fault-test meets existed despite failure UI.

Remaining gate items: R1 and R2 HIGH, R3/R4/R5 MED, second-account live verification, and fresh migration dry-run evidence. R6/R7 are lower-severity discrepancies that still need an explicit fix/decision. The accepted M13/M16 deferrals stay recorded; this report does not silently convert them into passed work.

## STYLE (last)

`components/promoter/ListingSection.tsx:190-202` still says **“Listed (public directory, when live)”** and **“When the backend lands…”** on this live Supabase-backed page. The top description correctly says it controls /shows. Remove the stale conditional copy; the shell bar/badge fix itself passed.

**Final gate: merge 10/21: NO.** Keep the current production branch separate; this report is not a safety certification of production or a permission to apply migrations. The rehearsal removes several prior unknowns but exposes reproducible merge-blocking regressions.
