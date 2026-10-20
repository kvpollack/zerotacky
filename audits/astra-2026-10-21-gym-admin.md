# ZeroTacky gym owner + admin audit, 2026-10-21 brief

**Verdict: merge after listed fixes, not as is.** No HIGH authorization bypass was reproduced in 017 or 018. The admin boundary held against the anonymous and non-admin probes. The main blocker for the gym-owner rollout is G-M1: editing a pending listing reports success but discards the edit. G-M2 also makes the approval queue's green email badge an unsafe ownership signal. These are gym/account findings, not a new clearance of meet-day code.

The brief date is advisory. Live observations and staging row timestamps are from **2026-10-20**. The changes were described as already on main/production; this verdict applies to the audited revision and observed staging behavior, not a recommendation to merge that revision again.

## Scope and evidence

- Personal source review of 015 through 018, relevant earlier function definitions, My Gym/Add my gym/admin components, public gym queries, geocoding, metadata, loader and prior audit disposition. No delegation, source/config edits, SQL execution, migration changes or Auth administration.
- Audited manifest **`8843f16973a03caa2ce74fa28221561f10e573d8`**. Final comparison of all **271 tracked blobs** found **zero mismatches**. The preview alias is mutable; matching local source is not byte-for-byte deployment attestation.
- **289 tests passed, 0 failed, 25 files**. Separate no-emit TypeScript check exited 0 without diagnostics. The first background test runner failed with exit 120; the redirected rerun produced the complete passing log. Browser locator failures were not counted as passes; short follow-up checks completed the affected assertions.
- Mutation and authenticated browser target: `https://zerotacky-git-v2-kvpollack-6654.vercel.app` with staging Supabase **`hryiqiopkihkcrkdyllg`**. Used the seeded Slate admin and Kurt-provided, confirmed non-admin Astra account. Browser routing blocked hosts other than the staging preview and staging Supabase. No real gym or meet was edited.
- Production access was limited to anonymous, read-only public gym rows for brief item 8. Also fetched the five gyms' first-party pages and the emitted preview OG asset. Production admin membership, grants and migration application were **not** independently verified.
- Companion evidence: `audits/astra-2026-10-21-gym-admin-evidence.json`. Detailed harnesses/logs remain in `~/.aki/tmp/astra-gym-admin/`. No passwords, bearer tokens or session objects are included in the companion evidence.

## Findings

### G-M1: MED, pending-listing saves silently discard the owner's changes

**`supabase/017_gym_admin.sql:35-40`; `lib/website/myGym.ts:207-215`; `components/website/MyGymClient.tsx:59-65`.** The UPDATE policy allows a pending row, but the SELECT policy exposes only `unclaimed` or `claimed`. PostgreSQL row security still needs the row visible to this filtered UPDATE. The owner reads pending rows through security-definer `zt_my_gyms`, but cannot update them through the table path used by Save.

**Live evidence:** the owner's direct PATCH returned **200 with `[]`**, and `zt_my_gyms` showed the original values. In the 430 px browser, changing the pending `Astra Parallel 1021` name and clicking Save reset the field to its old name while showing **“Saved. The public listing updates within about five minutes.”** A claimed disposable row accepted its owner's update, stamped `confidence=high` and `last_verified`, and refused the other account's update.

**Recommended fix:** use a narrow authenticated owner-update RPC that checks ownership/status, updates only allowed listing columns, and returns exactly one updated row. Preserve the public SELECT policy. Make the UI require that returned row, and make pending success text say it remains under review. If adding an owner SELECT policy instead, first make both public query helpers explicitly select only `unclaimed`/`claimed`; their current `status=neq.removed` filter relies on RLS to exclude pending rows. Do not fix saving by making pending listings publicly readable.

**Retest:** pending owner save persists through reload, stamps verification without changing status, other owner writes do nothing, and anonymous list/detail queries still omit the pending listing.

