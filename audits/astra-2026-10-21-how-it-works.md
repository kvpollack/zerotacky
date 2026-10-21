# Astra audit: How It Works, publish-key retirement, registration account gate

**Verdict: fixes needed. Keep the publish-key UI retirement, but fix the registration return flow and the misleading promoter instructions before calling this closed.** No HIGH authorization bypass was reproduced in the exercised staging paths. The account requirement works on staging at the RPC boundary, and the current local UI completes a guardian-account registration. Password recovery can be redirected away before a new password is set. The guide also sends a fresh promoter phone into an unrelated demo instead of the meet they just built.

## Findings and disposition

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| HI-M1 | MED | Registration return target overrides password recovery and survives ordinary inline sign-in | Fix before closing the account-gate change; prioritize recovery, clear completed inline returns |
| HI-M2 | MED | Email return routing exists only in the originating tab | Fix the email callback design; then verify real confirmation and magic-link delivery |
| HI-M3 | MED | Meet Day's scorer link does not attach the promoter's phone to that meet | Fix or explicitly document the attach step before promoters use the guide |
| HI-M4 | MED | Guide promises an unlisted `/shows/<slug>` page that returns 404 | Correct the public-link instructions before freeze |
| HI-M5 | MED | Guide/FAQ direct promoters to controls that are absent or elsewhere | Correct phone/dashboard parity, PIN location and waitlist instructions before freeze |
| HI-L1 | LOW | Return guard accepts backslash/control-character paths that normalize off-origin | Harden the shared guard; storage injection prerequisite limits demonstrated exploitability |
| HI-L2 | LOW | Capacity copy says accepted entries, but manual roster rows also count | Say total roster, including manual additions; pending entries do not consume spots |
| HI-L3 | LOW | Scoreboard description is the TV layout, not the default phone layout | Name both layouts and explain the TV toggle |
| HI-L4 | LOW | Lazy guide images have no reserved dimensions and cause visible layout shifts | Add image dimensions or aspect ratios; preserve lazy loading |
| HI-L5 | LOW | Smaller guide/copy mismatches remain | Correct screenshot context, run-order fallback wording, section reference and title punctuation |

All findings above are **open**, not implemented by this audit. No application code, SQL, configuration or production data was changed. Implementation belongs with Slate, followed by focused Astra retesting. This report is not a production migration approval.

## Scope and build identity

- Requested brief: `audits/astra-brief-2026-10-21-how-it-works.md`, including the account-gate addendum.
- Local source fingerprint: **v2 `83aba59da3f6d1d89f506c81bfc2b3613b1fd672`**, **338 tracked blobs**, zero mismatches both before testing and before report creation.
- **362 project tests passed, 0 failed, 30 files.** TypeScript `--noEmit --incremental false` exited 0 with no diagnostics. The brief's 360 count predates the two registration tests.
- Hosted preview: `https://zerotacky-git-v2-kvpollack-6654.vercel.app`. It was serving the pre-account-gate FAQ and registration UI during this audit: FAQ said **No**, anonymous visitors saw the athlete form. Staging database already enforced 021. Do not call this a clean hosted-preview gate test.
- The existing `http://localhost:3079` server served the current account-gate code against staging Supabase **`hryiqiopkihkcrkdyllg`**. Current-code inline sign-in, UI submission and return/recovery tests ran there. No server restart, environment change or deployment was performed. GitHub returned no deployment/check record for the audited v2 SHA; this does not prove there is no deployment elsewhere.
- Production `https://www.zerotacky.com` was inspected anonymously, read-only. It displayed the guide, retired-key copy and the **Yes, a free one** registration FAQ. Production registration RPC enforcement and authenticated publishing were not tested. The brief says production 021 waits on Kurt; this audit does not establish whether it was subsequently applied.
- Chrome headless, isolated contexts, primarily **375 x 900**. Production mutations were blocked. Current-build email callbacks were modeled with valid staging sessions, not claimed as delivered emails.
- Evidence: `audits/astra-2026-10-21-how-it-works-evidence.json`. Reproduction scripts and logs: `~/.aki/tmp/astra-how/`. All audit work stayed in this Astra thread.

## HI-M1: return routing interrupts recovery and later Account visits

**Evidence: current local browser with staging auth, plus source.** `components/auth/SignInForm.tsx:68-79,124-132` records `/register/<slug>` on password sign-in and Forgot password. `components/website/AccountClient.tsx:121-127` immediately consumes it whenever `auth.user` exists, without checking `auth.recovery`.

Reproductions:

