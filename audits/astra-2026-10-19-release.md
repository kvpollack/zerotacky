# ZeroTacky release audit, 2026-10-19

**Verdict: merge after listed fixes, not as is.** The brief says this release was deployed; I did not verify production. R-H1 means the audited staging build is not cleared for meet-day use under the promised PIN protection. Slate owns integration and Kurt owns deployment timing. No production request or change was made.

## Scope and evidence

- Personally audited all eight requested areas in this Astra thread. No delegation, implementation/config edits, SQL execution, Auth administration, or Supabase target changes.
- Targeted release tree: `f5d992b6bdbe794a893a0eb45a2afb2f58088aa9` (225 tracked blobs). An early hash check found one mismatch, the on-disk brief. A final hash check found **six mismatches**: that brief plus five source files now being changed concurrently in Slate’s thread: `app/website/page.tsx`, `components/strongman-app.jsx`, `components/website/WebsiteShell.tsx`, `lib/presets/index.ts`, and `lib/types.ts`. Those are subsequent demo-preset/nav changes, not part of this release verdict. I did not modify or audit that follow-on work. All other 219 tracked blobs matched at final check. The deployed preview alias is mutable, so live checks establish observed behavior, not an immutable commit-wide attestation.
- Release-run output from before the concurrent edits records **229 tests passed, 0 failed, 19 files, 201 expect calls**. Independently verified TypeScript with `--noEmit --incremental false`, **exit 0** in that same release window. These are not a fresh test/typecheck claim for the currently changing working tree. Extra adversarial checks are separate from that suite count.
- Live browser target: `https://zerotacky-git-v2-kvpollack-6654.vercel.app`; observed requests use staging project `hryiqiopkihkcrkdyllg`. Dedicated headless Chrome contexts at phone width, plus a wide public board. Browser routes block the known production domain and production Supabase project. The preview alias is mutable; no claim that every deployed byte equals the source revision.
- Owner tests used the existing provisioned staging account `slate.staging@zerotacky.com`, read from `~/.aki/tmp/zt/staging_account.txt`. No password or token is included in the report. This is not an inbox I can read. The old Astra test address is also not an accessible mailbox.
- Staging writes used normal app UI and browser-origin REST/RPC on fictional audit meets only. A selector timeout after incrementing a score was recovered by reading the committed result, not retrying the write or claiming the subsequent Lock action succeeded.
- Evidence and final cleanup verification are listed below. Production application of 010 remains the brief's assertion, not my independently verified fact.

## Findings, highest priority first

### R-H1

**HIGH | `hooks/useRoleLock.js:17-25`; `components/setup/SyncPanel.jsx:172-188`; `hooks/useMeetSync.js:211-218`; `supabase/001_schema.sql:277-283` | The meet PIN does not authorize judge writes; a spectator can become a judge without it | A shared spectator join code grants the same server write authority as a judge, so the new PIN gate does not protect recorded scores | Issue a server-verifiable, meet-scoped judge capability after successful PIN verification, require it for score/live-state writes, and route every join path through the same role authorization flow.**

Live reproduction on fictional staging meet `0242b05e-f8f9-4673-b82e-8bc7858b05f7`, slug `astra-release-20261019`, code `TUEC98`, PIN `7391`:

1. Fresh signed-out phone opens `/join`, looks up the code, chooses Athlete / Spectator.
2. Normal spectator UI correctly omits Judge Pad and Meet Setup. Next Up hides editable personal height and custom-weight input.
3. Set `localStorage.ZEROTACKY_ROLE_V1` to `judge`, reload `/scorer`.
4. Judge Pad renders. No `zt_check_admin_pin` request occurred in this browser.
5. Tap **+1 REP** for Release Fictional One. The server accepts `results` POST **201**; independent reread returns `release-reps_release-one` with `reps:1` and `updated_by:dev-117a5122`. The browser also writes live_state with 201.

The Lock-button selector subsequently timed out; incrementing alone already committed the result. The proof is the server reread, not a claim about clicking Lock.