### G-M2: MED, the approval queue marks a self-declared email as a trusted-looking match

**`supabase/015_gyms.sql:106-116`; `supabase/017_gym_admin.sql:90-103`; `lib/website/myGym.ts:295-305`; `components/website/AdminClaimsClient.tsx:24-34,74-79`.** `zt_file_gym_claim` stores caller-supplied `p_email` next to the caller's real `auth.uid()`, without confirming the mailbox. The admin queue compares that supplied address, not a verified account address, to the gym's website.

**Live evidence:** the non-admin Astra account submitted `owner@astra-audit.invalid`, different from its authenticated email, against its disposable gym. The RPC accepted it (**204**) and the admin browser displayed **“Email matches site”** alongside the real Astra account name. This did **not** automatically approve a claim or bypass admin authorization; it can mislead the human who grants ownership. The Add-my-gym RPC itself correctly takes email from `auth.users`; the ordinary claim path is the weak path.

The source helper also classifies **`owner@gym.com@evil.net`** as a match for `https://gym.com`, because it reads only `split('@')[1]`. Ordinary `gym.com.evil.net` look-alike cases were correctly mismatched. The reverse suffix clause also treats a mailbox under a child of the site host as a match, which is not proof of ownership on independently delegated/shared domains.

**Recommended fix:** base the ownership signal on the confirmed account email, label a separate contact address as unverified, validate the whole email, and require manual verification for shared/delegated hosts. Domain similarity alone must not be labelled verified ownership. Add malformed-email and parent/child-domain tests.

### G-M3: MED, Remove listing does not close its pending claims and reports

**`supabase/017_gym_admin.sql:81-85,99-103`; `components/website/AdminClaimsClient.tsx:108-115`.** The confirmation says **“Open claims and reports on it are closed.”** The RPC only sets the gym's status to `removed`; the queue still joins pending claims against removed gyms.

**Live evidence:** after removing an audit-owned claimed listing, its anonymous claim and report both remained **pending** in `zt_list_gym_claims`, with `gym_status=removed`. The admin browser continued to show those cards. Cleanup had to reject/dismiss them separately.

**Recommended fix:** atomically remove the gym and close its open claims/reports with a clear disposition. Apply the same lifecycle rule when rejecting a new listing removes the gym, so sibling claims/reports do not remain actionable. Regression-test both removal paths.

### G-M4: MED, impossible coordinates can be stored and approved

**`supabase/015_gyms.sql:17-18,39-56`; `supabase/016_gym_owner.sql:34-36`; `supabase/017_gym_admin.sql:130-135`.** There is no database range constraint on latitude/longitude, although authenticated owners can write them directly and `zt_add_gym` accepts them as arguments.

**Live evidence:** `zt_add_gym` accepted **`lat=999, lng=-999`**, and admin approval preserved those values. The temporary row was corrected and later removed. This is a data-integrity problem for map pins and radius ordering, not privilege escalation.

**Recommended fix:** database checks for finite latitude in `[-90,90]`, longitude in `[-180,180]`, and a deliberate null-pair policy. Keep client validation too, but do not rely on the geocoder to protect direct REST writes.

### G-M5: MED, an unresolved address change keeps the old map pin

**`lib/website/myGym.ts:190-215`; `components/website/MyGymClient.tsx:59-65`.** `null` represents both “address unchanged, retain pin” and “address changed, lookup failed.” `saveMyGym` omits `lat/lng` whenever the pin is null. A moved gym with no resolvable ZIP can save the new address while retaining coordinates from its old city.

**Source + executable mock evidence:** the save payload for a changed address in Anchorage, with no ZIP and no resolved pin, omitted both coordinates. The mocked stored row retained its former `40,-75` coordinates. This was not reproduced by relocating a live gym.

