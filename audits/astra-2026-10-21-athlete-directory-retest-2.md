# Astra retest: Athlete Directory, round 3

**Verdict: cleared for the requested Athlete Directory release scope. AD-M1, AD-RL1 and AD-RL2 are cleared on `08b389aa`.** The exact two-tab draft-loss case and both requested sibling cases passed on the live staging preview. No new finding was reproduced in this focused round. Production still requires Kurt's go; no deployment or SQL was performed here.

## Per-finding disposition

| ID | Severity | Verdict | Verified result |
|---|---|---|---|
| AD-M1 | MED | **Cleared** | Home gym/location, PR-row and social-link two-tab cases preserve unrelated drafts while receiving the changed server members |
| AD-RL1 | LOW | **Cleared** | `Columbus Ohio` -> OH and `Austin TX United States` -> TX |
| AD-RL2 | LOW | **Cleared** | Live `/athletes?state=TN` selects TN, including after reload; combined query filters and invalid/empty-result cases also pass |

The five original findings cleared in `astra-2026-10-21-athlete-directory-retest.md` are carried forward, not claimed as newly live-tested here. This round closes the remaining Athlete Directory audit gate. It does not clear unrelated event-order or earlier release findings.

## Version and method

- Exact commit: **`08b389aae836e963270f3cbdeeba3b2d8cb496da`**. Initial and final local fingerprints each checked **311 tracked blobs with zero mismatches**.
- **347 project tests passed, 0 failed, 29 files.** Includes all eight tests in `test/profile_draft.test.mjs`. TypeScript `--noEmit --incremental false` exited 0 with an empty diagnostic log.
- The current tracked SQL files were unchanged from the previous retest's `6d3b46b6` tree. No SQL was executed and no schema was changed.
- Live preview: `https://zerotacky-git-v2-kvpollack-6654.vercel.app`; staging Supabase **`hryiqiopkihkcrkdyllg`**. The alias is a moving target; source fingerprints are not deployment-byte attestation.
- All work stayed in this Astra thread, without delegation. Live two-tab checks used two pages in one authenticated headless Chrome context at **375 x 900**; query-filter checks used an anonymous context. External browser hosts other than the preview and staging backend were blocked.
- Evidence: `audits/astra-2026-10-21-athlete-directory-retest-2-evidence.json`. Harnesses, test logs and the TN-filter screenshot are retained under `~/.aki/tmp/astra-athletes-retest-2/`.

## AD-M1: exact two-tab and sibling retests

**Evidence: executed staging UI with direct server reads, plus matching source.** `AccountClient.tsx:155-158` now calls `reconcileAbout`. `lib/auth/profileDraft.ts:56-70` reconciles scalar fields individually, PRs by row and socials by link.

Each case started with fresh account tabs. Tab 1 saved through **Save profile**, not a simulated response. Tab 2 toggled visibility and waited for the successful server response and UI update. The initial test fixture was set only on Astra's designated staging profile and was restored afterward.

### Exact home gym / location case: passed

1. Both tabs started with saved location **Kansas City, Missouri** and a blank home gym.
2. Tab 2 entered **TAB2 MUST SURVIVE** as its unsaved location.
3. Tab 1 saved home gym **Astra saved gym from tab one**.
4. Tab 2 toggled public visibility on.
5. Tab 2 retained **TAB2 MUST SURVIVE** and picked up the new home gym. The server still held location **Kansas City, Missouri**, confirming the draft was neither discarded nor silently saved.

This is the exact failure from the previous retest, now passing.

### PR-row sibling: passed

- Saved baseline: PR row 1 was `Audit Log / 275`; row 2 was empty.
- Tab 2 entered an unsaved row 2, `Audit Yoke / 800`.
- Tab 1 changed row 1 to `Audit Log / 300` and saved.
- Tab 2 toggled visibility off. It received row 1's **300** and retained the unsaved row 2. Server reads still contained only row 1.
- Tab 2 then explicitly saved. The server contained both the new row 1 and the retained row 2.

