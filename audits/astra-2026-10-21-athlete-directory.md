# Astra audit: Athlete Directory

**Verdict: merge after fixes, not as is.** No HIGH privacy or cross-account write bypass was reproduced in the exercised staging paths. The public view limits rows and excludes the account email as intended. Two MED findings remain: the separate username/visibility controls discard unsaved profile edits, and valid full-name locations can put people in the wrong state filter.

## Findings and disposition

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| AD-M1 | MED | Saving username or visibility resets unsaved main-profile drafts | Open source fix; preserve unrelated dirty fields and retest both controls |
| AD-M2 | MED | State guessing misclassifies West Virginia and Kansas City, Missouri | Open source fix; match the location's state component, not the first matching substring |
| AD-L1 | LOW | `website` is not reserved in either username validator | Open policy/list fix or explicit acceptance; no actual route collision |
| AD-L2 | LOW | Avatar constraint accepts an own-folder traversal-shaped path | Open database hardening; public renderer already refuses it |
| AD-L3 | LOW | Malformed percent input throws in the username helper and loader | Open robustness fix; tested deployed URLs returned 404, not 500 |
| AD-L4 | LOW | Explicit non-HTTP website schemes can be rewritten into HTTPS user-info URLs | Open shared sanitizer fix; no script execution reproduced |

These are audit findings, not completed fixes. No application source, configuration, schema or production data was changed by this audit. The next implementation pass belongs with Slate, followed by a focused Astra retest and Kurt's production decision.

## Scope and evidence

- Requested feature commit: **`bb07e4b32fea21e53d8432fa690789d75ec19e19`**. Initial and final fingerprints each checked **300 tracked blobs**. Four files differed: `ROADMAP.md`, `components/setup/builder/MeetSection.jsx`, `components/shell/Header.jsx`, `components/strongman-app.jsx`. All other **296**, including the athlete-directory, account, auth and migration files examined here, matched. These four concurrent event-order/documentation changes are not cleared by this audit.
- **333 project tests passed, 0 failed, 28 files.** TypeScript `--noEmit --incremental false` exited 0 with no diagnostics. This was the local working tree described above, not a pristine checkout of the commit.
- Live target: `https://zerotacky-git-v2-kvpollack-6654.vercel.app`, staging Supabase **`hryiqiopkihkcrkdyllg`**. Migration 020 was reported applied in the brief; the live checks exercised its resulting behavior. No SQL was executed. The moving preview alias is not deployment-byte attestation.
- Tested anonymous access, Astra's staging account and Slate's staging account. Browser checks used headless Chrome at **375 x 900**, isolated authenticated/anonymous contexts, and blocked hosts other than the preview and staging backend. Existing test-account sessions were seeded into browser storage; this is not a new sign-in-flow audit.
- Evidence package: `audits/astra-2026-10-21-athlete-directory-evidence.json`. Local reproduction scripts, logs and screenshots: `~/.aki/tmp/astra-athletes/`. Temporary session/profile snapshot copies are removed after packaging.
- A non-Astra verifier thread was opened, then paused by Kurt. It did not supply an independent signoff. Its observations were checked here against source and existing evidence; the additional Kansas City case was executed in this Astra thread. All subsequent audit work stayed here. Do not characterize this report as two independent Astra reviews.

## AD-M1: independent saves discard the main form's unsaved edits

**Evidence: live staging browser plus source.** `AccountClient.tsx:175-183` resets `draftName`, role toggles and `about` whenever `auth.profile` changes. Both `useAuth.ts:159-177` save paths replace that profile object after saving their own field.

Reproduction:

1. Open Account with the Astra test profile and an existing username.
2. Without clicking **Save profile**, change the display name to `Astra UNSAVED toggle` and location to `UNSAVED toggle location`.
3. Tick **Show my profile publicly**, then wait for the success message.
4. The UI reverts to `Astra Staging` and a blank location. Server reads confirm those original values remain, while `is_public` changed to true.

The initial browser run also recorded the original main-form values after a username save. Source shows the same reset mechanism for both controls. The username action has no draft-loss warning. The private visibility copy says to save the profile above first, but a warning does not meet the brief's requirement that independent saves preserve unrelated unsaved edits.

The observed failure is **lost local edits**, not those edits being silently saved. A separate **Save profile** action correctly saved the display name while retaining username/public status. The taken-name error read `That username is taken.`

**Fix:** initialize the main draft for an account change, and reconcile only the field group actually saved. Preserve dirty name/roles/about fields when username or visibility changes. Add browser regression tests for each independent control with unsaved text and role edits, and for the main Save with an unsaved username draft.

## AD-M2: full-name state matching assigns the wrong filter

