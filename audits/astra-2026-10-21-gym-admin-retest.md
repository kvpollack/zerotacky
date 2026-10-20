# ZeroTacky gym-admin fix retest, 2026-10-21 brief

**G-M1 through G-M5 are cleared on staging at the tested paths. Overall verdict: merge after listed fixes, not a blanket “all clear.”** The remaining code gap is LOW G-L2: a wrong-town response without `addressComponents` still passes as a street match. G-L1's successful parallel-insert path remains unverified because the existing daily cap refused both calls. Neither is a reproduced HIGH authorization issue.

## Scope and build

- Retested the requested **`87c3241cfec9b9425ba2e1717163445441cde3ac`** revision. All **277 tracked blobs** matched at the final source fingerprint.
- **293 tests passed, 0 failed, 25 files.** Separate no-emit TypeScript run exited 0 without diagnostics. Additional executable mocks and browser/API probes are recorded in the companion evidence.
- All live calls were to the v2 preview and staging Supabase **`hryiqiopkihkcrkdyllg`**. Used confirmed `astra.staging` as non-admin owner and `slate.staging` as admin. Browser contexts blocked other hosts.
- Actual staging timestamps are **2026-10-20**; the 10/21 brief date is advisory. No project source/configuration changes, SQL, migrations, real-gym edits, production probes or delegation. Production remains held until Kurt confirms 019 landed.
- Evidence: `audits/astra-2026-10-21-gym-admin-retest-evidence.json`. Temporary harnesses and test logs: `~/.aki/tmp/astra-gym-retest/`. Temporary session copies were removed after the retest; supplied credential files were left alone.

## Per-finding disposition

| Finding | Retest result | Evidence / limits |
|---|---|---|
| **G-M1 pending save** | **PASS** | Owner PATCH returned exactly one pending row, persisted the changed name, and stamped high confidence/current verification date without publishing it. At 430 px, browser Save displayed **“Saved. Your listing is still waiting for review.”** The name persisted through reload and a separate REST read. Anonymous and other-authenticated pending-row reads returned **200 `[]`**. Other-account UPDATE returned `[]`. Owner `select=owner_id` refused **403/42501**. Anonymous pending detail returned **404**; the public directory contained no audit card. Both public data helpers now explicitly filter `unclaimed,claimed`. A source mock confirmed a zero-row save throws instead of reporting success. |
| **G-M2 email identity signal** | **PASS** | Astra's account email is `astra.staging@zerotacky.com`. A claim typed as `owner@astra-fix.invalid` against `https://astra-fix.invalid` was accepted for review, but queue RPC returned the real confirmed **account_email** separately. Admin browser showed the real account address, labelled the typed address **“typed into the form, unverified”**, and displayed **“ACCOUNT EMAIL IS NOT ON THE SITE DOMAIN.”** A second claim with typed `owner@gym.com@evil.net` was similarly unverified and did not gain a matching badge. The pure helper returns **mismatch** for that malformed address; child-domain mail returns **related**, not match. The intake still stores malformed typed contact emails, but they no longer drive the ownership signal. |
| **G-M3 removal closes queue** | **PASS for removal** | The disposable pending gym carried **three pending claims and one pending report**. A single admin `zt_remove_gym` returned 204, changed all three claims to **rejected** and the report to **approved/handled**, and left zero pending queue entries for it. No separate reject/dismiss cleanup was needed. The rejection-of-new-listing branch calls the same close helper in source, but was not separately exercised live in this capped round. |
| **G-M4 pin constraints** | **PASS at database boundary** | Owner PATCH with **999/-999** failed **400/23514 `gyms_latlng_chk`**. Latitude-only `40/null` failed the same check. A **null/null** pair succeeded, as did a valid pair. The initial Add RPC also created the disposable row with null/null. Later invalid-pin Add probes hit the daily cap before reaching argument validation, so those responses are **not** evidence of the Add function's pin-specific error message. The shared table constraint was tested directly. |
| **G-M5 unresolved move clears pin** | **PASS, live browser + database** | Starting from a saved **39.92,-75.41** pin, changed the street to **999999 Astra Nonexistent Audit Lane** and ZIP to **00000**. The preview geocoder returned **404 / No match**, the save persisted the changed address, and a separate REST read showed **lat=null, lng=null**. The warning read: **“Saved. Your listing is still waiting for review. We could not place the new address on the map, so it will not show in distance searches until the address or zip is corrected.”** The address survived reload. The unknown ZIP was deliberate: with a valid ZIP the intended result is a fallback pin, not clearing it. |
| **G-L1 parallel add / cap** | **PARTIAL, successful collision path not retested** | The first disposable Add succeeded. By the later calls, Astra's existing rolling cap was exhausted. Both synchronized same-name Add calls returned **400 / “that is three gyms today”**; no extra row was created. This confirms refusal at the cap, not successful suffix allocation or the cross-caller unique-violation retry. Source has a per-caller advisory transaction lock plus unique-violation retry. Did not alter the cap, delete old records, substitute real gyms or use an extra account to evade it. Successful parallel inserts need a later slot/reset authorized by Kurt. |
| **G-L2 same-number wrong-town** | **PARTIAL, one LOW remains** | A mock with wrong city/state/ZIP in `addressComponents` now falls back to ZIP **41.87,-71.39**. A valid component-matched mock yields the street pin. However, the **original audit mock without `addressComponents`** still returns wrong street coordinates **30,-99**, `source=street`. Details below. Rate limiting remains deliberately parked, not counted as a regression. |
| **G-L3 badge** | **PASS** | Staging anonymous read counted **169 public gyms, 49 states excluding DC, plus DC**. Preview HTML and browser badge both displayed **169 gyms / 49 states + DC**. This verifies the current count and corrected calculation, not the provenance of the added gyms. |
| **G-L4 icons** | **PASS** | Both `/icon-light-16x16.png` and `/icon-dark-16x16.png` returned **200**; PNG headers confirm **16x16** dimensions. Preview HTML declares both with the correct light/dark media queries. |
| **G-L5 hydration** | **OPEN BY DESIGN** | React #418 was still observed on signed-in retest navigation. The requested saves and reload checks completed. No additional lost-field defect was observed. Retain the planned neutral Account/My Gym/Add/admin skeleton fix. |
| **STYLE-1 through STYLE-4** | **PASS in source; pending notice also live-tested** | No email or review-time promise remains in the two cited success/pending passages. Address text now describes street lookup then ZIP fallback. Pending Save says it remains under review. Admin introduction explains account control and the confirmed-account email signal. |