**Recommended fix:** distinguish unchanged from unresolved. For an unresolved changed address, clear the old pin and show that the address saved without a distance-search location, or require a correction before saving. Preserve the normal ZIP fallback when available. Test network failure, unknown ZIP and an empty ZIP on a changed address.

## Required checks and limits

| Brief item | Result |
|---|---|
| 1. Admin boundary | All seven probed admin/helper RPCs refused anon with **401/42501**. Non-admin `zt_is_admin=false`, queue `[]`, and approve/reject/resolve/remove returned **“admin only”**. Direct `zt_require_admin` refused EXECUTE. `zt_admins` read/insert refused **403/42501** for the non-admin. Spoofed role/JWT-claim HTTP headers did not help; `pg_temp` profile selection refused **406/PGRST106**. Inspected fixed `search_path=public` and no exposed setter/dynamic SQL in these functions. This is not proof against every possible database-level role attack. |
| Null-user approval | A signed-out claim on the disposable listing was accepted for review. An admin approval attempt failed with the explicit **“filed signed-out ... create an account first”** message. No ownership was assigned. |
| 2. Add gym validation and limits | Anon add refused EXECUTE. A 10 KB name was clipped to 120 characters. HTML in the free-text payload was stored, not executed in the inspected owner/admin rendering; admin `<script>` count was zero and the injected marker stayed unset. Invalid gym type failed **400**. Coordinate failure is G-M4. State/ZIP constraints remain in the database; this was not a claim that arbitrary HTML passed every constrained field. |
| Slugs and submission cap | New rows had pending status, the caller's owner id and a new-listing claim. Collision with the already-claimed disposable gym produced a `-2` slug without changing the original. One pair submitted with only one slot remaining produced one success and one limit refusal; a fourth attempt also failed. A separate synchronized same-name pair by the admin produced base and `-2` successfully. No race failure was reproduced; source caveat G-L1 below. |
| 2-3. Pending isolation | `zt_my_gyms` returned pending rows. Direct anonymous AND owner table SELECT returned `[]` for the pending row, which explains G-M1. Pending detail returned **404**; public `/gyms` rendered **157 cards** with no audit names. `/sitemap.xml` returned **404**, and no sitemap implementation was found, so there is no sitemap generation path to clear. `listPublicGyms` and detail helper use the anonymous configured client and rely on RLS; neither has its own pending-status exclusion. |
| 3. Column grants and cross-owner | Pending row PATCHes to `slug`, `status`, `owner_id`, `source_url`, `confidence`, `last_verified` refused **403/42501**. `source_evidence` is also absent from the reviewed UPDATE column grant, but was not separately probed live. Another account's update returned zero affected rows on pending and claimed audit gyms. Claimed owner save stamped high confidence and the current date. Pending owner stamp could not be exercised because saving is broken. |
| 3. Claim reads | Each identity's direct own-claim query exposed only its own rows. The admin's ordinary table query did not bypass RLS; its separate admin RPC can see the queue by design. |
| 4. 018 sweep | All **nine** listed dashboard RPCs refused anonymous EXECUTE with **401/42501**. `zt_rate_check` and `zt_my_gyms` also refused. No new anonymous private-data bypass was found in the reviewed effective definitions. Public constraint helpers expose no private rows; membership/join/grant helpers returned false without credentials. Remaining intended public RPCs check a publish key, join/PIN/grant token, public listing, or input/rate conditions as applicable. Filing a gym claim is intentionally public and reveals no claim data. The 010 delete/follow/athlete-meets functions already revoke anon separately. No fresh `pg_proc` export or SQL query was executed, so the brief's production/staging grant parity is not independently certified. |
| 5. Admin and Add UI | Non-admin browser showed **“Admin only. This account is not on the admin list.”** No queue data appeared in its captured network; anonymous HTML had no claim data and declared noindex/nofollow. Add form rejected missing website/Instagram. No geocode request occurred during typing. Admin queue escaped the tested HTML. Email and removal defects are G-M2/G-M3. |
| 6. Geocode | Preview ZIP-only 19063 returned a centroid; unknown 00000 and empty query returned **404**, not 500. `717 School Street, Pawtucket, RI 02860` returned a street pin. An overlong street input returned the ZIP fallback. Source caps street at 160 chars and uses a fixed Census host with an 8-second abort. Mocked Census failure and wrong street number both returned ZIP coordinates. A same-number/wrong-town mock was accepted, G-L2. No real slow-provider load test was run. Client calls happen on submit, not on keystrokes. |
| 7. Assets and metadata | All **declared** icon URLs returned **200**. PNG dimensions were 32x32 light/dark, 180x180 Apple, 192x192, 512x512; OG was **1200x630**. Manifest parsed as JSON with resolvable icon paths, standalone mode and `/scorer` start URL. Both demo `/shows/keystone-fall-brawl-2026` and `/m/keystone-fall-brawl-2026` emitted explicit OG/Twitter image URLs; the emitted preview OG URL returned 200. Separate 16 px assets are absent, G-L4. OS installation/masking was not tested. |
| 8. Loader | Source's `ON CONFLICT ... DO UPDATE ... WHERE gyms.status = 'unclaimed'` protects claimed rows, and also pending/removed rows. The loader was inspected, not run. Five public production address checks are below. |
| 9. Copy | Pending helper text explains review, but Save falsely promises a public update, G-M1. Both known email promises remain ahead of implementation. Copy dispositions are below. |

