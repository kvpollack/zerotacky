# Gym-admin fix round closeout: G-L1, G-L2, G-L5

**Verdict: all three requested remaining functional retests pass in their tested scope.** The successful staging parallel-add path now produces two distinct pending gyms with the base and `-2` slugs. The original missing-address-components geocoder mock falls back to the ZIP centroid. On the v2 preview, four signed-in routes loaded without React hydration errors for both test identities. The previously parked geocoder rate limit is still out of scope.

## Versions, scope and evidence

- Final on-disk audit fingerprint: **`ac40de524407b22dd319885fec4c20db6de1bd59`**, **284 tracked blobs**, **zero mismatches**. This is the v2 code used for the browser and source-mock tests. The three geocoder source/test blobs also match user-named main **`298e7447ff841af7d910008b8141b3b9d8e2688e`**. The preview alias can move; these are source fingerprints, not deployment byte attestation.
- Project suite: **305 passed, 0 failed, 26 files**. Separate no-emit TypeScript run exited 0 with no diagnostics. The 12 Census matching tests are included in the 305; six extra route-level mocks below were run independently.
- Staging target only: `https://zerotacky-git-v2-kvpollack-6654.vercel.app` and `hryiqiopkihkcrkdyllg.supabase.co`. Used confirmed `astra.staging` as the owner and `slate.staging` as the admin for disposal. Browser blocked other hosts. No production mutations, SQL, source/config changes or delegation.
- Companion evidence: `audits/astra-2026-10-21-gym-admin-closeout-evidence.json`. Detailed local test logs and harnesses: `~/.aki/tmp/astra-gym-closeout/`. Temporary session copies were deleted after verification; the supplied credential files remain untouched.

## G-L1: synchronized same-account add, PASS

Two `zt_add_gym` calls with the exact name **Astra Closeout Parallel 1021** started **0.327 ms apart**, and both requests were in flight at the same time. Both returned **200** with different IDs, the same Astra owner ID and `pending` status. Their slugs were exactly:

- `astra-closeout-parallel-1021-media-pa`
- `astra-closeout-parallel-1021-media-pa-2`

A subsequent owner table read returned exactly these two rows. Anonymous SELECT on both IDs returned **200 `[]`**. This clears the previously cap-blocked successful two-call path for one owner; it does **not** prove every inter-owner slug collision or sustained-load behavior.

While the cap was available, separate invalid `zt_add_gym` attempts for **999/-999** and a **latitude-only** pin both returned **400, “map pin is out of range.”** Neither created a row. These close the prior Add-specific test gap from G-M4.

## G-L2: missing components and wrong-town geocode, PASS

Six independent route-level mocks on the audited v2 source all returned the expected source. The **original failing mock**, `717 OTHER STREET, DIFFERENT CITY, ZZ` with number 717 but **no `addressComponents`**, now yielded ZIP centroid **41.87,-71.39** rather than its wrong street coordinates **30,-99**. A response without city/state/ZIP and a partial state-only component response also fell back to ZIP. A fully agreeing components response and a parseable matching `matchedAddress` without explicit components both yielded street coordinates. An explicitly wrong-town/state/ZIP component response fell back to ZIP.

Live, bounded preview GETs agreed with this behavior for ordinary addresses: `717 School Street, Pawtucket, RI 02860` returned a street pin **41.85886,-71.37433**, while the same street with Boston, MA and ZIP 02860 returned the ZIP centroid **41.87,-71.39**. No live Census response missing components was captured, so the original edge case is verified via mock and code, not presented as a naturally observed provider response. The geocode rate limit remains deliberately parked.

## G-L5: signed-in hydration, PASS for observed routes

Fresh browser contexts for the **Astra non-admin at 430 px** and the **Slate admin at 1280 px** each loaded and reloaded `/website/account`, `/website/account/gym`, `/website/account/gym/add` and `/website/admin/claims`: **8 identity-route scenarios, 16 HTTP 200 page loads**. Every server HTML response contained the neutral **“Checking your session”** skeleton; it disappeared after hydration. The correct authenticated page or “Admin only” view then appeared. The admin saw the temporary claims queue, and the non-admin was refused its page.

There were **zero Playwright page errors** and **zero console messages matching hydration/#418/Minified React**. There were **16 generic `Failed to load resource: net::ERR_FAILED` console messages**, two per scenario. The browser harness intentionally blocked non-preview/non-staging hosts; **zero staging backend requests failed**. These generic messages should not be called a hydration defect, but this check also does not claim all browser resources loaded. Browser private mode, slow-network transitions, recovery links and production routes were not tested here.

## Cleanup and handoff

The admin RPC soft-removed **both** disposable pending rows, and each new-listing claim changed from pending to rejected. The admin queue held **zero** pending entries for those IDs afterward. Anonymous and owner table queries returned zero audit rows; Astra's My Gym result returned to its initial empty set. The existing Slate-owned gym's full My Gym response matched the pre-test snapshot. Soft-removed rows remain in staging as audit history and may count toward the one-day submission cap until they age out or Kurt adjusts them.

**No new blocker from this closeout.** The original five MED findings were cleared on staging in `audits/astra-2026-10-21-gym-admin-retest.md`; the production anonymous/non-admin visibility checks are in `audits/astra-2026-10-21-gym-admin-prod-readonly.md`. Those earlier limits still apply: there was no production write-path audit, no full anonymous EXECUTE sweep of mutation-capable RPCs on production, and no load test of the add lock. Do not represent the parked geocoder rate limit as complete.