## Remaining G-L2 guard gap

**`app/api/geocode/route.ts:28-33`** treats an absent address component as agreement:

```ts
const sameState = !ac.state || ac.state.toUpperCase() === state;
const sameZip = !zip || !ac.zip || ac.zip === zip.slice(0, 5);
const sameCity = !city || !ac.city || ac.city.toUpperCase() === city.toUpperCase();
```

The original mocked provider response contains `matchedAddress: '717 OTHER STREET, DIFFERENT CITY, ZZ'` and `coordinates: {x:-99,y:30}`, but no `addressComponents`. The first number still matches 717, and the three absent fields all pass. The route returns a street pin instead of ZIP fallback.

**Recommendation:** when accepting a street pin, require the response to supply matching state and the city/ZIP requested, or safely parse equivalent required fields from `matchedAddress`. Missing evidence should fall through to the ZIP fallback. Add regression coverage for absent and partial `addressComponents` as well as explicit mismatch. This is a source/mock robustness finding, **not a demonstrated malformed response from the live Census service**.

The geocoder's rate limit remains parked as requested. It is separate from this missing-component check.

## Authorization regression checks

All seven admin/helper RPC probes refused anonymous EXECUTE (**401/42501**). The non-admin received `zt_is_admin=false`, an empty queue, EXECUTE denial on `zt_require_admin`, and “admin only” from approve/reject/resolve/remove. The new internal `zt_close_gym_claims` helper refused both anonymous and authenticated non-admin EXECUTE. Direct `zt_admins` reads were refused. The new account-email field did not appear through the non-admin queue.

The check is staging-only. This round did not recertify all nine unchanged 018 dashboard functions or production parity.

## Cleanup

Created **one** disposable gym, `astra-fix-retest-1021-media-pa` (`612d4840-5c49-4f13-9afe-3e4dafabba26`), under Astra. Admin removal closed its **three claims and one report**. Final public query, owner table query and Astra My Gym result all returned **zero rows** for the removed test data. The queue contained **zero pending claims/reports for this gym**. The existing Slate-owned gym's complete My Gym response matched the initial snapshot. No real listing was used for coordinate tests.

The disposable gym and closed claim history remain soft-removed, not hard-deleted. No avatar objects or new accounts were created. Temporary local access/refresh session copies were deleted; no credentials or JWTs are included in the companion evidence.

## Handoff

**Slate:** the five MED repairs can be marked independently verified on staging, with the specific Add/rejection branch limits above. Finish the small G-L2 missing-component guard before calling the whole fix round cleared. G-L1 needs a successful parallel-create check when the daily cap permits it. Production probes remain on hold until Kurt confirms 019 is applied, and will be limited to the authorized read-only anonymous/non-admin scope.