## LOW / hardening

| ID | Evidence and recommendation |
|---|---|
| G-L1 | **`017_gym_admin.sql:118-129`.** The submission count and slug availability checks are read-then-write without a per-user/name lock or unique-conflict retry. Both bounded parallel tests passed, so do not describe a reproduced race. Serialize the per-caller cap and retry slug unique violations before treating the cap/suffix loop as concurrency-safe. |
| G-L2 | **`app/api/geocode/route.ts:19-27`.** Only the first street-number token is compared. A mock response with the same number but a different street/city/state was accepted. Validate returned address components before accepting a street pin. The unauthenticated route also has no application rate limit; fixed destination, length caps and caching limit some risk but do not stop unique-query quota/cost abuse. Add bounded throttling if traffic grows; no load attack was attempted. |
| G-L3 | Public row count is **157 across 48 states plus DC**, not the brief's “49 states + DC.” ND and NV are absent. **9 rows** lack a street address, matching the brief. Correct the coverage claim; do not add unverified gyms just to fill the map. |
| G-L4 | The brief lists separate 16/32 px light/dark favicons. `/icon-light-16x16.png` and `/icon-dark-16x16.png` both returned **404** and are not declared by `app/layout.tsx`. The declared 32 px and SVG alternatives work, so this is a deliverable/spec gap rather than broken browser icon links. Add the promised files or correct the brief. |
| G-L5 | The signed-in admin and owner/add routes raised minified React hydration error **#418** in this round. Settled controls rendered; no new field-loss case was established beyond G-M1. The prior account hydration issue is already acknowledged. Track the wider affected routes with that fix rather than claiming these pages are hydration-clean. |

## Five production gym spot checks

These compare public address fields to first-party sources, not an independent equipment inventory, on-site verification or a complete audit of 157 rows. No public row was changed.

