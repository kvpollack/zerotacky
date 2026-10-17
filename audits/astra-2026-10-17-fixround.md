# Astra audit: v2 fix-round verification and M3 pre-read, 2026-10-17

**Verdict: not ready to use the current contract/auth surface as an unchecked M3 implementation spec.** The fix round closes much of the original work, but result-reference protection remains incomplete and authenticated publishing has ownership and destructive-update risks.

## Scope and evidence

- Audited personally in this Astra thread. The two mistakenly started delegated tasks were killed; no findings from those tasks were used.
- Disk target: `3692886cfc07b55913e85f1e939ed51c9685f601`. All **150 tracked file blobs** matched the user-specified GitHub commit before this report. The brief's `becaaab7` reference is stale.
- Prechecks: **TypeScript clean** (`--noEmit --incremental false`, exit 0); **176 tests passed across 13 files, 0 failures**. Promoter/register suites have **14 + 13 tests**. Notes record an earlier 173/12 run, not today's total.
- Browser: `https://zerotacky-git-v2-kvpollack-6654.vercel.app`. Account bundle and observed auth requests target staging `hryiqiopkihkcrkdyllg.supabase.co`; local v2 env does too. Browser behavior was checked directly; deployment-to-commit identity was not independently attested.
- Source inspection, executable in-memory probes, browser behavior and staging HTTP reads are distinguished below. SQL/RLS findings are source-level unless an actual read is described.
- No source/config edits, SQL execution, production access, or real meet publishing. This report is the sole project-file addition. One unconfirmed staging test account remains for Slate to delete (Part 4).

## Part 1: all 26 prior findings

**18 fixed; 7 partial; 1 not fixed; 0 classified as regressed.** A fixed verdict closes the original behavior, not every adjacent edge case. Original severity, location, finding, impact and suggested fix are retained for diffing. Current evidence appears only for non-fixed verdicts. M13 includes the related registration-404 regression without counting the same finding twice.

