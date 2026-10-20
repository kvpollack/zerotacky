# Astra retest: Athlete Directory

**Verdict: not cleared for production yet. Five original findings are cleared in their original scope; AD-M1 is not cleared.** The ordinary single-tab draft-loss bug is fixed, but the requested two-tab test still loses an unsaved location when a different About you field changes on the server. Two additional LOW filter gaps are documented below. No HIGH privacy or authorization issue was reproduced in this retest.

## Per-finding verdicts

| ID | Severity | Verdict | Evidence and disposition |
|---|---|---|---|
| AD-M1 | MED | **Not cleared** | Single-tab saves pass. Two-tab changes within About you still reset unrelated drafts. Fix the remaining grouped reconciliation and retest |
| AD-M2 | MED | **Cleared for original finding** | Kansas City, Missouri -> MO; West Virginia -> WV; all seven named brief cases pass. Additional format gaps tracked as AD-RL1 |
| AD-L1 | LOW | **Cleared** | All 56 client-listed words return true from the live reserved helper and are refused by the setter; website is unavailable to both test accounts |
| AD-L2 | LOW | **Cleared** | Six invalid avatar shapes rejected by live constraint; valid own-folder file path accepted |
| AD-L3 | LOW | **Cleared for original throw** | All three malformed helper inputs return empty with zero fake-client queries. Correctly escaped HTTP paths render 404. Raw malformed transport paths return 400 or browser protocol errors, not the brief's universal 404 |
| AD-L4 | LOW | **Cleared for original scheme/credential defect** | Dangerous schemes and credentials do not link. Bare example.com and uppercase HTTP on a dotted hostname link correctly. Host/localhost brief expectations need correcting |
| AD-RL1 | LOW, new | **Open** | Space-separated valid formats such as Columbus Ohio and Austin TX United States return no state |
| AD-RL2 | LOW, newly documented gap | **Open disposition** | `/athletes?state=TN` still initializes the filter to ALL. Query-string filtering was not implemented in the original feature either |

A cleared original finding does not mean every sentence of the retest brief's expected output was met. The differences are separated below rather than silently treated as passes. This report does not edit or supersede Slate's disposition file; AD-M1's claim of completion needs updating there.

## Scope and build

- Exact requested commit: **`6d3b46b687700d2ba392731aa8479ad1ade0e47c`**. Initial and final fingerprints each checked **304 tracked blobs with zero mismatches**.
- **337 project tests passed, 0 failed, 28 files.** TypeScript `--noEmit --incremental false` exited 0 with no diagnostics.
- Live preview: `https://zerotacky-git-v2-kvpollack-6654.vercel.app`; staging Supabase **`hryiqiopkihkcrkdyllg`**. Migration 020 was reported re-applied; live REST/RPC tests confirmed the new reserved list and avatar constraint behavior. No SQL was run.
- Used Astra and Slate staging accounts for bounded API probes; only Astra's profile was temporarily changed in the browser tests. The two-tab test used two pages in the same authenticated Chrome context. Public pages used a separate anonymous context. Viewport **375 x 900**. Outbound browser hosts were restricted to the preview and staging backend; no tested website link was opened.
- Entire retest performed in this Astra thread; no delegation. No application source/configuration, production or schema changes. The moving preview alias is not deployment-byte attestation.
- Evidence: `audits/astra-2026-10-21-athlete-directory-retest-evidence.json`. Reproduction harnesses and captured logs are at `~/.aki/tmp/astra-athletes-retest/`.

## AD-M1: remaining two-tab draft loss

**Live staging reproduction, matching source at `AccountClient.tsx:175-191`.** The code reconciles name and top-level role flags individually, but compares/replaces the entire About you object at line 190.

### Cases that passed

- Typed unsaved display name, location and home gym, then saved a new username. All three drafts survived; the server retained the original profile values.
- Toggled visibility on, off and on again. The same drafts survived each completed save; server reads confirmed they were not silently saved. Reload restored the original server values.
- Changed the username with main-form drafts pending, then saved the main form. The new username stayed and the display name/location landed.
- Saved the main form with a different, unsaved username draft. The username draft stayed in the UI but was not sent to the server.
- Tab 1 changed the display name. Tab 2 had an unsaved location and toggled visibility. Tab 2 picked up the new display name while keeping its unsaved location.