| Gym | Result |
|---|---|
| Gegns Gym | **1013 Morena Blvd, San Diego, CA 92110** matches the utility-bar address on [its recorded source page](https://gegnsgym.com/strongman-events/). |
| Coastal Strength Compound | **1525 Old Louisquisset Pike, Lincoln, RI 02865** matches [the site's address schema](https://coastalstrengthri.com/). Stored `41.92,-71.45` is a coarse ZIP pin, while the site's schema gives `41.88618,-71.438908`. ZIP fallback is allowed; do not present that stored pin as street-precise. |
| The TOP Strength Project | The recorded [specialities page](https://www.thetopstrengthproject.com/specialities) still says **402 Walcott Street**, including its footer/schema. However, the [homepage](https://www.thetopstrengthproject.com/) explicitly announces reopening at **717 School Street, Pawtucket, September 1, 2026**, supporting the stored address and its provenance note. **Do not revert the address.** Point `source_url` to the move announcement or otherwise preserve a direct citation to it. |
| Strength Haven Gym | **14155 Sullyfield Circle, Suite D, Chantilly, VA 20151** matches [the official site's address schema](https://www.strengthhavengym.com/). |
| LiftVT | **340 Avenue D, Suite 20, Williston, VT 05495** matches the footer on [the recorded strongman page](https://www.liftvt.org/uss-strongman-vt). |

## Prior 10/20 dispositions checked this round

- **P-H1 avatar replacement:** source now uploads, saves the new profile path, then deletes the old file. All five replacement regression cases passed in the 289-test run, including failed save retaining the old object and removing the new orphan. Slate's live SQL-induced failure is recorded in its disposition, not repeated or represented as this auditor's live test.
- **P-M1 profile shape:** this round's direct nested PR and nested-social payloads both failed **400/23514** on staging. No profile restoration was needed for these refused writes.
- **Two-account Storage gap closed on staging:** Astra uploaded its own PNG; the other identity's overwrite failed Storage RLS, and its delete returned an empty list. Anonymous retrieval afterward returned the unchanged original bytes. Owner deletion succeeded; the owner's folder then listed zero objects. Production Storage permissions remain unverified.
- Other prior disposition items were not all re-exercised live in this round. This is not a blanket clearance of the 10/19 meet-day or 10/20 account scope.

## Copy dispositions

| ID | Disposition for Slate |
|---|---|
| STYLE-1 | **Known, still open:** `AddGymClient.tsx:69` says review is usually within a day or two and that an email will arrive. `MyGymClient.tsx:321` also promises an email. There is no sender. Replace with “We review new listings by hand. Check My Gym for the result.” Keep a review-time promise only if Kurt confirms it. |
| STYLE-2 | `MyGymClient.tsx:114` promises editing while pending. Fix G-M1 before keeping that promise. Pending Save should say “Saved. Your listing is still waiting for review,” never that it will appear publicly in five minutes. |
| STYLE-3 | `MyGymClient.tsx` still says the map pin comes from the ZIP when changed. The implemented order is street match, then ZIP fallback. Suggested: “We use your address for the map pin and fall back to the ZIP area when needed.” |
| STYLE-4 | Admin intro “Approve hands the listing to the claimant” describes the control awkwardly. Suggested: “Approve a claim to give that account control of the listing. Approving a new listing also publishes it.” Keep the ownership-verification guidance consistent with G-M2. |

## Cleanup and handoff

All **five** disposable gym listings were hidden with the normal staging admin removal RPC. The **seven** still-open audit claims/reports were rejected or dismissed separately, because G-M3 prevents removal from doing that itself. Final checks found **zero audit rows in the public query**, **zero audit gyms in either account's My Gym result**, and **zero pending audit claims in the admin queue**. The pre-existing Slate-owned gym matched its initial complete RPC row. The staging rows and closed claim history remain as soft-removed audit records, not hard-deleted data. They may continue counting toward the accounts' rolling one-day submission cap.

The single test avatar was deleted and its folder was empty. Both test accounts remain. No production data, real gym, real meet, source or environment configuration was changed. Temporary local session copies were removed after testing; the credential files Kurt supplied were left alone.

**Next action for Slate:** fix G-M1 through G-M5 before clearing the gym-owner workflow, starting with pending-save persistence and the email identity signal. Retest those fixes with the same two staging identities and disposable rows. Disposition every LOW/copy item explicitly; do not infer production permission parity from the staging passes. This audit does not request a meet-day code change before Saturday.