| ID | Severity | Original file:line | Original finding | Why it matters | Original suggested fix | Verdict | Current evidence / remaining action |
|---|---|---|---|---|---|---|---|
| H1 | HIGH | app/register/[slug]/page.tsx:45 | Public registration serializes the complete owner detail, including summary.joinCode and state.meet.adminPin; unauthenticated HTML contains FRNC26 and 1050. | Hiding the Meet Day panel does not protect credentials in the React payload; these are fixture values today, but this violates the boundary required before live integration. | Return an allowlisted public registration model that excludes owner credentials and private configuration. | partial | `components/register/RegisterClient.tsx:17-22,54-74`; `lib/promoter/fixtureApi.ts:260-267,691-697`. Owner detail is gone from HTML/RSC and the component meet state, but the anonymous page imports the entire fixture API. Its downloaded `26l08-xwy47q5.js` bundle still contains `FRNC26`, `adminPin`, `joinCode`, and seeded emergency-contact data. The DTO allowlist does not protect the browser boundary. Only fixture data was observed; no live credential disclosure was established. Remove owner fixtures from the public dependency graph when replacing this seam. |
| H2 | HIGH | lib/promoter/fixtureApi.ts:484-512 | Roster matching falls back to name plus division: different-email registrants can collapse into one athlete, and declining an unaccepted same-name request deletes another accepted athlete's unscored roster row. | A registration decision can remove or merge the wrong competitor. | Associate registrations with explicit athlete IDs and never identify or delete roster entries by name. | fixed |  |
| H3 | HIGH | lib/promoter/fixtureApi.ts:363-376 | Saving after deleting a scored athlete preserves their result rows but removes the athlete; reproduced with srs-a1 and its locked result. | Result bytes survive, but their references become invalid and the athlete disappears from scoring. | Reject configuration changes that orphan existing results, including athlete, event, and division deletion. | partial | `lib/promoter/fixtureApi.ts:109-127,515-543`. Athlete-ID rename, scored-event removal, empty athletes and builder-driven division removal are rejected. Removing only the scored division from `state.divisions` succeeds: `srs-a1` and `srs-a2` reference a missing division while all 3 results remain. Validate the result -> athlete -> division chain, not only result athlete/event IDs. |
| M1 | MED | components/promoter/PromoterMeetDetailClient.tsx:249-251 | Accept/Decline replaces the entire working state with the freshly fetched saved state; browser reproduction erased an unsaved meet-name edit and dismissed the dirty bar. | Registration actions silently discard unrelated builder changes. | Preserve and merge the draft, or require Save/Discard before registration actions. | fixed |  |
| M2 | MED | components/promoter/PromoterMeetDetailClient.tsx:521-554 | Switching tabs unmounts local drafts: unsaved Listing fields disappear, and an edited EventForm disappears without ever activating the global dirty bar. | The claim that any builder-field edit is protected by dirty-state handling is false. | Keep section drafts mounted or lift their draft state and dirty tracking into the parent. | partial | `components/promoter/PromoterMeetDetailClient.tsx:128-131,595-604,649-665`; `components/setup/builder/EventForm.jsx:12-49,133`. Mounted panels retain drafts across tabs, but an EventForm-only name edit produces no global dirty bar and leaves Accept/Decline enabled. It reaches workingState only after the inner event Save; global Save/Discard cannot govern it. |
| M3 | MED | app/register/[slug]/page.tsx:35-38 | A newly created browser-only meet opens in /promoter/<id>, but its /register/<slug> link returns 404 because the server singleton does not contain it. | The advertised create-to-registration workflow breaks across the server/browser boundary; metadata also falls back to the generic title. | Use one authoritative data source, or resolve fixture-only registration consistently in the browser. | fixed |  |
| M4 | MED | components/register/RegisterClient.tsx:560-565; lib/promoter/fixtureApi.ts:575-582 | Confirmation says registration was recorded, but created meets and registrations disappear on reload and never reach another browser; the UI gives no explicit reset warning. | "Website Skeleton Preview" does not explain that Save and Submit are temporary, single-browser operations. | State clearly that fixture changes reset on reload and do not submit a real entry. | fixed |  |
| M5 | MED | components/promoter/ListingSection.tsx:114-116; components/promoter/MeetDaySection.tsx:59-104 | Listing controls claim to affect /shows, and meet-day help promises working join/rotation behavior, while those destinations use separate website fixtures or Supabase rather than the promoter singleton. | Users can mistake fixture settings and codes for published, operational meet controls. | Label these actions as disconnected previews until the shared backend integration exists. | partial | `components/promoter/MeetDaySection.tsx:59,78-79,104-105`. The preview warning is correct, but join-link help still promises direct attachment. Rotation copy mentions invalidating only new phones, whereas `supabase/001_schema.sql:139-141,273-284` checks the current code on every write. Remove contradictory copy and describe existing-device rejoin behavior. |
| M6 | MED | lib/promoter/fixtureApi.ts:481-500 | After deleting a registration's division, Accept still succeeds and creates an athlete referencing the deleted division. | An accepted entry can be absent from every valid division despite a success response. | Validate the division and roster mutation before changing registration status. | fixed |  |
| M7 | MED | lib/promoter/fixtureApi.ts:156,566 | Emergency contacts are required and stored in a write-only closure map, but no API getter or promoter display retrieves them. | The promised meet-day emergency information is unavailable even before a refresh. | Add an owner-only emergency-contact field to the agreed contract and return/display it. | fixed |  |
| M8 | MED | components/register/RegisterClient.tsx:77-81,583 | Waiver organizer and confirmation contact always use DEMO_PROMOTER_USER, including registrations bridged from other /shows fixtures. | The waiver can identify the wrong organizer and the confirmation provides the wrong contact. | Carry the selected show's promoter identity/contact through the public registration model, using "not provided" when unavailable. | fixed |  |
| M9 | MED | lib/promoter/fixtureApi.ts:161-172 | registrationCount counts pending plus accepted requests, contrary to the contract's "subset of athleteCount" definition; the initial values are 7 registrations and 2 athletes, then 7/3 after Accept and 6/2 after Decline. | The implementation and contract describe different metrics. | Agree on request-count versus accepted-roster-count semantics and expose separate counts if both are needed. | partial | `lib/promoter/contract.ts:45-47`; `lib/promoter/fixtureApi.ts:275-286,534-546,650-651`. Counts now have separate meanings, but deleting unscored accepted athlete `ifc-ath-2` through save leaves 2 accepted requests and 1 roster athlete. Re-accept returns success without restoring the row. The promised accepted <= roster invariant is not maintained. |
| M10 | MED | lib/promoter/fixtureApi.ts:109-140,532 | Submission checks registration status but ignores the displayed deadline and athlete cap; a meet with two athletes, cap 1, and a 2020 deadline still accepted a request. | Displayed registration limits do not constrain entry. | Enforce the agreed deadline/cap policy at submission, including explicit waitlist behavior, or label those fields advisory. | fixed |  |
| M11 | MED | components/promoter/PromoterMeetDetailClient.tsx:86-94,111-113,249-256 | Initial registration-list errors are ignored, refresh errors after Accept/Decline are discarded, and a current-user error is hidden behind the signed-out return. | Failures can look like empty registration lists or successful actions, violating the verbatim-error requirement. | Render each failed ApiResult.error at the relevant action and do not report refresh success when it failed. | fixed |  |
| M12 | MED | app/register/[slug]/page.tsx:13-18 | A waiver-file read failure becomes ordinary waiver text, leaving acceptance and submission enabled. | Registration can record a waiver timestamp when the actual waiver was never presented. | Fail closed and disable submission when the approved waiver cannot be loaded. | fixed |  |
| M13 | MED | app/promoter/[serverId]/page.tsx:21-25 | Unknown promoter IDs return HTTP 200 and render a client error, contradicting PROMOTER_NOTES.md:11. | Crawlers and link checks treat missing meets as successful pages. | Once lookup uses authoritative server data, call notFound() before rendering the client. | not fixed | `app/promoter/[serverId]/page.tsx:9-21`; `app/register/[slug]/page.tsx:7-10,38-45`. Both unknown URLs returned HTTP 200. Notes now admit this deliberate fixture-stage deferral; documentation does not fix the behavior. Public registration has also lost its former real 404. Restore authoritative lookup/notFound with M3. |
| M14 | MED | components/promoter/ListingSection.tsx:235-364 | Ten listing inputs have visually adjacent labels but no programmatic label association. | Assistive technology cannot reliably identify those controls; clicking their labels does not focus them. | Add matching id/htmlFor pairs or wrap each input in its label. | fixed |  |
| M15 | MED | components/promoter/PromoterMeetDetailClient.tsx:436-467; components/register/RegisterClient.tsx:319-340 | Editor sections and division choices are native buttons with visual-only selection; the detail page contains zero [role=tab] elements. | Controls are keyboard-focusable, but assistive technology cannot determine the selected section or division. | Implement complete tab semantics for sections and radio-group semantics for division selection. | fixed |  |
| M16 | MED | legal/PRIVACY.md:51 | Deletion requests are directed to an operator contact supposedly listed on the site, but no such contact is published; the 30-day commitment has no documented supporting workflow. | Users lack the promised request channel, and the draft commits the operator to an unverified SLA. | Publish a real contact and obtain operator approval for a workable deletion process and response commitment. | partial | `legal/PRIVACY.md:51`. Contact and SLA are now marked `[OPERATOR CONTACT EMAIL]` and `[OPERATOR TO CONFIRM]`; neither a usable contact nor an approved deletion workflow exists in the supplied material. Suitable as a draft, not resolved for live publication. |
| M17 | MED | legal/PRIVACY.md:38 | "Scores are never lost if gym Wi-Fi drops" is unsupported: queue writes can fail silently and the queue drops oldest entries above 2,000. | The policy promises stronger durability than the implementation provides. | Describe local queuing and retries without an absolute no-loss guarantee. | fixed |  |
| M18 | MED | THEME_PROPOSALS.md:20,193 | Sandstone primary-on-surface calculates to 6.10:1, not 7.2:1; white-on-primary is 6.47:1, not 7.6:1, so both miss the claimed normal-text AAA threshold. | The proposal overstates accessibility compliance. | Correct both values/classifications or change the colors and recalculate. | fixed |  |
| M19 | MED | test/promoter.test.mjs:107,143-144,177; test/register.test.mjs:100-109 | Assertions still pass with important failures: result-length equality permits rewritten scores; rotation checks only the returned code, not stored rotation; decline checks count, not the removed identity; registration checks one injected API instance, not browser navigation or summary count. | Passing tests do not establish the preservation, identity, persistence, or end-to-end claims attached to them. | Add deep result comparisons, stored-state rereads, exact identity assertions, count assertions, and browser/server-boundary tests. | partial | `test/promoter.test.mjs:101-146,197-210,220-283`; `test/register.test.mjs:119-164`; `PROMOTER_NOTES.md:12`. Deep preservation, stored rotation, identity and count assertions are added, but no automated browser/server-boundary regression test was added. Manual browser evidence below is separate. The claim that everything in lib/promoter is test-covered is broader than the assertions establish. |
| L1 | LOW | lib/promoter/fixtureApi.ts:60-72,127-129,335-379 | Validation accepts fractional caps and a digits-only five-character emergency contact; changing the meet date can also leave an already-saved deadline after that date. | Validation is weaker than its messages and cross-field rules imply. | Require integer caps, define contact requirements explicitly, and revalidate listing constraints when saving the meet date. | fixed |  |
| L2 | LOW | PROMOTER_NOTES.md:7-8 | The notes claim 12 promoter tests and 9 registration tests; the shipped suites contain 9 and 6, with no assertion on registrationCount and no browser end-to-end test. | Coverage and test execution scope are overstated. | Correct the counts and distinguish API round trips from browser integration coverage. | fixed |  |
| L3 | LOW | PROMOTER_NOTES.md:55 | The broad no-localStorage claim needs qualification: dashboard routes reuse WebsiteShell -> WebsiteThemeFrame -> useTheme, which writes ZEROTACKY_THEME_V1. | Save operations leave scorer data alone, but the rendered dashboard is not entirely storage-free. | Document shared theme persistence as an exception while retaining the prohibition on meet-state and sync-storage writes. | fixed |  |
| L4 | LOW | THEME_PROPOSALS.md:70 | Arena-TV primary-on-surface calculates to 12.85:1, not 14.9:1. | The numerical claim is incorrect, although AAA still passes. | Replace the stated ratio with the calculated value. | fixed |  |


