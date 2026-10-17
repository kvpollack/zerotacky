# M3_NOTES.md: Supabase Promoter API, Registration & Public Shows (2026-10-17)

## 1. Summary of What Was Built

1. **Migration (`supabase/005_listing.sql`)**:
   - Adds the 10 `MeetListing` columns to `meets` (`competition_status`, `registration_status`, `results_status`, `is_public_listed`, `venue`, `federation`, `entry_fee_display`, `registration_deadline`, `athlete_cap`, `promoter_contact`) with check constraints matching `lib/website/types.ts` and defaults (`upcoming`, `closed`, `not_started`, `is_public_listed = false`) so existing Phase 1 meets (the 10/24 meet) start unlisted and closed.
   - Extends the column-level `grant select` on `meets` to `anon, authenticated` with the 10 new listing columns while keeping `join_code`, `admin_pin`, and `owner_id` ungranted.
   - Creates `registrations` (`id`, `meet_id`, `user_id`, `athlete_id`, `division_id`, `name`, `email`, `bodyweight`, `emergency_contact`, `status`, `waitlisted`, `paid`, `waiver_accepted_at`, `created_at`, `updated_at`) with composite foreign key `(meet_id, athlete_id) -> athletes(meet_id, id) on delete set null`, composite foreign key `(meet_id, division_id) -> divisions(meet_id, id) on delete restrict`, and a `registrations_touch` `updated_at` trigger.
   - Configures RLS on `registrations`: revokes direct `insert` and `delete` from `anon, authenticated` (inserts happen only via `zt_submit_registration`); revokes blanket `select` and grants column-level `select` without `emergency_contact` to `authenticated` so a signed-in athlete reading their own row (`user_id = auth.uid()`) can never read `emergency_contact` via PostgREST, while owners/members read full registration rows (including `emergency_contact`) and owner-only `meets` columns (`join_code`, `admin_pin`) through security-definer RPCs (`zt_list_meet_registrations`, `zt_my_meets`, `zt_get_my_meet`).
   - Implements the five required security-definer RPCs (`set search_path = public`, `P0001` exceptions with client-ready messages):
     - `zt_submit_registration(p_slug, p_input)`: enforces `not is_demo`, `registration_status in ('open', 'waitlist')`, deadline vs `current_date`, `athlete_cap` vs current `athletes` count, input validation (name, email, emergency contact >= 2 letters and >= 7 digits, division existence, waiver acceptance), and duplicate active/pending email+division check; stamps `user_id = auth.uid()` and returns `{id, status}`.
     - `zt_set_registration_status(p_id, p_status)`: owner/member only; on `accepted`, verifies division exists, creates `athletes` row `reg-ath-<left(id,8)>` with the next lot number in that division (`coalesce(max(lot_number), 0) + 1`, `status = 'active'`) and links `athlete_id`; on `declined`/`withdrawn`/`pending`, checks if the linked athlete has rows in `results` (raising `P0001` naming the athlete and events if so) and otherwise deletes that exact `athletes` row and nulls `athlete_id`.
     - `zt_save_meet_config(p_meet_id, p_meet, p_divisions, p_events, p_athletes)`: owner/member only; validates meet name, slug uniqueness, `date >= registration_deadline`, and the server-side H3 orphan guard (raises `P0001` naming the athlete and event, or event, if any removed athlete, event, or division has rows in `results`); upserts config and roster without touching `results`.
     - `zt_rotate_join_code(p_meet_id)`: owner/member only; generates a fresh 6-char code via `gen_join_code()` (retrying on unique violation or collision with the previous code) and returns `{joinCode}`.
     - `zt_create_meet(p_name, p_date, p_slug)`: authenticated only; validates name, date, and slug uniqueness, inserts an unlisted meet with `owner_id = auth.uid()` and a `meet_members` owner row, and returns the created meet row.