### Case that failed

1. Both tabs have saved location **Kansas City, Missouri** and a blank home gym.
2. In tab 2, enter **TAB2 MUST SURVIVE** as the unsaved location.
3. In tab 1, change only home gym to **Astra saved gym from tab one** and click Save profile.
4. In tab 2, toggle visibility on.
5. Tab 2 picks up the new home gym, but its location draft is replaced by **Kansas City, Missouri**. Server reads show location never changed, so this is lost local work, not a server-side location update.

`aboutKey(aboutFromProfile(prev)) !== aboutKey(aboutFromProfile(next))` causes `setAbout(aboutFromProfile(next))`. A change to any saved About you member therefore resets every draft in that group. This directly fails the brief's requirement that tab 2 reconcile only the fields changed on the server.

**Required fix:** reconcile the About you members independently too. Preserve the location draft when only home gym changed; apply the same rule to favorite lift/note, trainer options, PR entries and social fields at the intended editable granularity. Retest this exact case and a PR/social sibling case. Do not close AD-M1 with the single-tab toggle test alone.

## AD-M2 and AD-RL1: state parsing

**Executed helpers against the matching source.** All seven requested cases passed:

| Input | Result |
|---|---|
| Kansas City, Missouri | MO |
| West Virginia | WV |
| Virginia Beach, Virginia | VA |
| Kansas City | Unclassified |
| Kansas | KS |
| Portland, OR 97201 | OR |
| Austin, TX, USA | TX |

Additional comma-separated country cases passed, including **Portland, Oregon, United States** and **Charleston, West Virginia, United States of America**. Bare **UK** and **ZZ** stayed unclassified. **Charleston West Virginia** also returned WV.

**AD-RL1, LOW:** **Columbus Ohio** and **Austin TX United States** returned empty instead of OH/TX. The parser drops country text only as an entire comma component, and its spaced fallback accepts a two-word full state name or a two-letter final code, but not a one-word full state name. These gaps cause omission from the state filter, not the original wrong-state assignment. Support the additional trailing formats with focused tests, or explicitly constrain the accepted location format in the UI. The original wrong-state finding is closed; these newly observed formats are not claimed to pass.

**AD-RL2, LOW gap:** live `/athletes?state=TN` loaded with selected state **ALL**. Source confirms the page ignores search parameters and the browser starts `useState('ALL')`. Manually selecting TN and Trainer returned Slate's card; zero-match filters and Reset worked. If the retest brief intends shareable state-filter URLs, initialize/validate that parameter. Otherwise correct the brief and explicitly mark URL-driven filtering deferred. There are selects, not active-filter chips, in this implementation.

## AD-L1: reserved names

- The live helper returned **true for all 56 names** in the current client list, including all nine additions named in the brief.
- Setting those names was refused in all 56 attempts: **54** returned `That username is reserved.`; **zt** and **me** returned the minimum-length error first. The client has the same length-first behavior.
- Both Astra and Slate saw `website` unavailable. A Slate setter attempt returned the reserved message, so the restriction is no longer dependent on Astra's temporary hold.

**Brief correction:** Astra did not begin this retest with `website` as an active username. The first audit restored it to null, and this retest's baseline confirmed **null/private**. `website` was an earlier released hold, not an active profile. The account loaded and saved normally. No grandfathered active `website` profile existed to exercise; creating one now would require bypassing the reservation and is outside this audit. Source still permits a no-op setter for an unchanged existing name before validating reservation, but that is source evidence only.

The nine additions are in the final replacement definition at the end of 020. Reviewing only its first reserved-list definition would miss the applied replacement.

## AD-L2: avatar constraint

**Live authenticated REST, Astra's own row:**

| Shape | Result |
|---|---|
| `<uid>/../x.png` | 400 / 23514 |
| `<uid>/./x.png` | 400 / 23514 |
| `<uid>//x.png` | 400 / 23514 |
| `<uid>/` | 400 / 23514 |
| `/<uid>/x.png` | 400 / 23514 |
| `<other uid>/x.png` | 400 / 23514 |
| `<uid>/avatar.png` | 204, accepted |

The valid path was restored to its prior blank value; no image was uploaded. This validates the database constraint, not the existence of a corresponding Storage object.