## Part 2: the contract as M3's spec

### Findings

MED | lib/promoter/contract.ts:100-124 | C1: Authorization is only partly specified: “meets I own” scopes the meet block, but profile self-only rules and registration owner checks are unstated; `setRegistrationStatus(id, ...)` must resolve ownership from the stored request, and join-code authority is not distinguished from account ownership. | An implementer can copy the fixture's signed-in-only checks or the scorer's broader member policies and expose owner-only fields/actions. | Write an explicit per-method authorization matrix and enforce it in RLS/RPCs independently of UI roles and client data.

HIGH | lib/promoter/contract.ts:95-118; supabase/003_auth.sql:88-123 | C2: The contract does not require transactional roster/request/config changes or define failure-after-commit; existing publish deletes children with result cascades and accepts result updates, so it is not a safe dashboard-save implementation. | Separate REST writes can leave half-accepted entries, and reusing full publish violates read-only results. | Require dedicated transactional RPCs, result/reference preservation, rollback on validation failure, and retry/reconciliation semantics for lost responses after commit.

MED | lib/promoter/contract.ts:48,109-118; lib/promoter/fixtureApi.ts:487-546,650-674 | C3: Whole-state saves have no expected revision, and accepted linkage is not protected from roster edits; the deletion probe left 2 accepted requests but 1 athlete, and repeated Accept did not repair it. | A stale editor can erase a newly accepted unscored athlete even if individual backend operations are transactional. | Add an expected revision/conflict response and atomically reject or explicitly reconcile deletion/movement of registration-linked athletes on every roster mutation.