1. Sign in inline on the disposable registration page. The page stays in place with no reload and prefilled name/email. Complete the registration. `zt_return_to` still contains the registration path.
2. Navigate to Account. It sends the user back to the registration page instead of letting them manage the account.
3. Fresh-load Account with a valid existing staging session in a recovery-shaped URL hash. With no return target, **Set a new password** appears. With the registration return target, the browser goes to `/register/<slug>` and there is no password-setting panel.

The third check models callback/session handling; it does **not** prove a reset email was sent or delivered. No password was changed.

**Fix:** recovery takes precedence until the password is saved or the user explicitly dismisses recovery. Do not leave a return target after successful inline password sign-in. Keep a return target only when a cross-page/email flow actually needs it. Test ordinary Account navigation immediately after inline registration, and recovery with and without an outstanding target.

## HI-M2: email links opened in a new tab lose the registration destination

**Evidence: browser storage model plus source, not live mail delivery.** `rememberReturnTo` uses `sessionStorage`. `lib/auth/supabaseBrowser.ts:23-25` always sends confirmation, magic-link and reset callbacks to `/website/account`, without a return destination in the callback URL.

A registration tab held `/register/<slug>`. A separate no-opener tab in the same browser context shared the authenticated account but had no return key; opening Account stayed on Account. That is the relevant state when webmail opens a callback in a separate tab. Same device is not the same tab. The staging auth settings reported **mailer_autoconfirm=false**, so the confirmation path matters.

**Fix:** carry a validated same-origin return path through the callback URL or another deliberately designed cross-tab handoff, with recovery handled separately. Avoid an unscoped last-writer-wins return value across concurrent registrations. Then test actual signup confirmation and magic-link clicks from the available inbox. No signup, magic-link or reset email was sent in this audit, so delivery and redirect allow-list coverage remain open.

## HI-M3: the promoter's scorer link opens a demo, not their show

**Evidence: hosted staging browser.** In a clean browser signed in as the guide meet's owner, open Iron Harbor's promoter dashboard, choose **8. Meet Day**, then the scorer **Open** link. Result:

- URL: `/scorer`.
- Scorer title: **Riverside Iron Fest 2026 (Demo Upcoming)**.
- No `ZEROTACKY_SYNC_LINK_V1` was established.

`components/promoter/MeetDaySection.tsx:57,90-95` links to bare `/scorer`. The guide's step 9 says that link is for the promoter's own phone, but never explains that signing in and opening it does not load their meet. This can put a promoter on the wrong state on meet day.

**Fix:** make the action explicitly open/attach this meet, or tell the promoter to join this meet with its code and PIN and verify the meet name before scoring. Retest a fresh phone and a phone holding another meet. Do not silently overwrite an existing offline meet.

## HI-M4: unlisted show-page promise is false

**Evidence: hosted staging HTTP/UI and source.** The disposable unlisted meet had a roster and open registration. `/shows/astra-how-75d44283` returned **404**, while `/register/astra-how-75d44283` and `/m/astra-how-75d44283` worked.

`lib/website/firstShow.ts:37-41` introduces the `/shows/<slug>` address, then promises its direct page exists before listing. The promoter track repeats the promise at `lib/website/howItWorks.ts:58-59`. But `lib/website/data.ts:182-199` requires `is_public_listed=true` for the show detail page. The Listing tab itself repeats the broad direct-link claim.

**Fix:** describe the actual distinction: unlisted removes the show detail page from this route, while the registration/scoring endpoints can still be reached directly. If the desired product behavior is an unlisted show preview, implement and test that intentionally. Also explain that unlisting is not privacy for roster names: the unlisted scoreboard remained readable.

## HI-M5: missing or misplaced promoter controls

**Evidence: all eight hosted guide-meet tabs, scorer UI and matching source.**

- `firstShow.ts:26` says everything in the guide also works in phone **Meet Setup**; `howItWorks.ts:54` says the phone has the same steps. `components/setup/MeetSetup.jsx` has the configuration sections and live sync, but no Listing or Registrations controls. The guide must send phone users to the My Meets dashboard for those tasks.
- FAQ **Join code or admin PIN** says both are on Meet Day (`howItWorks.ts:205`). The join code is there; the admin PIN is on **1. Meet**. This contradicts the corrected Join page and the guide's own step 2.
- FAQ **How do athletes get on the roster** says promoters can accept, decline or waitlist an entry (`howItWorks.ts:215`). The Registrations tab has Accept, Decline and Withdraw actions, not a Waitlist action (`RegistrationsSection.tsx:205-225`). **Waitlist Only** is a Listing setting for new entries.