## AD-L3: malformed usernames

- Direct helper and loader tests for `100%`, `%` and `%E0%A4%A` returned empty/null with **zero fake-client select calls** and no exception.
- Properly escaped URL forms `/athletes/100%25`, `/athletes/%25` and `/athletes/%25E0%25A4%25A` returned **404** with **No public profile here**.
- Raw HTTP requests to `/athletes/100%`, `/athletes/%` and `/athletes/%E0%A4%A` returned **400 Bad Request**. Headless Chrome produced `ERR_HTTP2_PROTOCOL_ERROR` for raw malformed paths. These do not establish an application 500, and no 500 was observed.

The original unguarded-decode defect is fixed. The brief's requirement that raw malformed transport URLs all render the application's 404 page is **not met**. Treat transport rejection separately. The zero-query claim comes from executed loader tests, not server query telemetry.

## AD-L4: website links

**Raw values stored temporarily in Astra's staging `socials.website`, then loaded through the anonymous public page:**

| Stored value | Rendered website link |
|---|---|
| `mailto:x@y.com` | None |
| `tel:555` | None |
| `javascript:alert(1)` | None |
| `ftp://host` | None |
| `https://user:pw@host` | None |
| `HTTP://Host` | None |
| `localhost:3000` | None |
| `example.com` | `https://example.com/` |
| `HTTP://Example.com` | `http://example.com/` |

All exercised public profile responses were 200 while opted in. The account email did not appear in the captured public bodies. Local helper coverage additionally refused credentials on a dotted hostname and accepted an explicit HTTPS dotted hostname with a port.

**Brief correction:** `HTTP://Host` and `localhost:3000` are rejected, contrary to its “last three render” expectation. The sanitizer retains its dotted-host requirement; the new unit test explicitly expects localhost to be rejected. That is not a remaining instance of the original credential/non-HTTP rewrite defect. Keep the public-profile host policy explicit rather than weakening validation merely to satisfy those two examples.

## Regression sweep and cleanup

- Anonymous, Astra and Slate public-view reads returned only opted-in `slate_staging`, with no email or created_at in the selected columns. Selecting email returned **400 / 42703** for all three.
- Base profiles returned no rows anonymously and only the caller's row for each signed-in account. `username_holds` reads remained denied (**42501**).
- Direct username PATCH remained denied (**42501**). Setting public visibility without a username remained blocked (**23514**).
- Clearing the public username set username null and visibility false together; no other profile field changed except the update timestamp. The just-visited public page returned **404** on the next request, **0.883 seconds** from starting the clear through the read and page check. This is an observed run time, not a global cache-eviction guarantee.
- Live combined state/role filtering, no-match role/search and Reset passed. Reset restored ALL/ALL/blank search. Document width was **375 px** at a **375 px** viewport. A separate local React render with zero profiles showed the empty-directory message, `0 listed` and both selects; the live directory was not emptied to stage that case.
- The initial browser harness completed account/social/clear checks, then stopped on a raw malformed-URL transport error. A read-only follow-up initially encountered navigation interruption after reusing that page. The final follow-up isolated URLs in separate pages and completed the remaining filters and restoration reads. Failed wrappers are not counted as passes, and the captured protocol errors are preserved in evidence.
- Final reads verified **both profiles match their initial snapshots except `updated_at`**. Astra is null/private; Slate is public as `slate_staging`; the anonymous public view contains only Slate. Only the existing audit names `astra_audit_web1021` and `astra_audit_avatar1021` were reused, so the retest did not introduce new test usernames. Releasing them renews their existing holds. No privileged hold cleanup was performed.
- All browser contexts were closed. Temporary retest session/profile snapshot copies were removed after packaging; original credential files were left intact. File removal is not server token revocation. No images, meets, results, registrations or production records were changed.

## Release recommendation

**Hold production for AD-M1.** Fix the remaining About you reconciliation, add the failing two-tab regression, and rerun that focused case here in Astra. Resolve or explicitly defer the two LOW filter gaps and correct the brief's host/transport expectations. No source fix, SQL application or deployment was performed during this retest. Production still requires Kurt's decision after the remaining gate is closed; this report does not clear unrelated event-order or older release findings.