**Evidence: executed pure helpers against the matching source; no synthetic location was written to a real or staging directory row for this check.** `lib/website/athletes.ts:74-87` scans state names in insertion order anywhere in the location string.

| Location | Expected | Actual | Found by expected state filter |
|---|---|---|---|
| Kansas City, Missouri | MO | KS | No |
| Charleston, West Virginia | WV | VA | No |
| Kansas City, MO | MO | MO | Yes |
| Charleston, WV | WV | WV | Yes |

`kansas` matches the city before `missouri` is considered; `virginia` matches inside `west virginia`. The original location still displays correctly, but those people disappear when visitors select their actual state. This is a core directory-filter defect despite the field being a convenience guess, not authoritative location data.

**Fix:** parse the trailing state component, allowing the supported ZIP/country suffixes, and prefer complete state names rather than arbitrary interior matches. Keep unknown locations unclassified. Test both failing examples as well as the existing code/ZIP/country cases.

## LOW findings

### AD-L1: reserved-name list omits `website`

**Evidence: live RPC and source.** `zt_set_username('website')` returned 200 and stored `website`; client validation also accepted it. The brief explicitly includes `/website` among the route words to examine. `supabase/020_athlete_directory.sql:37-44` and `lib/auth/profile.ts:230-235` omit it.

`/website` and `/athletes/website` are separate routes, so this is a list/policy inconsistency, not routing takeover. Add it to both lists if route words are meant to be reserved, or explicitly document the exception. `how_it_works` was also accepted, but it is not the existing hyphenated `/how-it-works` route and is not independently a demonstrated collision.

### AD-L2: own-folder prefix check is weaker than the renderer

**Evidence: live staging REST and rendered page.** `profiles_avatar_own` in `013_profile_fields.sql:27-28` checks only the account UUID prefix. A path shaped `<Astra uid>/../outside.png` was accepted (200). A leading slash, unprefixed traversal and the other account's folder were refused (23514).

The public helper rejects `..`/leading slash, and the exercised public page rendered **zero profile images** with this stored value. No traversal request, other user's image access or data exposure was reproduced. Add segment/shape validation to the database constraint so it agrees with the public renderer. Keep the existing owner-folder Storage policies.

### AD-L3: malformed percent input can throw before the loader's catch

**Evidence: local helper/loader execution and live negative result.** `cleanUsernameParam('100%')` throws `URIError`; `getPublicAthleteByUsername('%', fakeClient)` also throws. `athletes.ts:163` calls `decodeURIComponent` without a guard, and `data.ts:293` calls it before the `try`. Neither page nor metadata caller wraps that call.

However, actual preview requests to `/athletes/%25` and `/athletes/100%25` returned **404** and rendered **No public profile here**. The malformed UTF-8 path `/athletes/%E0%A4%A` returned **400**. Do not report a reproduced deployed 500. Make the helper total by safely handling decode failures, then test both helper and HTTP behavior.

### AD-L4: non-HTTP website schemes are reinterpreted rather than rejected

**Evidence: executed shared sanitizer and URL helper; no external link was opened.** `cleanWebsite` in `lib/auth/profile.ts:88-100` prepends HTTPS whenever the input does not start with HTTP(S). Both `mailto:user@example.com` and `tel:123@example.com` become HTTPS URLs containing user-info, instead of being dropped. They can then pass through `socialUrl` as links, contrary to the stated non-HTTP rejection rule.

The live `javascript:alert(1)` stored-value test rendered **zero dangerous links**. Local JavaScript/data/FTP examples were dropped. This LOW is an incorrect-link/input-validation issue, not demonstrated XSS. Reject an explicit non-HTTP(S) scheme before adding HTTPS to a bare hostname; reject URL credentials as well. Add these examples to the shared sanitizer tests.

## Checks that passed, with limits

### Public boundary and ownership

- At baseline, anonymous, Astra and Slate reads of `zt_public_profiles` returned only **`slate_staging`**. The view explicitly selects public columns and filters `is_public and username is not null`, with `security_barrier`.
- Selecting `email` returned **400 / 42703** for all three roles. `created_at` is also absent from the view definition and the returned key set, though it was not separately requested as an error probe. Known test-account emails did not appear in the exercised public page bodies; Astra's also did not appear in the captured public HTML check.
- Base `profiles` reads returned no anonymous rows and only the caller's row for each authenticated account. Astra's attempted update of Slate's profile returned an empty row set; Slate's row was verified unchanged.
- Anonymous/authenticated reads and inserts on `username_holds` were denied. Additional anonymous/Astra update/delete attempts were denied. Anonymous/Astra updates through the public view were also denied.
- Setting public visibility with a null username failed **23514**. Direct username PATCH failed **42501**. Anonymous username/availability RPC calls were denied.
- Self-declared role flags generate the badges. The page's self-entered-data footer does not claim verification of athletic results, gym ownership or trainer credentials.

