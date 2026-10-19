# Audit request: ZeroTacky v2, fix-round verification + M3 pre-read (2026-10-17)

You are auditing, not fixing. Produce a findings list; do not edit files, do not run SQL, do not point anything at production. Slate (the integrator) acts on your report.

## Where the code is
- Working copy: `C:\Users\kpollack\.aki\aki_workspace\zerotacky-v2\` (branch `v2` of `kvpollack/zerotacky`, HEAD `becaaab7`). Read it from disk.
- Dev server for this copy: `http://localhost:3079` (Next 16, webpack mode), pointed at the **staging** Supabase project `hryiqiopkihkcrkdyllg`. Production is `kagitbfthapxmaljsdtz` and lives in `..\zerotacky\.env.local`; do not touch it.
- Public preview of the same branch, also on staging, no login wall: `https://zerotacky-git-v2-kvpollack-6654.vercel.app`. Use it for the browser pass in part 4 (localhost works too).
- Verify before you start: `cd zerotacky-v2 && ./node_modules/.bin/tsc.exe --noEmit -p tsconfig.json` (expect clean) and `bun test test/` (expect 176 pass across 13 files). Note: `bun`, not Node; `next build` does not work on this machine.

## Background
Your 10/16 report (`audits/astra-2026-10-16-promoter.md`: 3 HIGH, 19 MED, 4 LOW) was on Argon's promoter/registration drop at `b377c4ec`. Argon failed mid-way through the fix round, so Slate executed all 26 findings directly. The per-finding dispositions are in `PROMOTER_NOTES.md` section 2 (HIGH, MED, LOW blocks; L4, the arena-tv ratio, is covered under M18). Commits since your report: `018250b3` (your report filed), `943980f5` (contract + API + tests), `d6ad4b94` (UI + docs), `17a2ab39` (themes), `475a5260` (`scripts/dump_meet.py`), `becaaab7` (ROADMAP only).

The next sprint (M3) replaces the in-memory `PromoterApi` with a Supabase implementation written against `lib/promoter/contract.ts`, with a migration and RLS. Anything wrong in the contract or the auth layer gets copied into SQL next week, which is why parts 2 and 3 are in this audit.

## What to check

### 1. Re-verify the 26 findings (do this first)
For each line of your 10/16 table, read the disposition in `PROMOTER_NOTES.md` section 2 and the code, and give a verdict: **fixed / partial / not fixed / regressed**, with file:line evidence for anything other than fixed. HIGHs first:
- H1 credentials in the public registration payload: `app/register/[slug]/page.tsx`, `components/register/RegisterClient.tsx`, `toPublicRegistrationMeet` in `lib/promoter/fixtureApi.ts`, `PublicRegistrationMeet` in `lib/promoter/contract.ts`. Confirm by rendering `/register/<slug>` and searching the HTML and the client state for `joinCode`, `adminPin`, `emergencyContact`, `publishKey`.
- H2 roster matching by name: `RegistrationRequest.athleteId`, accept/decline/withdraw/reopen paths in `fixtureApi.ts`; the two-same-name test in `test/promoter.test.mjs`.
- H3 orphaned results on save: `findOrphanedResult` and its call in `saveMeetState`; try to defeat it (rename an id, delete a division that owns scored athletes, delete an event with results, save with an empty `athletes` array).
Then M1 to M19 and L1 to L4. Do not re-audit the MED/LOW surface beyond the verdicts unless you see a regression.

### 2. The contract as M3's spec: `lib/promoter/contract.ts`
Read it as the thing a Supabase/PostgREST implementation will be written against, by a model with no runtime. Report:
- Any field in a public-facing type (`PublicRegistrationMeet`, `MeetListing` as consumed by `/shows`) that is server-only or sensitive.
- For every method: who may call it (anonymous athlete, signed-in promoter who owns the meet, signed-in non-member, meet member via join code) and whether the contract or the comments say so. Flag methods where the authorization boundary is implied but unstated, especially `getPublicMeetBySlug`, `submitRegistration`, `setRegistrationStatus`, `updateListing`, `rotateJoinCode`, `saveMeetState`.
- Anything a real backend cannot honor atomically (e.g. `saveMeetState` returning the full detail, accept creating an athlete row and updating the request in one `ApiResult`), and what the contract should say about partial failure.
- Type mismatches with the live schema (`supabase/001_schema.sql`, `003_auth.sql`): ids (`serverId` vs `meets.id` uuid vs child `(meet_id, id)` text keys), timestamps, `AppState` shapes that have no column yet (listing fields, registrations). List the columns/tables M3's migration must add; name conflicts with what `ROADMAP.md` M3 proposes.

### 3. Auth surface (Slate's code, not yet audited)
Files: `lib/auth/supabaseBrowser.ts`, `lib/auth/useAuth.ts`, `lib/auth/profile.ts`, `supabase/003_auth.sql`, `lib/sync/client.ts` (`withAccessToken`), `lib/sync/controller.ts` (`setAccessToken`), `hooks/useMeetSync.js`, `components/website/AccountClient.tsx`, `components/setup/SyncPanel.jsx`, and the `p_key is null` path in `zt_publish_meet` as amended by `003_auth.sql`. Check:
- RLS on `profiles`: can a signed-in user read or write another user's row? Can anon?
- RLS on `meets`, `meet_members`, children: what a signed-in **non-member** can do that anon cannot; whether `owner_id` can be set or changed by the client; whether the authenticated publish path can claim an existing meet by slug that someone else owns (same-slug-updates-in-place was designed for Phase 1 keys).
- Token handling: the user JWT reaches `SyncController` via a ref; does sign-out clear it everywhere (controller, queued writes, in-flight polls)? Does a refreshed token replace a stale one before the next push? Is the token or session ever written to localStorage beyond Supabase's own `zt-auth-v1` key?
- `emailRedirectTo` / `accountRedirectUrl()`: open-redirect or hash-handling issues on `/website/account` (auth errors arrive in the URL hash).
- Magic-link and sign-up flows cannot be completed end to end (no mailbox); say what you could and could not exercise.

### 4. Browser pass (preview URL or localhost:3079)
Fixture data lives in the browser tab and resets on reload; an amber banner says so. Click through:
- `/promoter` then a meet: tabs with Left/Right/Home/End, `aria-selected` follows focus, panels stay mounted (type in a Listing field, switch tabs, come back).
- Listing dirty bar: edit a field, confirm the sticky bar appears, Save clears it, Discard restores the value; with builder edits pending, Accept/Decline on Registrations are disabled with the explanatory text.
- `/register/<slug>` for an open, a waitlist and a closed meet (slugs in `lib/promoter/fixtures.ts`): division radiogroup keyboard handling, validation messages, confirmation page content, and that nothing owner-only shows.
- `/website/account` on staging: password sign-up with a throwaway address is fine (Slate will delete the row); confirm the `profiles` row appears and roles save. Do not use magic link (no SMTP yet).

## Report format
Part 1: your 10/16 table with a Verdict column added, HIGHs first, one line per finding, evidence only where the verdict is not "fixed". Parts 2 to 4: `SEVERITY (HIGH/MED/LOW) | file:line | what | why it matters | suggested fix (one sentence)`. Then a short list of claims from `PROMOTER_NOTES.md` sections 1 and 2 you verified as true. Keep opinions out; label style preferences STYLE and put them last. Save the report as `audits/astra-2026-10-17-fixround.md` in the working copy if you can write there; otherwise return it in chat.