Root cause is not limited to local storage. `useRoleLock` defaults missing/invalid stored roles to admin, `strongman-app.jsx:438` renders the pad from activeTab without an independent authority check, and the in-app SyncPanel join path attaches a device without asking for a PIN. RLS accepts `zt_has_join(meet_id)` for results/live_state. The boolean PIN-check RPC issues no capability to bind later writes to its success. Hiding navigation or adding a second local flag cannot secure this boundary.

Normal `/join` PIN handling itself passed: wrong `0000` showed Wrong PIN and stored no role; correct `7391` made a server check and entered judge mode. That passing entry screen does not close this finding.

### R-M1

**MED | `supabase/010_meet_lifecycle.sql:190-194` | Direct table writes bypass the listed, non-demo follow rule | An authenticated client can bookmark an unlisted or demo meet and make it appear in My Meets despite the RPC refusing it | Revoke direct INSERT and use the checked RPC, or make the INSERT policy enforce the same visibility and demo conditions.**

Live: `zt_follow_meet` rejected the unlisted audit meet, but `POST meet_follows` with my own user_id and that meet_id returned **201**. My Meets returned it as a follow, `is_public_listed:false`. The same direct INSERT succeeded for the separate demo audit meet after the RPC refused it. A row for another user was correctly rejected **403** by RLS. This is a visibility/business-rule bypass, not proof of leaking private registrations; unlisted meet metadata was already publicly readable by ID/slug.

### R-M2

**MED | `supabase/010_meet_lifecycle.sql:206-214` | Unfollow fails after the promoter unlists the meet | A legitimate bookmark can become impossible to remove through either Follow or My Meets | Apply visibility checks only when adding a follow; allow the caller to delete their own existing follow regardless of current listing visibility.**

Live Follow button toggled off and on successfully while the audit show was listed. After unlisting it through the owner RPC, `zt_follow_meet(slug,false)` returned P0002, “This show cannot be followed (not listed).” The visibility lookup runs before the add/delete branch. Existing follows need not be purged when a meet is unlisted, but their owner must be able to remove them.

### R-M3

**MED | `components/promoter/MeetDayQrCards.tsx:37-39` | Print both opens a blank window | The advertised gym-wall print workflow produces no cards | Use a same-origin print route or another safe print-document approach that does not depend on a WindowProxy returned with `noopener`.**

Live on Meet Day tab 8: both QR cards generated and Print both enabled. Clicking it opened `about:blank` with empty body and a 39-character empty document. `window.open(...,'noopener,...')` returns null in this browser, so the early return prevents document.write. Keep opener isolation; do not remove the security property without replacing it safely.

Escaping is otherwise correct for the text contexts used. Meet name, card title, hint, and URL escape `& < > " '`. A hostile test name containing `</title><script>...` becomes inert escaped text. QR SVG is generated from modules and numeric path data, not raw URL markup. The broken print flow is not evidence of successful print-time injection testing.

### R-M4

**MED | `lib/meetBuilder.ts:240-254,271-276`; `components/setup/builder/StationsSection.jsx:125-155` | Removing and re-adding a station silently reassigns divisions | A division that was visibly unassigned becomes assigned to a new floor station without promoter choice | Clear the removed assignment to an explicit unassigned value and avoid reusing station identifiers that still appear on divisions.**

Live unsaved dashboard draft: Release Open started on A. Removing Station 1 retained `flight:A` but correctly showed **1 UNASSIGNED** and “Station A was removed.” Add Replacement Station next: addStation reused A, the division immediately appeared on it, and the warning disappeared. Explicitly choosing Station 2 then worked. Draft was discarded, not saved. Removing the last station is disabled.

The brief's “always a live station id” and “leave visibly unassigned” need an explicit model exception for unassigned divisions. Current source preserves a dead ID; the visible warning is helpful but does not prevent the identifier-reuse bug.

### R-M5

**MED | `components/setup/builder/MeetSection.jsx:17`; `lib/engine/runOrder.ts:48-54` | Reverse Previous Event does not use the tie rule its new explanation promises | Judges and promoters can expect a different lifting order from the one the engine produces | Resolve tied prior-event results by their tied place/score and overall points, or explicitly change the agreed rule and explain the actual order; add a tied-result regression test.**