### Username ownership and lifecycle

- Mixed-case raw RPC input stored lowercase. Two characters, 31 characters and a hyphen were rejected. Three/30-character boundaries were accepted by local validation; exact-boundary successful writes were **not** separately exercised live.
- A leading `@` is stripped by the client wrapper before the RPC (local mocked-call evidence); a **raw** RPC with `@` returned the format error. Thus the user-facing normalization is implemented client-side, not in SQL as the brief could imply. No live browser leading-`@` save is claimed.
- Tested route words other than `website` were refused; `m` failed the minimum-length rule. The complete reserved list was read, not exhaustively live-tested.
- Taking Slate's active name failed. Another account could not take a recently released Astra name and got the explicit 30-day hold message. Astra reclaimed its own held name successfully.
- Two synchronized account requests for a free name produced **one success and one `That username is taken.`**, with exactly one of the two profiles holding it afterward. The loser returned **P0001**, not raw 23505. Source catches a unique violation and maps it to that message; this one live race does not prove which database branch handled the loser or exhaust every concurrency schedule.
- Clearing a public username changed username to null and visibility to false atomically; all other profile fields matched except the normal update timestamp. An immediate anonymous request to the just-visited page returned **404**, inside the requested 60-second window.
- UI clearing also left the visibility control unchecked and disabled with `Username cleared. Your profile is private again.` A named private profile returned a genuine 404.

### Pages and directory

- Canonical, uppercase, encoded-`@` and trailing-slash forms of `slate_staging` rendered the public profile with HTTP 200. Missing/private names returned 404.
- Search by `@slate_staging`, no-match state, reset, combined TN/trainer filter, and no-match gym-owner filter passed. Reset restored both selects to `ALL`. Document width was **375 px** at a **375 px** viewport; screenshots showed no horizontal page overflow in the captured states.
- A failed exact-label test was a harness issue: the select's wrapping label text includes its option text. A later GET-only check found each label via partial matching, and scoped select tests worked. No missing-label or broken-filter finding is claimed. A screen-reader audit was not performed.
- The tested individual profile responses were `private, no-cache, no-store` and cache misses. The directory produced a cached response in the browser run. The source declares 60-second page/list revalidation and a one-hour sitemap window. We did **not** establish a hard eviction bound for an already-open directory, sitemap, all CDN paths or search-engine caches. Do not turn the immediate individual-page 404 into a blanket deletion guarantee.
- No-backend empty-directory and fake-client loader tests passed within the project suite. No fabricated athlete fixtures were mixed into the live directory by the implementation examined here.

## Harness notes, cleanup and release gate

The initial browser attempt stopped at Playwright's immediate checkbox-state assertion; the corrected attempt clicked and waited for the asynchronous save. Its already-captured username/private-page evidence is retained separately. A later browser attempt completed clear/URL checks, then stopped on the overly exact filter-label locator; the remaining filters were run separately and passed. Two final read-only launch attempts failed before executing the script (unsupported Python flag, then missing dependency); the same script succeeded through the existing uv Playwright environment. These failed wrappers are not counted as passed scenarios. The early raw-HTML `notFound` substring flag also matched embedded not-found content on valid 200 pages; use the subsequent rendered-heading/browser evidence instead.

Final GETs verified **both profiles match their pre-audit snapshots in every field except `updated_at`**. Astra is again private with no username; Slate is again public as `slate_staging`. The final anonymous public view contains only Slate. No images, meets, registrations, results or real-user accounts were created or modified by this athlete audit. Browser contexts were closed.

**Residual staging test data:** username changes intentionally create holds. Eight exercised names remain unavailable to the other test account but available to their prior owner: `astra_audit_1021a`, `astra_audit_1021b`, `website`, `how_it_works`, `astra_audit_race1021`, `astra_audit_web1021`, `astra_audit_avatar1021`, `astra_audit_clear1021`. Their existence is inferred from the verified owner/other availability responses; the hold table itself stayed inaccessible. They are not active public profiles. The RPC's 30-day restriction ages out, but the rows are not automatically deleted by the inspected SQL. No privileged cleanup RPC exists in this feature. Leave them documented or have Slate perform a narrowly authorized cleanup later; this audit did not bypass the permission boundary or execute SQL to remove them. Reclaim-and-release would simply renew a hold.

**Release gate:** fix AD-M1 and AD-M2, disposition every LOW explicitly, and retest the affected account/directory paths before production. Migration 020 production application and release still require Kurt's go. This report does not clear unrelated event-order risks or earlier audit findings. Shows-on-profile, promoter/gym cross-links, linked home gym and a separate trainer directory remain agreed deferred scope; geocoder rate limiting is also outside this audit.