2. **Promoter Database Adapter & API (`lib/promoter/db.ts`, `lib/promoter/supabaseApi.ts`, `lib/promoter/usePromoterApi.ts`)**:
   - `db.ts` defines the narrow `PromoterDb` interface, `MeetListingRow`, `PromoterMeetRow`, `PublicMeetBundle`, and `RegistrationRow`, plus `createSupabaseDb(client: SupabaseClient)`.
   - `supabaseApi.ts` implements `createSupabasePromoterApi(db: PromoterDb): PromoterApi`. Uses `rowsToState` and `stateToRows` from `lib/sync/mapping.ts` and `toPublicRegistrationMeet`, `validateListingPatch`, `findOrphanedResult`, `validateRegistrationInput`, and `decideRegistrationOutcome` from `lib/promoter/fixtureApi.ts`. Computes `athleteCount`, `pendingCount`, and `registrationCount` without N+1 queries. Wraps all thrown DB/PostgREST errors into `{ data: null, error: message }`.
   - `usePromoterApi.ts` returns a memoised `createSupabasePromoterApi(createSupabaseDb(client))` when `getSupabase()` is non-null and falls back to `getFixturePromoterApi()` when null. Also exports `getPromoterApi()` for non-hook callers and `isLiveBackend()`.

3. **Public `/shows` on Supabase (`lib/website/supabaseShows.ts`, `lib/website/data.ts`)**:
   - `data.ts` uses `readSyncEnv()` and `createSyncClient(env)` so `listPublicShows` and `getPublicShowBySlug` work identically in Server Components (`/website`, `/shows`, `/shows/[slug]`) and in the browser.
   - When `readSyncEnv()` is null (or `{ mode: 'demo' }` is passed explicitly), `listPublicShows` and `getPublicShowBySlug` return the in-memory `DEMO_SHOW_RECORDS` fixtures so offline/demo builds keep working.
   - When `readSyncEnv()` is present, `listPublicShows` queries `meets` with `is_public_listed=eq.true&is_demo=eq.false` (plus divisions and events in batched queries) and maps them to `PublicShowSummary[]`. If `process.env.NEXT_PUBLIC_ZT_DEMO_SHOWS === '1'`, demo fixtures are appended with `isDemoFixture: true` (default off).
   - `getPublicShowBySlug` queries the listed non-demo meet by slug (plus its divisions, events, athletes, and results), strips private athlete fields (`bodyweight`, `rackHeights`), and maps to `PublicShowRecord` so `buildAllDivisionResultsViews` in `lib/website/standingsAdapter.ts` and `filterPublicShows` in `lib/website/filters.ts` work unchanged.

4. **Website Loose Ends (`ShowDetailClient.tsx`, `WebsiteAccountChip.tsx`, `WebsiteShell.tsx`, `AccountClient.tsx`)**:
   - `ShowDetailClient.tsx`: when no `externalRegistrationUrl` is set, renders a `<Link href={`/register/${show.slug}`}>` when `show.registrationStatus` is `'open'` or `'waitlist'`, and a disabled `<button disabled>` showing `life.registrationLabel` otherwise.
   - `WebsiteAccountChip.tsx`: client component reading `useAuth()`. Renders `null` while `auth.loading` is true (no flash), a link to `/website/account` showing `profileLabel(auth.profile, auth.user.email)` when signed in, or a `"Sign in"` link to `/website/account` when signed out. Mounted in `WebsiteShell.tsx` next to `WebsiteThemeControls`.
   - `AccountClient.tsx`: adds a `"Promoter dashboard"` link to `/promoter` in the `"Where to next"` block when `promoter` (`roles.promoter`) is true.

## 2. What Was Verified vs. What Is Untested