Executable source reproduction: two athletes tie at five reps in event 2. Athlete a1 has 2.5 overall points and lot 1; a2 has 3.5 and lot 2. The explainer promises lower overall points first, so a1 should lead. Event 3 order is **a2, a1**. `rankMap` stores each row's unique array index, so different athletes never reach the equal-rank overall-points fallback. Tied rows had been sorted by lot, then the index comparison reverses them.

Reverse Overall Points agrees with the engine, including lot-number ties. Both podium tiebreaker options use the documented primary/fallback criteria, but “higher score” should say **more points in the final event**, not raw time/reps. Remaining ties receive sequential overallPlace values in scoring.ts; the explainers do not say what happens after both criteria tie. This is not a new scoring-engine implementation change in this release.

### R-M6

**MED | `app/m/[slug]/page.tsx:9-16`; `app/m/[slug]/opengraph-image.tsx:12-18` | A real board whose slug matches a demo fixture shares the demo’s name, image, and badge | Sharing a real competition URL can advertise fictional DEMO results even while the board itself displays the real meet | Resolve public metadata/images from the server meet first, then use a demo fixture only when no real meet owns the slug.**

Live staging collision: I created a fictional real meet with the fixture slug `keystone-fall-brawl-2026`. `/m/keystone-fall-brawl-2026` displayed **Astra Real Collision Delete Me**, no DEMO badge, and the real one-athlete standings, but its server-rendered `og:title` remained **Keystone Fall Brawl 2026 (Demo Live Show) — Live Scoreboard — ZeroTacky**. The image route calls `getDemoScoreboardState(slug)` directly and brands the image DEMO for the same URL. This is share-card misinformation, not evidence of the live board taking the fixture branch. Audit meet was deleted after the check.

### R-L1

**LOW | `lib/auth/useAuth.ts:61-72`; `components/website/AccountClient.tsx:261-264` | A normal signed-in session can display the recovery panel using only a hash | The page falsely claims the user arrived from a reset email, although it grants no power beyond the existing Change password action | Enter recovery mode only from verified recovery-session evidence, and label ordinary signed-in password changes accurately.**

Live: signed out at `/website/account#type=recovery` showed the sign-in form, no new-password panel. The same URL in the normally signed-in test account showed “You arrived from a password reset link.” No email link or recovery event had occurred. Signed-out PUT to Auth user update returned **403 bad_jwt**. No test account password was changed in this audit.

For this audience I recommend recent reauthentication for an ordinary signed-in password change. Volunteer phones and promoter sessions are likely to be shared at a meet, and a long-lived unlocked session should not be enough to take over the password. An actual verified recovery session must remain exempt from requiring the forgotten password. Current implementation accepts a live session; that is an explicit risk choice, not anonymous reset access.

### R-L2

**LOW | `lib/website/data.ts:63-84,152-167` | Demos-off is ignored in no-backend/explicit demo fallbacks | A build configured to hide examples can still list them, while its demo boards are unavailable | Apply shouldIncludeDemoShows consistently to all fixture-returning branches.**

Executable source check with `NEXT_PUBLIC_ZT_DEMO_SHOWS=0`: demo scoreboard helper returns null; configured live client with no rows returns zero shows; `listPublicShows({client:null})` returns **five** demo shows. This is a fallback-build defect, not a failure of the tested staging live-client list.

### R-L3

**LOW | `lib/website/data.ts:147,246`; `app/m/[slug]/opengraph-image.tsx:12` | A valid URL-encoded percent sign can crash either image route | A malformed or unusual shared slug returns 500 instead of the intended not-found card | Decode a slug at most once with error handling and a not-found fallback; avoid calling decodeURIComponent on an already-decoded route parameter.**

Live HTTP: `/m/100%25/opengraph-image` and `/shows/100%25/opengraph-image` returned **500**. Direct route invocation with `slug:"100%"` or malformed percent encoding reproduced `URI error` from `decodeURIComponent`. Both image routes returned PNG 200 for 1,600-character ASCII slugs, Unicode, and HTML-looking text; the show card correctly used a not-found image for those nonexistent slugs. No script execution was observed or claimed.

## Required checks and limits

