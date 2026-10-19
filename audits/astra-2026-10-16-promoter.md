# Astra audit: Argon promoter/registration drop (v2 `b377c4ec`), 2026-10-16

TypeScript passed; all 161 tests passed. The two new suites contain 15 tests, not 21.

Ownership check passed for committed source: 8062a487 -> b377c4ec contains exactly 21 permitted additions, and every local tracked file matches b377c4ec. No shared-file edits or monkey-patching found. No project files edited, SQL executed, or production accessed.

## Findings

HIGH | app/register/[slug]/page.tsx:45 | Public registration serializes the complete owner detail, including summary.joinCode and state.meet.adminPin; unauthenticated HTML contains FRNC26 and 1050. | Hiding the Meet Day panel does not protect credentials in the React payload; these are fixture values today, but this violates the boundary required before live integration. | Return an allowlisted public registration model that excludes owner credentials and private configuration.

HIGH | lib/promoter/fixtureApi.ts:484-512 | Roster matching falls back to name plus division: different-email registrants can collapse into one athlete, and declining an unaccepted same-name request deletes another accepted athlete's unscored roster row. | A registration decision can remove or merge the wrong competitor. | Associate registrations with explicit athlete IDs and never identify or delete roster entries by name.

HIGH | lib/promoter/fixtureApi.ts:363-376 | Saving after deleting a scored athlete preserves their result rows but removes the athlete; reproduced with srs-a1 and its locked result. | Result bytes survive, but their references become invalid and the athlete disappears from scoring. | Reject configuration changes that orphan existing results, including athlete, event, and division deletion.

MED | components/promoter/PromoterMeetDetailClient.tsx:249-251 | Accept/Decline replaces the entire working state with the freshly fetched saved state; browser reproduction erased an unsaved meet-name edit and dismissed the dirty bar. | Registration actions silently discard unrelated builder changes. | Preserve and merge the draft, or require Save/Discard before registration actions.

MED | components/promoter/PromoterMeetDetailClient.tsx:521-554 | Switching tabs unmounts local drafts: unsaved Listing fields disappear, and an edited EventForm disappears without ever activating the global dirty bar. | The claim that any builder-field edit is protected by dirty-state handling is false. | Keep section drafts mounted or lift their draft state and dirty tracking into the parent.

MED | app/register/[slug]/page.tsx:35-38 | A newly created browser-only meet opens in /promoter/<id>, but its /register/<slug> link returns 404 because the server singleton does not contain it. | The advertised create-to-registration workflow breaks across the server/browser boundary; metadata also falls back to the generic title. | Use one authoritative data source, or resolve fixture-only registration consistently in the browser.

MED | components/register/RegisterClient.tsx:560-565; lib/promoter/fixtureApi.ts:575-582 | Confirmation says registration was recorded, but created meets and registrations disappear on reload and never reach another browser; the UI gives no explicit reset warning. | "Website Skeleton Preview" does not explain that Save and Submit are temporary, single-browser operations. | State clearly that fixture changes reset on reload and do not submit a real entry.

MED | components/promoter/ListingSection.tsx:114-116; components/promoter/MeetDaySection.tsx:59-104 | Listing controls claim to affect /shows, and meet-day help promises working join/rotation behavior, while those destinations use separate website fixtures or Supabase rather than the promoter singleton. | Users can mistake fixture settings and codes for published, operational meet controls. | Label these actions as disconnected previews until the shared backend integration exists.

MED | lib/promoter/fixtureApi.ts:481-500 | After deleting a registration's division, Accept still succeeds and creates an athlete referencing the deleted division. | An accepted entry can be absent from every valid division despite a success response. | Validate the division and roster mutation before changing registration status.

MED | lib/promoter/fixtureApi.ts:156,566 | Emergency contacts are required and stored in a write-only closure map, but no API getter or promoter display retrieves them. | The promised meet-day emergency information is unavailable even before a refresh. | Add an owner-only emergency-contact field to the agreed contract and return/display it.

MED | components/register/RegisterClient.tsx:77-81,583 | Waiver organizer and confirmation contact always use DEMO_PROMOTER_USER, including registrations bridged from other /shows fixtures. | The waiver can identify the wrong organizer and the confirmation provides the wrong contact. | Carry the selected show's promoter identity/contact through the public registration model, using "not provided" when unavailable.

MED | lib/promoter/fixtureApi.ts:161-172 | registrationCount counts pending plus accepted requests, contrary to the contract's "subset of athleteCount" definition; the initial values are 7 registrations and 2 athletes, then 7/3 after Accept and 6/2 after Decline. | The implementation and contract describe different metrics. | Agree on request-count versus accepted-roster-count semantics and expose separate counts if both are needed.

MED | lib/promoter/fixtureApi.ts:109-140,532 | Submission checks registration status but ignores the displayed deadline and athlete cap; a meet with two athletes, cap 1, and a 2020 deadline still accepted a request. | Displayed registration limits do not constrain entry. | Enforce the agreed deadline/cap policy at submission, including explicit waitlist behavior, or label those fields advisory.

MED | components/promoter/PromoterMeetDetailClient.tsx:86-94,111-113,249-256 | Initial registration-list errors are ignored, refresh errors after Accept/Decline are discarded, and a current-user error is hidden behind the signed-out return. | Failures can look like empty registration lists or successful actions, violating the verbatim-error requirement. | Render each failed ApiResult.error at the relevant action and do not report refresh success when it failed.