MED | lib/promoter/contract.ts:33-34,65-68,116-124; lib/promoter/fixtureApi.ts:650-684 | C4: Capacity is specified for submission, not acceptance or manual roster changes; accepting `reg-ifc-3` at cap 2 succeeds and produces a roster of 3. | Several pending entries can exceed the displayed cap, and an implementer cannot tell whether that is an intended override. | Define the acceptance/manual-add policy, enforce counts under a transaction lock, and require an explicit override if over-cap admission is allowed.

MED | lib/promoter/contract.ts:23-35,57-92; ROADMAP.md:21-23 | C5: Roadmap M3 columns/migration names do not cover the current contract, and registrations remain assigned to M4 while this brief expects the whole API to become real in M3. | Missing fields, duplicate migration prefixes or mixed live/fixture registration would make substitution incomplete. | Reconcile the schema inventory and milestone boundary below before implementation.

MED | lib/promoter/contract.ts:68,86-92,124 | C6: Waiver evidence is a boolean submission and timestamp, without an approved waiver version/hash or immutable rendered organizer/event/venue snapshot. | Changed waiver or meet details leave no record of the text/context accepted. | Include the approved waiver version and rendered-context snapshot in the registration transaction and stamp acceptance server-side.

LOW | lib/promoter/contract.ts:73-80 | C7: The public-shape comment forbids emails, but `promoterContact` deliberately permits a public promoter email. | A privacy assertion can remove the required contact or confuse it with private registrant emails. | Explicitly allow only the designated public promoter contact while excluding registrant/profile emails and emergency contacts.