- **Cannot run in Argon's environment**: I have no shell, TypeScript compiler, Bun test runner, or browser runtime. Neither `tsc --noEmit`, `bun test`, nor staging SQL execution was run here; Slate must run all three.
- **Covered by unit tests designed for `bun test`**:
  - `test/supabaseApi.test.mjs`: tests `createSupabasePromoterApi(fakeDb)` seeded from `createSeedMeets()` and `createSeedRegistrations()`, covering `listMyMeets` / `getMeet` mapping and the 3 counts (`athleteCount`, `pendingCount`, `registrationCount`), `saveMeetState` passing through to `zt_save_meet_config` and surfacing H3 orphan errors, `setRegistrationStatus` accept/decline `athleteId` mapping and scored-athlete refusal, `getPublicMeetBySlug` H1 allowlist and `JSON.stringify` leak check (`joinCode`, `adminPin`, `emergencyContact`, `ownerId`, `results`), error conversion (`{ data: null, error }`) across every `PromoterApi` method when `PromoterDb` throws, and `usePromoterApi` / `getPromoterApi` fixture fallback when Supabase env is absent.
  - `test/shows.data.test.mjs`: tests `listPublicShows` and `getPublicShowBySlug` with an injected fake fetch client, verifying that only `is_public_listed = true` and `is_demo = false` meets are returned, that `filterPublicShows` and `buildAllDivisionResultsViews` work on mapped rows, that missing env falls back to `DEMO_SHOW_RECORDS`, and that `NEXT_PUBLIC_ZT_DEMO_SHOWS === '1'` appends demo rows with `isDemoFixture: true`.

## 3. Why `meets` Uses Column-Level Grants + Helper RPCs Instead of a Separate View for `/shows`

`001_schema.sql` already uses column-level `grant select (...) on meets to anon, authenticated` with `create policy meets_read on meets for select using (true)` so the live scoreboard (`/m/<slug>`) can read any meet by slug without a join code or session. Replacing `meets_read` with `using (is_public_listed = true)` would break `/m/<slug>` for unlisted meets (including the 10/24 meet). Instead:
- `005_listing.sql` extends the column-level `grant select` on `meets` with the 10 public listing columns (`competition_status`, `registration_status`, `results_status`, `is_public_listed`, `venue`, `federation`, `entry_fee_display`, `registration_deadline`, `athlete_cap`, `promoter_contact`) while keeping `join_code`, `admin_pin`, and `owner_id` ungranted.
- `/shows` (`lib/website/data.ts`) explicitly filters `is_public_listed=eq.true&is_demo=eq.false` (and a companion view `zt_public_meets` is also created in `005_listing.sql` with `where is_public_listed = true and is_demo = false` so any caller or audit query can select from it directly).
- Owner-only columns (`join_code`, `admin_pin`, `owner_id`) stay completely ungranted from PostgREST table selects and are returned to the owner/member exclusively through the security-definer RPCs `zt_my_meets()` and `zt_get_my_meet(p_meet_id)`.

## 4. Proposed Contract Changes & Read-Only Component Wiring Snippets (For Slate)

### 4A. Proposed `lib/promoter/contract.ts` Additions

No breaking changes are needed in `lib/promoter/contract.ts`. Two optional additive improvements for M4:
1. **`RegistrationSubmission.bodyweight?: number | null`**: `registrations.bodyweight` exists in `005_listing.sql` (and `zt_submit_registration` reads `(p_input->>'bodyweight')::numeric` when supplied), so adding `bodyweight?: number | null` to `RegistrationSubmission` and `RegistrationRequest` will let weight-class meets optionally collect bodyweight at registration time.
2. **`PromoterApi.withdrawMyRegistration?(registrationId: string): Promise<ApiResult<{ ok: true }>>`**: for signed-in athletes on `/website/account` to self-withdraw a pending registration where `user_id = auth.uid()`.

### 4B. Exact Wiring Snippets in Read-Only Files (`components/register/**` & `components/promoter/**`)

Because `components/register/RegisterClient.tsx`, `components/promoter/PromoterDashboardClient.tsx`, `components/promoter/PromoterMeetDetailClient.tsx`, `components/promoter/ListingSection.tsx`, and `components/promoter/MeetDaySection.tsx` are read-only in this sprint, apply the following exact replacements to switch `RegisterClient` onto the live backend and hide the preview-only hooks/banners when `isLiveBackend()` is true.