**Fix:** correct these directions rather than adding new meet-week features. Treat these as pre-freeze copy corrections because a promoter following them cannot find the promised action.

## LOW findings

### HI-L1: the return-path guard is not a same-origin guarantee

The exact `takeReturnTo` function accepted a leading slash, one backslash, then `example.invalid/escape` and a slash, literal TAB, slash path. Standard URL parsing resolved both to `http://example.invalid/escape`. Plain `//example.invalid/escape` and `https://example.invalid/escape` were rejected.

Current local browser tests reached Chrome's blocked-navigation error page for the two malformed variants. The follow-up request-capture harness did not retain a destination request in its route-handler arrays, so do not claim a completed external fetch. The helper and URL-normalization failure are independently executed evidence. No token leak or remote way to populate another user's sessionStorage was demonstrated; the present call site constructs a registration path itself. LOW hardening, not a claimed account takeover.

**Fix:** reject controls/backslashes, parse against the current origin, require exact same origin, and return only the normalized path/search/hash. Test the writer and reader, not just a startsWith check.

### HI-L2: capacity includes manual roster rows

The fixture began with **one manually added athlete and zero accepted registrations**. The public capacity was **1**. Accepting the guardian-account registration assigned lot **8** after existing lot **7**, added one roster row and moved capacity to **2**. Declining it removed that row and returned capacity to **1**. `005_listing.sql:318` counts `athletes`, not accepted registration records.

`firstShow.ts:119,136` should say total athletes on the roster, including manual additions. Pending registrations do not take spots. The guide meet showed 14 spots taken and 0 accepted registrations in the owner dashboard, reinforcing the distinction.

### HI-L3: scoreboard table claims need the TV-layout qualifier

At 375 px, the normal `/m/<slug>` page showed overall-standing cards and one current-event breakdown per division. It was not a table with one column per event. `?layout=tv` rendered **five division tables**, each with `#`, Athlete, E1-E5 and Total, with dashes before scores. Station Up Now strips and division chips existed in both layouts; the guide meet's strips were idle.

Qualify `firstShow.ts:92,107,164` and the screenshot as TV/table layout. Explain the TV/Phone switch. Roster visibility before scoring passed.

### HI-L4: lazy images shift the guide

All **15 referenced PNGs** loaded, had nonempty alt text and `loading=lazy`. There are 16 files in the repo, with `02-my-meets.png` intentionally unused. Referenced source files total **3,110,621 bytes**. None of the rendered images reserved `width`/`height` or an aspect ratio (`app/how-it-works/first-show/page.tsx:78-84`).

An unthrottled 375 px Chromium navigation plus LayoutShift/LCP observers recorded **2,052 ms LCP** and **0.2021 cumulative observed layout-shift sum** while walking images. This is a one-run diagnostic, not a Lighthouse score, formal session-window CLS or field-performance claim. Document width stayed **375 px**. Add intrinsic dimensions/aspect ratios to prevent unloaded images collapsing.

### HI-L5: smaller copy and screenshot corrections

- Registration screenshot `14-register.png` predates the account gate. It can illustrate the signed-in form, but the caption should say that and show the gate too if the guide claims every current step is pictured.
- Run-order copy calls lot order the fallback whenever athletes are level (`firstShow.ts:104`). Under Reverse Previous Event, tied previous-event places first compare overall points, then lot (`lib/engine/runOrder.ts:58-65`). Name that exception. Event order is per station when overridden, not always the global card order.
- Registrations tab text still points to roster **Section 4**; Athletes is **5** (`RegistrationsSection.tsx:72`). The new headings 6. Listing and 7. Registrations themselves are correct.
- The guide body passed the forbidden-name/em-dash checks, but the rendered document title contains an em dash (`first-show/page.tsx:9`). Use the copy convention there too.
- `firstShow.ts:55` says run order drives the public scoreboard's Next Up list. The exercised public board exposes **Up Now**, not the detailed volunteer Next Up queue. Clarify which screen each statement describes.

## What passed, with limits

### Account gate and registration