### Public field review

- `PublicRegistrationMeet` declares appropriate public content: show identity, public listing/contact, divisions/target weights and aggregate occupied spots. No join code, PIN, publish key, private athlete email, emergency contact or results array is declared.
- `MeetListing` has public listing content and discoverability, not owner credentials. Do not automatically fill `promoterContact` from a private profile email without an explicit public-contact decision.
- `PromoterMeetSummary` contains `joinCode`; `PromoterMeetDetail.state` can contain `adminPin`. Neither is a public response. `/shows` needs its own allowlisted adapter, not an owner detail cast to `PublicShowRecord` just because both use `AppState`.
- `isPublicListed=false` means invisible in `/shows`, not private-by-slug; the fixture getter still resolves such a slug. Preserve that distinction or explicitly change it. Exclude demos from real discovery. No live-listing leak is claimed: the migration does not exist yet.

### Per-method authorization matrix

Owner means database-verified authority, not a self-selected role. Other account means a signed-in non-owner. A join-code device is not a `meet_members` account member. Any desired admin delegation must be specified separately, especially private emergency-contact access.

| Method | Anonymous | Signed-in owner | Other account | Join-code-only device | Current documentation |
|---|---|---|---|---|---|
| getCurrentUser | null session | own identity | own identity | null unless also signed in | null means signed out |
| updateProfile | deny | own profile | own profile | deny | patch shape only; self-only unstated |
| listMyMeets | deny | owned meets | own meets only | deny | owned-meets heading |
| getMeet | deny | allow this meet | deny | deny | owned-meets heading; no admin policy |
| createMeet | deny | allow new own meet | allow new own meet | deny | server assignment of owner unstated |
| saveMeetState | deny | config/roster with integrity checks | deny | deny | owned-meets heading; results read-only |
| updateListing | deny | allow | deny | deny | owned-meets heading only |
| rotateJoinCode | deny | allow | deny | deny | owned-meets heading; owner-only code |
| archiveMeet | deny | allow | deny | deny | soft completed transition; listing unchanged |
| listRegistrations | deny | private owner view | deny | deny | separate registration block lacks caller rule |
| setRegistrationStatus | deny | allow after resolving request ownership | deny | deny | mechanics stated; authorization unstated |
| getPublicMeetBySlug | public projection | same public projection | same public projection | same public projection | no session explicit; visibility rules omitted |
| submitRegistration | server-validated entry policy | same public policy | same public policy | same public policy | no session explicit; no right to set accepted/paid/athleteId |

Profile flags are self-declared UI preferences, not meet authorization. Present keyless publish permits any authenticated account to create its own meet; checking `is_promoter=true` would not prove ownership.

### Required schema mapping and migration decisions

| Contract | Existing schema | M3 requirement / decision |
|---|---|---|
| PromoterUser | `profiles.id`, `display_name`, `is_athlete`, `is_promoter`, `is_gym_owner` | Map names; use verified auth email as identity, not editable profile email. No second profiles table. |
| serverId / state.meet.id | `meets.id uuid`; fixture IDs are text | Generate UUIDs server-side; define server identity/remap child meet IDs. Never persist `srv-meet-*` or trust client ownership. |
| child IDs | `(meet_id uuid,id text)` with composite FKs | Keep existing text child IDs, always scoped by meet. Choose a globally unique registration UUID if status update takes only request ID. |
| lifecycle/listing | absent | Add `competition_status`, `registration_status`, `results_status`, `is_public_listed`; allowed-value checks and defaults from `emptyListing()`. |
| venue, federation | absent | Add `venue_json jsonb`, `federation text`; validate venue shape. |
| fee/deadline/cap/contact | absent, omitted from roadmap M3 | Add `entry_fee_display text`, `registration_deadline date`, `athlete_cap integer` (null or positive), `promoter_contact text`; enforce cross-field rules on both listing and meet-date writes. |
| promoterDisplayName | private `profiles.display_name` | Public organizer projection through a controlled RPC/server query or public snapshot; do not grant anonymous profile reads. |
| RegistrationRequest | no table | Add `registrations`: `id`, `meet_id`, `division_id`, `athlete_name`, `email`, `emergency_contact`, nullable `athlete_id`, `status`, `waitlisted`, `waiver_accepted_at`, `paid`, `created_at`; composite meet-scoped FKs, owner-only reads/decisions, server-managed linkage/paid/timestamp and active-entry uniqueness. |
| waiver / future own entries | absent | Add waiver version/context (C6); decide nullable `registrant_user_id` if M4 exposes own entries. Email alone is not authenticated ownership. |
| counts / updatedAt | counts absent; meets.updated_at exists | Derive counts consistently; bump revision/timestamp on every relevant config/roster/registration write; prefer revision tokens for conflict detection. |
| timestamps/dates | SQL date/timestamptz; Result.updatedAt is milliseconds | Map null date to `''` if retained; convert timestamps explicitly using existing mapping helpers. Define deadline timezone rather than silently inheriting UTC todayIsoDate. |
| event/rack/result options | `events.config`, `athletes.rack_heights`, `results.payload` plus columns | Reuse mappings and IDs; no parallel scoring engine. `presetId` is currently local-only: document or deliberately persist it. |
| registration_fee vs display fee | neither fee nor paid exists in current SQL | Roadmap M4's “columns exist” is premature. Display text is not an amount/currency contract; decide future payment fields separately. |