| Brief item | Disposition |
|---|---|
| 1a. Real/demo one-way publish | **PASS on staging.** New demo remained true with true; false converted it to real; later true, null, and omitted payload values all kept false. 010's publish body otherwise matches 008 apart from comments and this assignment. |
| 1b. Delete | Live/keyed-anonymous and signed-in nonowner refusals passed; live/completed refusal and another owned meet's name refusal passed. Owner-name/cascade verification and exact cleanup outcomes are recorded below. A real second-account member-without-ownership session remains unverified. Source tests owner_id, not membership. |
| 1c. Follow | Other-user INSERT rejected; RPC listing/demo guards work. Direct-table bypass and unfollow defect are R-M1/R-M2. |
| 1d. My athlete meets | Live pending, accepted, declined, and withdrawn each return one audit-meet row, kind=registration and following=true. Withdrawal retains the user's relationship. SQL joins registrations/follows with auth.uid(). A real second-account isolation scenario is not claimed. |
| 2. Join/PIN | Normal wrong/correct PIN calls passed. Spectator normal navigation and height/custom-load read-only rendering passed. An alternate in-app Advanced Settings join started in the default admin role, joined with the code, and reached Judge Pad without any PIN request, independently confirming R-H1 without localStorage tampering. Server-authorized spectator isolation fails, R-H1. Bar-toggle disabled branches inspected in source; the initial fictional event did not expose trump-weight toggles. |
| 3. Password reset | Signed-out guard and signed-out Auth rejection passed. Fake signed-in recovery panel reproduced, R-L1. A single real staging reset attempt for `astra-gate-20261017@zerotacky.com` used the correct redirect to `/website/account`, but Supabase returned **429 over_email_send_rate_limit**; no email was sent by that request. **Real delivered email, link redemption, new-password save, and subsequent sign-in remain unverified.** There is no accessible Astra inbox; no invented mailbox or Auth-admin link generation was used. |
| 4. My Meets UI | Status/bucket matrix executed for pending, waitlisted, accepted, declined, withdrawn across upcoming/live/completed/cancelled. Registration wins over follow live. Athlete section links only to public show/results routes. Promoter-shell access clarification below. |
| 5. Demo boards | Live fixture board rendered fictional athletes and DEMO. A live demo board showed DEMO and fixture athletes, with one initial meet lookup and no polling requests observed during this check. A colliding real slug loaded the real board; its metadata/image disagree, R-M6. Demos-off live helper works; fallback exception R-L2. |
| 6. Stations | Tab 3 and Meet Day tab 8 verified. Removal warning and explicit reassignment work. Identifier reuse fails, R-M4. No stale customer-facing “tab 7” or “7. Meet Day” match found. |
| 7. QR/OG | QR rendering and escaping checked; printing fails R-M3. PNG 200 on long/Unicode/HTML-like slug inputs; percent-encoded slug returned 500, R-L3. No direct qrcode 1.5.4 vulnerability found in the cited advisory source; this is not a full transitive dependency audit. |
| 8. Copy | Completed source pass; STYLE follows. Reverse-previous explanation mismatch elevated to R-M5 because it affects floor order. |

### My Meets role clarification

`AthleteMeetsSection.tsx` itself offers public show links, results links, and own-follow removal. It does not expose another promoter's administration. However `/promoter` renders the full promoting shell and **New Meet** for every signed-in account (`PromoterDashboardClient.tsx:191-231`), without testing a promoter profile flag. The API contract explicitly allows any signed-in account to create its own meet and says profile flags are preferences, not authorization. Therefore the brief's literal “nothing promoter-only is reachable for a non-promoter” is false for the containing page, but this is not a cross-owner privilege escalation. Align the desired UI scope with that contract; do not use a self-declared checkbox as a security boundary.

The completed bucket intentionally includes declined and withdrawn registrations, retaining their accurate badge. Its “shows you competed in” description overclaims participation for those entries. A badge Competed on an accepted registration also proves acceptance, not a recorded start; preserve that distinction in athlete history copy.

### Dependency note

Installed package is `qrcode` **1.5.4**, MIT licensed. It generates SVG locally. Snyk's package/version page reports no direct vulnerabilities and explicitly excludes dependency vulnerabilities: https://security.snyk.io/package/npm/qrcode/1.5.4 (read during this audit). I did not run a full lockfile advisory scan or verify physical QR scanning/print legibility. No dependency was installed or upgraded.