- Anonymous `zt_submit_registration`: HTTP **401**, PostgreSQL **42501**, permission denied before the body. The private renamed body was denied to anonymous (**401**) and authenticated (**403**) callers, both **42501**.
- Authenticated wrapper reached ordinary validation. A real staging request under the test guardian account created a pending minor registration. Owner-only registration read confirmed guardian account `user_id`, test DOB and guardian fields. My Meets RPC returned that pending entry.
- Current local UI: Create account initially selected; athlete form absent until sign-in. Password sign-in stayed on the registration route without reloading; name and email prefilled and remained editable. Minor fields appeared. Waiver, review and submit completed with HTTP **200**, pending status.
- The age rules remain minimum 12 on meet day and guardian fields below 18 in both rules/009 source. The signup form's 13+ account rule is consistent only when younger athletes are registered from a guardian's account. No additional age-boundary live registrations were created.
- Per-IP throttle exercised: two successful registrations from this audit, then eight more valid fixture registrations; the next attempt returned **Too many attempts from this device**. The wrapper still calls the unchanged 009 body. The per-meet **60/10 minute** threshold was inspected in source, not exhausted live; no header spoofing, SQL counter edits or extra identities were used to bypass the IP cap.
- Guardian ownership is appropriate for this registration transaction. Keep guardian identity distinct from the athlete when public show history is implemented; this audit does not endorse attributing the child's performance to the guardian's public athlete profile.

### Publishing and volunteer permissions

- Signed out with a saved dummy legacy key: Publish disabled. No publish/promoter key input was present. The harness's broad substring search counted the **Keystone** meet-name placeholder as a key input; inspection of actual inputs resolved this false positive.
- Signed in: **Publishing as** appeared; **Forget** removed the saved key; UI publication of the isolated staging meet succeeded with HTTP **200** and `p_key=null`. No claim input appeared. The intentional old-key Forget sentence still contains the words **publish key** when a key is saved, an explicit exception to the brief's blanket rendered-text grep expectation.
- Scorer Sign in link worked, but stayed on Account afterward. It does not remember `/scorer`; include this return-navigation gap with HI-M1's shared return-flow fix. The meet was not lost from local storage.
- Server-role probes: code-only score insert denied; code plus valid judge grant inserted a fixture score. Pit-crew code-only rack-height edit succeeded. Rotating the join code made the old grant update affect **zero rows**, while the owner's authenticated update succeeded. The test grant was revoked.
- These were REST probes through the actual role credentials, not fresh end-to-end Join-role UI flows. No scoring-engine or production write signoff is implied.

### Guide, FAQ and public effects

- All ten guide steps and all eight promoter tabs inspected; 16 FAQ answers reviewed. Division and implement chips, event weights on registration, public roster names before scoring, per-station Up Now strips and the TV-table columns were observed. Accept/Decline and capacity behavior used the isolated meet, not the guide meet.
- Save Changes versus Save Listing Settings uses separate code paths as described. Builder dirty-work guards prevent Accept/Decline from discarding configuration. This audit inspected those paths and UI, but did not add another live save-fault/concurrency campaign.
- Production guide canonical: `https://www.zerotacky.com/how-it-works/first-show`. Nonempty title, lazy images with alt text, ten valid anchor targets, Back/FAQ/roadmap routes and 375 px no-overflow guide rendering checked. The registration form itself measured **381 px** on the older hosted UI; that is not a guide-page overflow claim.
- Rendered How It Works, Account and Join pages contained no publish/promoter key mentions. Scorer's intentional saved-key sentence is the exception above.
- Free-use pricing, payment handled by promoter, privacy links, opt-in athlete page, unlist/delete controls and gym claim/add flow matched the relevant UI/source in this scope. Manual claim verification/email follow-through is an operational promise, not a tested mail pipeline. No paid registration, day-pass purchase, trainer directory or public show-history feature was claimed as implemented.
- The brief's known omissions remain known: no video yet; unused screenshot; screenshot QR codes encode localhost; server still accepts `p_key`. These are not new findings.

## Cleanup and remaining validation

The disposable `astra-how-75d44283` meet was deleted through its owner-only delete RPC after exact ID/name/slug verification. It contained **10 test registrations**. Follow-up reads found zero rows in meets, divisions, events, athletes, results, live_state and registrations for that meet. The guide meet's public bundle was structurally equal to the pre-test JSON baseline, with **14 roster athletes**; no guide-meet writes were made. The dashboard displayed three pending entries during inspection, not the brief's two; this audit submitted only to the disposable slug.

Temporary session copies were removed during report packaging. Test-account profiles, passwords and production data were not changed. The staging registration IP bucket was deliberately exercised and is left to expire normally; no privileged counter reset was attempted.

Still required for closure: deploy the matching gate UI to the actual staging preview, retest the return-flow fixes there, and perform real confirmation/magic/reset email round trips. Production 021 remains Kurt's deployment decision, with a subsequent approved production enforcement check. Do not substitute local staging-backed results for those missing deployment/email checks.