Current migrations: `001_schema.sql`, `002_station_labels.sql`, `003_auth.sql`. Roadmap's `002_auth.sql` and `003_listing.sql` references are stale; use the next unused ordered migration. Columns alone are insufficient: `meets` has an explicit SELECT column allowlist. Expose public listing fields through controlled grants/projections, and owner fields through an owner-checked read path. Do not grant owner_id/join_code/admin_pin to all authenticated users.

### Atomicity and partial failure

All methods can be atomic with database transactions/RPCs. Independent REST mutations cannot provide the same guarantee.

- Create: meet and owner membership together, returning a consistent detail.
- Save: expected revision, full reference validation, config/roster update, preserved results and committed snapshot in one transaction.
- Accept: lock request/capacity scope, validate division, create/link exactly one athlete, update status/counts together. Decline/withdraw/reopen check results and update both sides together.
- Submit: validate entry rules, deduplicate and record waiver evidence atomically. Define idempotent retries after lost responses.
- Define allowed `ApiResult.data/error` combinations. Distinguish rollback from unknown commit outcome and successful mutation followed by failed refresh. The registration UI already has a partial-refresh message; the backend should preserve that distinction.


## Part 3: auth surface

### Findings

HIGH | supabase/003_auth.sql:59-68,71-85 | A1: A keyless signed-in non-member can claim an existing ownerless meet by public slug or ID; the owner-null branch skips membership validation, then assigns auth.uid() and inserts owner membership. | Legacy key-published meets and meets whose owner was deleted become claimable by an unrelated account, with full publish overwrite authority. | Require a valid legacy key or trusted migration/claim capability for ownerless meets and reject keyless same-slug publication without existing permitted ownership.

HIGH | supabase/001_schema.sql:253-261; supabase/003_auth.sql:64-85 | A2: Member update authority does not protect owner_id, and existing members can mutate meet_members without an owner/admin distinction. | An admin can reassign or null ownership and add/remove owner rows, causing owner_id and membership to diverge; null ownership also exposes A1. | Restrict ownership and membership changes to owner-checked transactions, revoke direct ownership-column mutation, and define owner/admin powers consistently.

HIGH | supabase/003_auth.sql:113-123; supabase/001_schema.sql:70,84-85 | A3: Authenticated full publication deletes omitted athletes/events/divisions with cascading result deletion, including locked results, and accepts replacement result payloads. | A stale signed-in admin publish can erase results; H3's fixture guard does not protect this RPC, which must not implement read-only-results dashboard save. | Enforce recorded-result reference protection in the publish transaction and separate any explicit destructive reset flow from normal publication.

MED | lib/sync/controller.ts:152-172,176-193,270-321; hooks/useMeetSync.js:95-104,120-136,162-171 | A4: Sign-out swaps the bearer for future clients but does not suspend account-admin links, join-code capabilities, queued writes or polls, and does not invalidate in-flight responses. | A fake-network probe completed an OLD_TOKEN publish after setAccessToken(null), recreated an admin link, then sent a queued live-state write with anonymous bearer plus retained join code; account sign-out does not end device write authority. | Define account-admin sign-out behavior, pause rather than discard unsent work, invalidate stale completions with a session generation, and separately preserve intentional accountless volunteer sessions.

### RLS and publish conclusions