These are disposable fixture values, not verified athlete results. Reconciliation is intentionally per PR row, not per cell; this check did not exercise competing edits inside the same row or row compaction after deletion.

### Social-link sibling: passed

- Saved baseline: Instagram `astra_test`, TikTok `astra_old`.
- Tab 2 changed Instagram to unsaved `astra_unsaved_social`.
- Tab 1 added YouTube `astra_tv`, cleared TikTok and saved.
- Tab 2 toggled visibility on. It kept its unsaved Instagram, picked up YouTube and cleared TikTok.
- The server still held the original Instagram until tab 2 explicitly saved. After that save, the retained Instagram and new YouTube were present on the server and survived reload.

No external social link was opened. The browser recorded no page errors during these completed cases. Same-member server-wins behavior, trainer flags and no-change passthrough are covered by the passing project tests; they were not separately repeated live in this round.

## AD-RL1: location strings

**Evidence: executed pure helpers against the matching source, plus project tests.**

| Input | Result |
|---|---|
| Columbus Ohio | OH |
| Austin TX United States | TX |
| Kansas City, Missouri | MO |
| West Virginia | WV |
| Kansas City | Unclassified |
| Austin TX 78701 USA | TX |
| Washington District of Columbia | DC |

Both requested failures are fixed, and the checked original Kansas City/West Virginia cases remain correct. These checks did not write synthetic location rows into the live directory. State remains a convenience inferred from free text, not authoritative location data. The documented ambiguous-place limitation, such as guessing WA from Port Washington, is not resolved by this parser and is not presented as verified geolocation.

## AD-RL2: live query-string filtering

**Evidence: anonymous staging browser. All four page requests returned HTTP 200.**

| Query | State | Role | Search | Result |
|---|---|---|---|---|
| `?state=TN` | TN | All | Blank | Slate's card shown; TN also selected after reload |
| `?state=TN&role=trainer&q=%40slate` | TN | Trainer | @slate | Slate's card shown |
| `?state=AZ` | AZ | All | Blank | AZ remains selected; zero-match message shown |
| `?state=ZZ&role=admin` | All | All | Blank | Invalid state and role fall back safely |

Reset from the TN case changed the selected state to All. Document width remained **375 px** at a **375 px** viewport. No page errors were recorded in these cases. Local sanitizer checks also confirmed lowercase TN normalization, first-value handling for repeated state parameters and the 60-character search cap.

This verifies query-driven initialization on page load and reload. It does not claim two-way URL synchronization when a visitor changes a select, or same-route client navigation/back-button coverage beyond the exercised requests.

## Restoration and limits

- Astra began this round with **username null, private**. The fixture reused the existing `astra_audit_web1021` name, not a new username.
- Final authenticated reads verified **every Astra profile field matched the starting snapshot except `updated_at`**. Username is again null and visibility false. The profile's PRs, social values and location were restored.
- The complete anonymous public-view response matched its baseline and again contained only **`slate_staging`**. Slate's account was not signed into or mutated this round; no claim is made about re-reading its private fields.
- Releasing the reused test name renews its existing hold. No privileged hold cleanup was attempted, and no additional test-name hold was introduced.
- Browser contexts were closed. Temporary session/profile snapshot copies were removed after evidence packaging; the original credential file was untouched. Deleting the local session copy does not revoke its server token.
- No app-code/configuration changes, SQL execution, image uploads, meet/result/registration changes or production requests were made. Temporary PR/social values existed only on the staging test profile during the authorized test.
- This was a focused third round. Prior privacy/constraint and malformed-URL results remain documented in the preceding report rather than being needlessly rerun. Its distinctions about raw malformed transport URLs and single-label website hosts still apply.

## Release recommendation

**The remaining Athlete Directory audit gate is closed.** Carry this report back to the implementation thread for the release decision. If Kurt approves, follow the documented order: apply the final migration 020 on production before deploying the complete directory file set, including the new `lib/auth/profileDraft.ts` dependency. This audit did not perform either step and does not constitute production verification.