MED | app/register/[slug]/page.tsx:13-18 | A waiver-file read failure becomes ordinary waiver text, leaving acceptance and submission enabled. | Registration can record a waiver timestamp when the actual waiver was never presented. | Fail closed and disable submission when the approved waiver cannot be loaded.

MED | app/promoter/[serverId]/page.tsx:21-25 | Unknown promoter IDs return HTTP 200 and render a client error, contradicting PROMOTER_NOTES.md:11. | Crawlers and link checks treat missing meets as successful pages. | Once lookup uses authoritative server data, call notFound() before rendering the client.

MED | components/promoter/ListingSection.tsx:235-364 | Ten listing inputs have visually adjacent labels but no programmatic label association. | Assistive technology cannot reliably identify those controls; clicking their labels does not focus them. | Add matching id/htmlFor pairs or wrap each input in its label.

MED | components/promoter/PromoterMeetDetailClient.tsx:436-467; components/register/RegisterClient.tsx:319-340 | Editor sections and division choices are native buttons with visual-only selection; the detail page contains zero [role=tab] elements. | Controls are keyboard-focusable, but assistive technology cannot determine the selected section or division. | Implement complete tab semantics for sections and radio-group semantics for division selection.

MED | legal/PRIVACY.md:51 | Deletion requests are directed to an operator contact supposedly listed on the site, but no such contact is published; the 30-day commitment has no documented supporting workflow. | Users lack the promised request channel, and the draft commits the operator to an unverified SLA. | Publish a real contact and obtain operator approval for a workable deletion process and response commitment.

MED | legal/PRIVACY.md:38 | "Scores are never lost if gym Wi-Fi drops" is unsupported: queue writes can fail silently and the queue drops oldest entries above 2,000. | The policy promises stronger durability than the implementation provides. | Describe local queuing and retries without an absolute no-loss guarantee.

MED | THEME_PROPOSALS.md:20,193 | Sandstone primary-on-surface calculates to 6.10:1, not 7.2:1; white-on-primary is 6.47:1, not 7.6:1, so both miss the claimed normal-text AAA threshold. | The proposal overstates accessibility compliance. | Correct both values/classifications or change the colors and recalculate.

MED | test/promoter.test.mjs:107,143-144,177; test/register.test.mjs:100-109 | Assertions still pass with important failures: result-length equality permits rewritten scores; rotation checks only the returned code, not stored rotation; decline checks count, not the removed identity; registration checks one injected API instance, not browser navigation or summary count. | Passing tests do not establish the preservation, identity, persistence, or end-to-end claims attached to them. | Add deep result comparisons, stored-state rereads, exact identity assertions, count assertions, and browser/server-boundary tests.

LOW | lib/promoter/fixtureApi.ts:60-72,127-129,335-379 | Validation accepts fractional caps and a digits-only five-character emergency contact; changing the meet date can also leave an already-saved deadline after that date. | Validation is weaker than its messages and cross-field rules imply. | Require integer caps, define contact requirements explicitly, and revalidate listing constraints when saving the meet date.

LOW | PROMOTER_NOTES.md:7-8 | The notes claim 12 promoter tests and 9 registration tests; the shipped suites contain 9 and 6, with no assertion on registrationCount and no browser end-to-end test. | Coverage and test execution scope are overstated. | Correct the counts and distinguish API round trips from browser integration coverage.

LOW | PROMOTER_NOTES.md:55 | The broad no-localStorage claim needs qualification: dashboard routes reuse WebsiteShell -> WebsiteThemeFrame -> useTheme, which writes ZEROTACKY_THEME_V1. | Save operations leave scorer data alone, but the rendered dashboard is not entirely storage-free. | Document shared theme persistence as an exception while retaining the prohibition on meet-state and sync-storage writes.

LOW | THEME_PROPOSALS.md:70 | Arena-TV primary-on-surface calculates to 12.85:1, not 14.9:1. | The numerical claim is incorrect, although AAA still passes. | Replace the stated ratio with the calculated value.

## Claims verified as true
- Three seeded meets cover upcoming/open, live, and completed/final; the upcoming meet has five pending requests and fictional athlete names.
- Create Meet navigates successfully to its browser-side detail page; ?signedout=1 returns the signed-out preview with the account link.
- All seven sections exist in the specified order, and the four builder components are imported rather than copied.
- saveMeetState preserves existing result objects exactly against attempted replacement and does not write scorer meet-state, link, or queue storage. The orphan-reference issue above remains.
- The Iron Furnace registration flow renders the full waiver with all four placeholders substituted, submits a pending request, and shows it in the promoter table through same-tab client navigation.
- Steel River shows the closed-registration card, closed submissions are rejected, waitlist fixtures accept pending requests, and /register/nope returns HTTP 404.
- The declared PromoterApi methods are implemented, emptyListing() and the existing status values are reused, and missing proposed fields are not hidden through any casts.
- Fixture code rotation changes and stores the six-character code; the meet-day links use the documented route shapes.
- Additional checks: all referenced zt-* color tokens exist, and none of the five proposed theme IDs collide. Next's file tracer recognized legal/WAIVER.md from an in-memory transpilation of the route; this is not a deployed Vercel verification. All legal files carry draft-review notices, no PA statute citations were fabricated, and the Vercel Analytics statement matches the production layout.