**Profiles (source):** `003_auth.sql:16-21` restricts authenticated SELECT/UPDATE to id=auth.uid() and checks the resulting ID. No anonymous, INSERT or DELETE policy exists; the auth trigger creates rows. No cross-user access path was found in these policies. Own role flags are editable by design and must not authorize meet access. Ordinary table UPDATE also permits own profile-email/created-time edits unless column grants narrow it; auth identity must stay authoritative. Signed-in cross-user tests could not run without a confirmed session.

**Profiles (staging read):** Anonymous `profiles?select=id&limit=1` returned HTTP 200/zero rows. Reading the new user's specific profile ID also returned zero rows. This proves no anonymous visibility for those reads, not whether the trigger created the row.

**Meets / members / children (source):**

- Anonymous and signed-in non-members can read allowed meet columns and divisions/events/athletes/results/live-state under current public SELECT policies. Signed-in non-members can additionally insert an own meet (owner_id=auth.uid()); the insert trigger adds membership. They cannot ordinarily write another owner's meet/children without a join code/key.
- Direct INSERT cannot assign ownership to a different account under the policy. Existing members can change owner_id on UPDATE; the insert-only trigger does not reconcile ownership changes (A2).
- Membership SELECT is self/member scoped. A person cannot ordinarily insert their first membership into an arbitrary meet. Existing members can manage memberships too broadly (A2).
- A join code permits athlete/result/live-state writes without an account, including after sign-out; it does not create account membership or establish dashboard-owner authority.
- SELECT grants omit owner_id, join_code and admin_pin for **both** anon and authenticated roles. Owner reads need a secure RPC/projection, not blanket grants. Anonymous staging reads of owner_id/join_code returned permission errors; public id reads succeeded.
- Keyless publish ignores p_meet.owner_id as authority and uses auth.uid(). It rejects non-member publication of an already-owned slug without a valid key; A1 is the ownerless exception. A valid legacy key remains a broad bypass and, combined with a signed-in caller, can add that caller as an owner member. Keep that capability out of the owner API.
- New listing expectations require revisiting public-read policies; adding is_public_listed does not automatically change access. Unlisted is not private.

**Tokens / redirects:**

- withAccessToken clones a client with the new bearer, retaining anon API key and optional join header. The hook forwards session changes through an effect; once it runs, later controller requests use the new token. The fake-network probe verified the next write used REFRESHED_TOKEN and no token entered controller storage.
- Account session persistence found is Supabase's `zt-auth-v1`. Sync stores meet links/join codes, device ID, queue and optional legacy publish key, not the account JWT. Join codes are nevertheless write capabilities.
- Started requests keep their old headers; refresh/sign-out cannot retroactively replace them. No cancellation/session-generation guard protects their completion effects (A4).
- accountRedirectUrl uses current origin plus fixed `/website/account`, not a query-controlled destination. Supabase allowlist enforcement through an emailed link was not tested.
- Fresh route navigation with encoded `<script>AstraAudit</script>` in error_description displayed literal text, removed the hash and created no script element. Handler runs on mount, not arbitrary same-document hash changes.
- No magic link was requested. Email confirmation, actual refresh-token rotation, successful live-session sign-out and live keyless publish were not exercised. Fake-network tests do not prove deployed RLS enforcement.

## Part 4: deployed browser pass

### Additional finding

MED | components/website/AccountClient.tsx:120-132 | B1: Account mode controls declare tablist/tabs but all remain tabIndex=0, have no panel association and lack arrow navigation; ArrowRight from Sign in left focus/selection unchanged. | Fixed promoter tabs do not fix the separate account surface's incomplete keyboard/assistive-technology behavior. | Implement complete tab semantics and keyboard handling or use ordinary mode buttons without tab roles.

### Executed checks