#### 1. `components/register/RegisterClient.tsx` — Import `getPromoterApi` and `isLiveBackend`
- **File path**: `components/register/RegisterClient.tsx`
- **Current lines (lines 16–20)**:
```tsx
import {
  decideRegistrationOutcome,
  getFixturePromoterApi,
  isRegistrationOpen,
  validateRegistrationInput,
} from '@/lib/promoter/fixtureApi';


Replacement:

TypeScript
import {
  decideRegistrationOutcome,
  isRegistrationOpen,
  validateRegistrationInput,
} from '@/lib/promoter/fixtureApi';
import { getPromoterApi, isLiveBackend } from '@/lib/promoter/usePromoterApi';


Why: Imports getPromoterApi and isLiveBackend so the registration page talks to Supabase when configured and knows whether to hide the preview-only notices.

2. components/register/RegisterClient.tsx — Initial getPublicMeetBySlug lookup (line 58)

File path: components/register/RegisterClient.tsx

Current lines (lines 58–59):

TypeScript
    getFixturePromoterApi()
      .getPublicMeetBySlug(slug)


Replacement:

TypeScript
    getPromoterApi()
      .getPublicMeetBySlug(slug)


Why: Loads the public registration meet from Supabase when env vars are configured instead of always reading the in-memory fixture.

3. components/register/RegisterClient.tsx — submitRegistration and post-submit refresh (lines 184 & 202)

File path: components/register/RegisterClient.tsx

Current lines (lines 184–203):

TypeScript
    const res = await getFixturePromoterApi().submitRegistration({
      slug: meet.slug,
      divisionId,
      athleteName,
      email,
      emergencyContact,
      waiverAccepted: true,
    });
    setSubmitting(false);

    if (res.error || !res.data) {
      setError(res.error ?? 'Could not submit registration.');
      return;
    }

    setSubmitted(res.data);
    setStep(4);
    // Refresh the public shape so the capacity line reflects the new entry.
    const refreshed = await getFixturePromoterApi().getPublicMeetBySlug(meet.slug);
    if (refreshed.data) setMeet(refreshed.data);


Replacement:

TypeScript
    const res = await getPromoterApi().submitRegistration({
      slug: meet.slug,
      divisionId,
      athleteName,
      email,
      emergencyContact,
      waiverAccepted: true,
    });
    setSubmitting(false);

    if (res.error || !res.data) {
      setError(res.error ?? 'Could not submit registration.');
      return;
    }

    setSubmitted(res.data);
    setStep(4);
    // Refresh the public shape so the capacity line reflects the new entry.
    const refreshed = await getPromoterApi().getPublicMeetBySlug(meet.slug);
    if (refreshed.data) setMeet(refreshed.data);


Why: Submits the athlete's registration through zt_submit_registration on Supabase and re-reads the updated capacity count from the live backend.

4. components/register/RegisterClient.tsx — Top amber preview banner & Step 4 confirmation amber banner + link (lines 283–285, 582–584, 603–608)

File path: components/register/RegisterClient.tsx

Current lines (lines 283–285):

TypeScript
      <p className="text-[11px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/40 rounded-xl px-3 py-2">
        {PREVIEW_NOTICE}
      </p>


Replacement:

TypeScript
      {!isLiveBackend() && (
        <p className="text-[11px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/40 rounded-xl px-3 py-2">
          {PREVIEW_NOTICE}
        </p>
      )}


And current lines in Step 4 confirmation (lines 582–584 & 603–608):

TypeScript
              <p className="text-xs font-bold text-amber-300 bg-amber-500/10 border border-amber-500/40 rounded-xl px-3 py-2">
                {PREVIEW_NOTICE}
              </p>


and

TypeScript
                <Link className="px-4 py-2.5 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase" href="/promoter">
                  Open the preview dashboard (same tab)
                </Link>


Replacement:

TypeScript
              {!isLiveBackend() && (
                <p className="text-xs font-bold text-amber-300 bg-amber-500/10 border border-amber-500/40 rounded-xl px-3 py-2">
                  {PREVIEW_NOTICE}
                </p>
              )}


and

TypeScript
                {!isLiveBackend() && (
                  <Link className="px-4 py-2.5 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase" href="/promoter">
                    Open the preview dashboard (same tab)
                  </Link>
                )}


Why: Hides the "stored in this browser tab only" warning and the demo-only "Open the preview dashboard" button when registrations are being saved to Supabase.

5. components/promoter/PromoterDashboardClient.tsx — Dev ?signedout=1 hook, signed-out exit button, "Preview Signed-Out" button, amber banner, and "(preview)" badge labels (lines 17–18, 44–49, 165–170, 195–198, 212–218, 377–387)

File path: components/promoter/PromoterDashboardClient.tsx

Current lines (lines 17–18):

TypeScript
import { getFixturePromoterApi } from '@/lib/promoter/fixtureApi';
import { usePromoterApi } from '@/lib/promoter/usePromoterApi';


Replacement:

TypeScript
import { getFixturePromoterApi } from '@/lib/promoter/fixtureApi';
import { isLiveBackend, usePromoterApi } from '@/lib/promoter/usePromoterApi';


Current lines (lines 44–49):

TypeScript
    // Dev-only query param handler (?signedout=1) to verify the signed-out state
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const isSignedOutParam = params.get('signedout') === '1';
      getFixturePromoterApi().setSignedOutForDev(isSignedOutParam);
    }


Replacement:

TypeScript
    // Dev-only query param handler (?signedout=1) only applies when running on the in-memory fixture backend.
    if (typeof window !== 'undefined' && !isLiveBackend()) {
      const params = new URLSearchParams(window.location.search);
      const isSignedOutParam = params.get('signedout') === '1';
      getFixturePromoterApi().setSignedOutForDev(isSignedOutParam);
    }


Current lines (lines 165–170):

TypeScript
          <a
            href="/promoter"
            className="px-4 py-3 rounded-xl bg-zt-inset border border-zt-border text-zt-text-2 font-bold text-xs uppercase hover:text-zt-text"
          >
            Exit Signed-Out Preview
          </a>


Replacement:

TypeScript
          {!isLiveBackend() && (
            <a
              href="/promoter"
              className="px-4 py-3 rounded-xl bg-zt-inset border border-zt-border text-zt-text-2 font-bold text-xs uppercase hover:text-zt-text"
            >
              Exit Signed-Out Preview
            </a>
          )}


Current lines (lines 195–198 & 212–218):

TypeScript
          <p className="text-[11px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/40 rounded-xl px-3 py-2 max-w-2xl">
            Preview: everything on this dashboard lives in this browser tab only, resets on reload, and no entry here
            is real. The live backend connects in a later milestone.
          </p>


and

TypeScript
          <a
            href="/promoter?signedout=1"
            className="px-3 py-3 rounded-xl bg-zt-inset border border-zt-border text-zt-muted hover:text-zt-text font-bold text-[11px] uppercase"
            title="Dev preview of the signed-out state"
          >
            Preview Signed-Out
          </a>


Replacement:

TypeScript
          {!isLiveBackend() && (
            <p className="text-[11px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/40 rounded-xl px-3 py-2 max-w-2xl">
              Preview: everything on this dashboard lives in this browser tab only, resets on reload, and no entry here
              is real. The live backend connects in a later milestone.
            </p>
          )}


and

TypeScript
          {!isLiveBackend() && (
            <a
              href="/promoter?signedout=1"
              className="px-3 py-3 rounded-xl bg-zt-inset border border-zt-border text-zt-muted hover:text-zt-text font-bold text-[11px] uppercase"
              title="Dev preview of the signed-out state"
            >
              Preview Signed-Out
            </a>
          )}


Current lines (lines 377–387):

TypeScript
                      {m.listing.isPublicListed ? (
                        <>
                          <Eye aria-hidden="true" className="w-3 h-3"/>
                          Listed (preview)
                        </>
                      ) : (
                        <>
                          <EyeOff aria-hidden="true" className="w-3 h-3"/>
                          Unlisted (preview)
                        </>
                      )}


Replacement:

TypeScript
                      {m.listing.isPublicListed ? (
                        <>
                          <Eye aria-hidden="true" className="w-3 h-3"/>
                          {isLiveBackend() ? 'Listed' : 'Listed (preview)'}
                        </>
                      ) : (
                        <>
                          <EyeOff aria-hidden="true" className="w-3 h-3"/>
                          {isLiveBackend() ? 'Unlisted' : 'Unlisted (preview)'}
                        </>
                      )}


Why: When the backend is live, real Supabase Auth owns the session (so ?signedout=1 and the "Preview Signed-Out" / "Exit Signed-Out Preview" buttons should be inactive/hidden), the amber fixture warning is hidden, and listing badges drop the (preview) suffix.

6. components/promoter/PromoterMeetDetailClient.tsx — Amber preview banner and "(preview)" badge labels (lines 41, 444–454, 462–465)

File path: components/promoter/PromoterMeetDetailClient.tsx

Current line (line 41):

TypeScript
import { usePromoterApi } from '@/lib/promoter/usePromoterApi';


Replacement:

TypeScript
import { isLiveBackend, usePromoterApi } from '@/lib/promoter/usePromoterApi';


Current lines (lines 444–454 & 462–465):

TypeScript
              {summary.listing.isPublicListed ? (
                <>
                  <Eye aria-hidden="true" className="w-3 h-3"/>
                  Listed (preview)
                </>
              ) : (
                <>
                  <EyeOff aria-hidden="true" className="w-3 h-3"/>
                  Unlisted (preview)
                </>
              )}


and

TypeScript
        <p className="text-[11px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/40 rounded-xl px-3 py-2">
          Preview: this meet&apos;s data lives in this browser tab only, resets on reload, and nothing here is a real
          entry or a live meet. The live backend connects in a later milestone.
        </p>


Replacement:

TypeScript
              {summary.listing.isPublicListed ? (
                <>
                  <Eye aria-hidden="true" className="w-3 h-3"/>
                  {isLiveBackend() ? 'Listed' : 'Listed (preview)'}
                </>
              ) : (
                <>
                  <EyeOff aria-hidden="true" className="w-3 h-3"/>
                  {isLiveBackend() ? 'Unlisted' : 'Unlisted (preview)'}
                </>
              )}


and

TypeScript
        {!isLiveBackend() && (
          <p className="text-[11px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/40 rounded-xl px-3 py-2">
            Preview: this meet&apos;s data lives in this browser tab only, resets on reload, and nothing here is a real
            entry or a live meet. The live backend connects in a later milestone.
          </p>
        )}


Why: Hides the in-memory tab warning and drops (preview) from the visibility pill on /promoter/[serverId] when backed by Supabase.

7. components/promoter/ListingSection.tsx & components/promoter/MeetDaySection.tsx — Additional preview copy call sites (optional polish)

File path: components/promoter/ListingSection.tsx (lines 125, 139–142) and components/promoter/MeetDaySection.tsx (lines 72–75, 98–101)

Observation: ListingSection.tsx says "Listing settings saved (preview data, this browser tab only)." on save (line 125) and "Saving here updates this browser tab only..." in its subheader (lines 139–142); MeetDaySection.tsx says "The join code shown here is fixture data..." (lines 72–75) and "Rotate generates a new 6-character code in this preview (this browser tab only)..." (lines 98–101). Gating those strings on isLiveBackend() (from @/lib/promoter/usePromoterApi) will make the tab copy match the live backend state.



<!-- Slate 10/17: recovered from the Gemini thread via browser text because the download truncated at the first inner code fence; the fences inside section 4B were lost in that transfer, the content is intact. -->

---

## 5. Slate's changes to this drop (10/17, after install)

Installed as delivered, then edited. Everything below is in `v2`, tsc clean, `bun test test/`: 193 pass, 0 fail across 15 files. Browser pass on `:3079` against staging is in `PROMOTER_NOTES.md` section 4.

**Wiring (section 4B, applied with two deviations).** `RegisterClient`, `PromoterDashboardClient`, `PromoterMeetDetailClient` now call `getPromoterApi()` / `isLiveBackend()` and hide the preview banners, dev buttons and "(preview)" badges when live, as written above. Deviations: (1) the pure helpers (`validateRegistrationInput`, `decideRegistrationOutcome`, `isRegistrationOpen`, `isMeetStateDirty`, `findOrphanedResult`, `validateListingPatch`, `toPublicRegistrationMeet`) moved to `lib/promoter/rules.ts`; `fixtureApi.ts` re-exports them, components import from `rules`, so no component imports `fixtureApi` any more. (2) `usePromoterApi.ts` no longer imports `fixtureApi` statically: when no Supabase env is configured it returns a forwarding wrapper that `import()`s the fixture module on first call, so the demo meets and seeded registrations (emails, emergency contacts) are a separate chunk a live deployment never ships (Astra H1). The dashboard's `?signedout=1` hook goes through `setFixtureSignedOutForDev()` from the same file. Item 7 (ListingSection / MeetDaySection copy) done too, including the rotation copy: every write from a volunteer phone re-checks the current join code (`zt_has_join`), so rotating locks out every phone that joined with the old code, including an admin phone that published with it; only a phone signed in to the account is unaffected.

**Migration numbering.** Your `004_listing.sql` is `supabase/005_listing.sql`; `004_result_guard.sql` is the delete trigger shared with `main`/prod (Astra A3), `006_ownership.sql` is the ownership/claim fix (Astra A1, A2). Edits inside 005 are marked `[Slate]`: no direct `UPDATE` grant on `registrations` and no `registrations_update_owner` policy (C2: a PATCH to `status=accepted` would skip the athlete creation); accept refuses at `athlete_cap` (C4); `waiver_version` column, required by `zt_submit_registration` and returned by `zt_list_meet_registrations` (C6); `zt_save_meet_config` gained `p_expected_updated_at` (C3: refused when `meets.updated_at` moved) and refuses removing an athlete linked to an accepted registration (M9); `zt_submit_registration` no longer bumps `meets.updated_at` (a pending request is not a config change, and bumping would fail every open editor's next save).

**`lib/promoter/supabaseApi.ts`.** `rowToRegistrationRequest` maps `waiver_version`; `submitRegistration` forwards `waiverVersion` in `p_input` (the browser pass caught that it was dropped: the RPC refused with "waiver version is missing"); `saveMeetState(serverId, state, opts)` passes `p_expected_updated_at` and pre-checks it. `lib/promoter/db.ts`: `RegistrationRow.waiver_version`.

**Pages.** `app/shows/page.tsx`: `revalidate = 60`, badge reads "N Listed Shows" when live (amber "Demo Directory Fixtures" only on the fixture source); `app/shows/[slug]/page.tsx`: `revalidate = 60`. `app/register/[slug]/page.tsx` computes `waiverVersion` (`lib/promoter/waiverVersion.ts`, first 12 hex of sha-256 over `legal/WAIVER.md`, server only) and passes it to `RegisterClient`, which refuses to submit without it. Note: the hash is over the file as deployed; a CRLF checkout and an LF deploy produce different versions for the same text.

**Tests.** `test/supabaseApi.test.mjs`: 7 tests (fake db mirrors C3, C6, M9; H1 lazy wrapper); `test/controller.test.mjs`: 7 new tests (32 total) for the sign-out behaviour (`lib/sync/controller.ts`, Astra A4). `test/promoter.test.mjs`, `test/register.test.mjs` updated for `waiverVersion`.

