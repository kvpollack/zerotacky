# Gym-admin 019 production read-only follow-up

**Result: the allowed anonymous/non-admin production read probes passed.** This narrows the remaining production visibility risk; it does **not** reproduce the staging write-path tests on production or certify every 017/018/019 function grant. Kurt confirmed 019 was applied before these checks.

## Scope

- Production project: `https://kagitbfthapxmaljsdtz.supabase.co`, with public directory `https://www.zerotacky.com/gyms`.
- One confirmed, existing **non-admin** production test account. `zt_is_admin` returned false. No admin or service-role credential was used. All database/website probes were **GET**. A single POST authenticated this existing test account; no registration, data write, SQL, config or migration action occurred. JWT/password were held in memory and omitted from evidence.
- Staging G-M1 through G-M5 were independently passed in `audits/astra-2026-10-21-gym-admin-retest.md`. G-L2 missing `addressComponents` and G-L1 successful parallel-add remain open there. This production check does not supersede those limits.

## Observed production checks

| Boundary | Anonymous | Non-admin test account |
|---|---|---|
| `zt_admins` table SELECT | **401/42501** | **403/42501** |
| `zt_is_admin` GET | **401/42501**, no EXECUTE | **200 false** |
| `zt_require_admin` GET | **401/42501**, no EXECUTE | **403/42501**, no EXECUTE |
| `zt_list_gym_claims` GET | **401/42501**, no EXECUTE | **200 `[]`** |
| `zt_my_gyms` GET | **401/42501**, no EXECUTE | **200, zero rows** for this identity |
| `zt_my_meets` GET | **401/42501**, no EXECUTE | **200, zero rows** for this identity |
| `gyms?select=owner_id` | **401/42501** | **403/42501** |
| `gym_claims` own-state column SELECT | **401/42501** | **200, zero rows** for this identity |
| `gym_claims` email/message/user_id SELECT | **401/42501** | **403/42501** |
| `gyms?status=eq.pending` and `status=eq.removed` | **200, zero rows** for both filters | **200, zero rows** for both filters |

The zero-row pending/removed results demonstrate no exposure in the tested identities. **No production pending row was independently known to exist**, so these reads cannot prove a concrete cross-owner pending-row isolation case on production. The staging test used an actual disposable pending row and both identities.

The public gym table query returned **169 unclaimed/claimed rows, 49 states excluding DC plus DC** for each identity. The production site's HTML also showed a 169-gyms/49-states badge. The recorded `source_url` for The TOP Strength Project now points to [the site's homepage](https://www.thetopstrengthproject.com/), where its move announcement appears. These are read-only data observations, not evidence of the migration's full installation history.

The non-admin zero-row projection `zt_list_gym_claims?select=account_email&limit=0` returned **200 `[]`**. This is consistent with the new field being available without leaking claims to a non-admin. It cannot alone prove a claim's actual account-email value on production; the staging queue test did that with a disposable claim.

**Limit:** no mutating admin, add-gym, publish, score or rate-limiter RPC was called, even with a dummy ID. Thus the anonymous EXECUTE state of all nine 018 dashboard mutators and the admin mutators was **not directly reprobed here**. The first pass did not authenticate because the saved account file's non-secret `project` field was `prod kagitbfthapxmaljsdtz`, rather than the bare project ID expected by the local guard; no request was sent in that pass. The guard was corrected and the successful read-only pass produced this evidence. An optional second pass for extra read-only functions did not produce an artifact and was cancelled, not counted as a pass. Anonymous OpenAPI metadata was restricted to service_role (401); no service key was used.

## Handoff

The **production read-only checks are complete within their stated scope**. G-M1 through G-M5 remain cleared on staging, with no regression indicated by production visibility reads. G-L2's missing-component geocoder case still needs a fix; G-L1 needs a successful parallel-add test once the account's one-day cap permits it. Leave production mutation and migration verification to Kurt's own release process.

Evidence: `audits/astra-2026-10-21-gym-admin-prod-readonly-evidence.json`.