## STYLE, last

| ID | File:line | Finding | Suggested correction |
|---|---|---|---|
| STYLE-1 | `components/setup/builder/MeetSection.jsx:25,30` | “Still level: the higher score…” and “Still level: more event wins.” use the disallowed colon/fragments pattern. | “If they are still tied, compare their points in the final event.” / “If they are still tied, compare event wins.” |
| STYLE-2 | `components/setup/builder/MeetSection.jsx:12,17,210,242` | Explanations rely on repeated label-colon prose and the “usual choice” flourish; the reverse-previous tie statement is wrong, R-M5. | Make option labels headings, followed by complete sentences that describe the actual ordering. |
| STYLE-3 | `components/website/AccountClient.tsx:363-365` | “The old promoter key still works…” explains the underlying credential mechanism to all account users. | Move legacy-key migration guidance to the relevant sync/claim screen; tell account users what signing in lets them recover/manage. |
| STYLE-4 | `lib/website/howItWorks.ts:34,44,135,157`; `components/website/AccountClient.tsx:257` | “Only you can change it,” “stays private,” PIN “not saved on the phone,” and finished meets “kept” are broader than current behavior. Members/keyed devices can change allowed data; unlisted is not access-private; publishing-phone state contains adminPin; completed can be changed to cancelled. | Scope each claim: ownership controls dashboard access, unlisted means absent from Find a Show, joined phones do not receive the PIN, and currently live/completed meets cannot be deleted. |
| STYLE-5 | `components/promoter/PromoterMeetDetailClient.tsx:707` | New Stations edits trigger a dirty bar that omits Stations and says “working memory” / “commit.” | “Your meet setup changes are not saved yet,” or include Stations in the affected-step list and say Save changes. |
| STYLE-6 | `components/promoter/AthleteMeetsSection.tsx:51,62`; `lib/website/howItWorks.ts:86` | Completed-entry copy implies everyone in the bucket competed, including declined/withdrawn entries. | Describe completed shows the user entered, with registration status retained. |

The requested Stations explanation otherwise uses user-facing language, and no colon-fragment sentence was found in that component. How It Works generally describes tasks rather than implementation. The account sentence after “do not need an account:” is a full clause, not a fragment, so I would not flag the colon alone. The known real Strongfest/gym fixtures remain advisory-only as requested; this audit did not fictionalize them.

## Remaining release checks

- Real reset email from an accessible staging mailbox, complete redemption/password/sign-in flow, plus expired/used link behavior.
- Two confirmed identities for nonowner-member delete and registration-isolation testing. Source and one-account checks are not substitutes.
- Production migration/deployment evidence and the authorized production rehearsal. This audit used staging only.
- Natural token expiry remains outside this run, as in Gate 3.

## Final browser checks, cleanup, and artifacts

- Evidence artifact: `audits/astra-2026-10-19-release-evidence.json` (browser responses, source check matrix, HTTP image results, prior test output, final source hash check). Secret scan found neither the staging publish key nor the staging account password or JWT. The artifact records one obsolete early successful hash run only in the narrative; its final `revision.mismatches` is authoritative for the end-of-audit working tree.
- Owner deletion of the scored audit meet succeeded with mixed-case, whitespace-padded confirmation. RPC returned 1 division, 1 event, 1 athlete, 1 result and 1 registration deleted. Direct result-guard attempt against a second scored audit meet refused athlete DELETE 400; deleting that entire meet via owner RPC succeeded with one result. A third real-slug collision audit meet was also deleted. Final public meet-id lookup found **zero** of these three IDs; individual child rereads found zero divisions/events/athletes/results/membership/live-state/follows for the main meet. Direct meets/registrations table rereads lacked SELECT privileges, so counts there are based on the delete RPC and later My Meets reread. `zt_my_athlete_meets()` returned no rows for the three audit meet IDs after cleanup.
- Browser contexts were closed; local audit harness was stopped. No Auth account or permanent staging asset was created for this audit. One reset request returned rate-limit 429, and no production URL was contacted.
- Minimal next action: fix R-H1 in both server authorization and the UI, then retest as a spectator with a real join code before Thursday’s rehearsal. The remaining findings can be triaged separately on the same release timeline.