| Check | Result |
|---|---|
| Dashboard -> meet | Seven ordered tabs and seven mounted panels, six hidden. |
| Left/Right/Home/End | Focus and aria-selected followed together, including first-to-last wrap. |
| Listing draft retention | Facility edit survived switching away and back. |
| Listing dirty/save/reset | Sticky bar appeared; Save Listing Settings cleared it; a second edit followed by Reset restored saved value and cleared dirt. Listing uses Reset, not builder Discard. |
| Builder dirty/save/discard | Meet-name edit activated dirt, Discard restored it, Save Changes committed another edit and cleared the bar. |
| Dirty registration guard | All Accept/Decline buttons disabled with Save/Discard explanation for parent-owned builder dirt; EventForm-only draft is M2's exception. |
| Clean-draft acceptance | Pending count 5 -> 4; accepted entry showed On Roster; emergency contacts displayed. |
| EventForm | Draft survived tabs, but no global dirt and registration actions remained enabled (M2). |
| Listing labels | All 15 input/select controls had labels. Notes' “14 fields” is stale; original missing-label issue is fixed. |
| Create -> public link | Astra Created Fixture opened at `/promoter/srv-meet-101`; same-tab link resolved `/register/astra-created-fixture` with correct name/default closed state, not missing-meet. |
| Open registration | Iron Furnace public data rendered; radio ArrowRight/Left/Home/End moved checked state with focus and roving tabindex. |
| Validation / waiver | Empty-name/invalid-contact errors displayed; unchecked waiver blocked continuation. Four placeholders substituted in displayed waiver. Missing-file failure inspected in source, not induced by file deletion. |
| Open submission | Fake entry returned reg-101/PENDING, correct organizer/contact and repeated tab-only/not-real warning. |
| Public payload | HTML/RSC lacked joinCode/adminPin/emergencyContact/publishKey/FRNC26. Hydrated meet had exactly slug/name/date/listing/promoterDisplayName/divisions/acceptedCount with no private keys. Downloaded fixture bundle still carries owner data (H1). |
| Waitlist | Garden State fake entry showed WAITLISTED and Promoter (contact not provided), not unrelated organizer. |
| Closed | Steel River showed closed state/no form. API tests independently reject closed submission. |
| Unknown URLs | Both promoter and register return HTTP 200 (M13). |
| Visual scope | DOM/interaction checks executed. Hidden browser panel prevented screenshots; no screenshot-based responsive/layout claim. |

### Staging sign-up: request completed, continuation blocked

- Reserved example.com test address was rejected as invalid; no session created.
- Password signup for **astra-audit-20261017@zerotacky.com**, display name **Astra Audit Delete Me**, returned **HTTP 200**, user ID **3fba85d0-3275-4beb-ac03-f4cbea494809**, and **no session**. UI correctly asked for confirmation.
- Password sign-in returned **HTTP 400, Email not confirmed**. No mailbox was available. I did not bypass confirmation or change Auth settings.
- **Profile-row creation and role-save persistence remain runtime-blocked, not passed.** Trigger/self-only save inspected; anonymous profile reads are intentionally empty under RLS. Same blocker prevents authenticated isolation/live keyless-publish tests.
- **Slate cleanup:** delete the unconfirmed staging auth user above. No real meet/registration rows were created by this audit. This was password signup, not magic link; confirmation-email delivery is unknown.
- Password was generated in browser, excluded from report/logs and temporary variable removed. Browser ended on clean signed-out Account page without a session.

## Verified claims from PROMOTER_NOTES sections 1 and 2

- TypeScript is clean; promoter/register counts are 14/13. Current full suite is 176/13, not the notes' historical 173/12.
- Three lifecycle seeds remain; upcoming starts with 2 athletes, 2 accepted and 5 pending. Contacts are stored/displayed in owner preview.
- Same-name linkage uses explicit IDs; accept/decline/withdraw/reopen probes preserve unrelated athletes and refuse removal/reopen of scored athletes.
- Save preserves stored result objects and rejects direct scored-athlete/event removal, but does not establish complete reference integrity (H3).
- Parent-state draft protection, mounted panels, Listing dirt/labels, promoter tabs and registration radios work, with the EventForm exception.
- Create-to-registration works in the same realm, and reset/non-real warnings are explicit. No reload/cross-tab persistence claim.
- Public submission deadline/cap gates and waitlisted-pending storage have executable test coverage. Acceptance capacity is a separate policy gap.
- Registration errors/failed refresh have rendering paths; missing/empty waiver hides the form in source.
- Public component DTO excludes owner detail and uses the selected organizer/contact fallback, without removing owner fixtures from the browser bundle.
- Independently recalculated Sandstone ratios: 6.10:1/6.47:1 (AA); Arena-TV primary-on-surface: 12.85:1 (AAA).
- Privacy no longer promises no score loss; theme/layout storage exception is documented. Operator contact/SLA still need decisions.

## Integrator disposition / release gate

1. Close H1/H3's remaining boundary/integrity gaps and A1/A2 ownership holes before exposing a live backend through this UI.
2. Specify transactional, revision-checked M3 writes without copying destructive full publish (C2/C3/A3); decide capacity and public/unlisted semantics.
3. Keep the seven partial findings and M13 open. Re-run confirmed-account profile/role/isolation tests and keyless publish on disposable staging data after a confirmed test account is available, never on production.

No STYLE findings.
