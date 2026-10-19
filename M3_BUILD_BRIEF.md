# ZeroTacky M3: Promoter dashboard on real data (brief for Argon, 2026-10-17)

## What you are getting and where it goes

This text bundle is the complete current source of the `v2` branch at commit `becaaab7`. It includes your promoter dashboard and
registration flow (first drop `b377c4ec`) with every finding from Astra's 10/16 audit fixed by Slate (dispositions in
`PROMOTER_NOTES.md` section 2), sign-in and profiles (`lib/auth/**`, `supabase/003_auth.sql`), 13 themes, and the backup script.
Start from this bundle, not from your own copy or any earlier zip. 176 tests pass, `tsc --noEmit` is clean.

Read first, in this order: `ROADMAP.md` (sections 1 to 4), `lib/promoter/contract.ts` (frozen for this sprint, see Ownership),
`supabase/001_schema.sql` and `003_auth.sql` (the live schema and its RLS style), `lib/sync/mapping.ts` and `lib/sync/meetApi.ts`
(how AppState already maps to rows and how publish works), `lib/auth/supabaseBrowser.ts` (the one supabase-js client),
`lib/promoter/fixtureApi.ts` (the behaviour your implementation must match; its tests in `test/promoter.test.mjs` and
`test/register.test.mjs` are the spec in executable form), `lib/website/data.ts` and `lib/website/types.ts` (the `/shows` seam).

## The job in one paragraph

Make `/promoter`, `/register/<slug>` and `/shows` run on Supabase instead of the in-memory fixture, without changing their
behaviour. Draft the migration (`supabase/004_listing.sql`: listing columns, a `registrations` table, RPCs, RLS); write a
`PromoterApi` implementation over supabase-js that satisfies `lib/promoter/contract.ts` exactly as `fixtureApi.ts` does; switch
`usePromoterApi.ts` and `lib/website/data.ts` to the real backend when the Supabase env vars are present and keep the fixtures
when they are not (the demo must keep working with no backend). Close three small loose ends on the website. Write tests you can
reason about without a runtime: put the Supabase calls behind a narrow interface and test your logic against an in-memory fake
of that interface.

## Ownership (hard boundaries)

**Yours (create or edit freely):**
- `supabase/004_listing.sql` (new; a draft. Slate applies it to staging and Astra reviews the RLS before it reaches prod)
- `lib/promoter/supabaseApi.ts` (new), `lib/promoter/db.ts` (new; the narrow interface and its supabase-js adapter), `lib/promoter/usePromoterApi.ts`
- `lib/website/data.ts` (switch to Supabase behind the existing function signatures), `lib/website/supabaseShows.ts` (new, if you want the mapping in its own file)
- `components/website/ShowDetailClient.tsx`, `components/website/WebsiteShell.tsx`, `components/website/WebsiteAccountChip.tsx` (new), `components/website/AccountClient.tsx` (only the "Where to next" block)
- `test/supabaseApi.test.mjs`, `test/shows.data.test.mjs` (new), `test/promoter.test.mjs` and `test/register.test.mjs` only if a shared helper needs to move
- `M3_NOTES.md` (new; what works, what is untested, every claim you could not verify, and section 4 = proposed contract changes)

**Read-only (import from them, do not deliver changes; propose changes in `M3_NOTES.md` section 4):**
- `lib/promoter/contract.ts` (Astra is auditing it in parallel; Slate reconciles both of you afterwards), `lib/promoter/fixtureApi.ts`, `lib/promoter/fixtures.ts`
- `lib/types.ts`, `lib/sync/**`, `lib/auth/**`, `hooks/**`, `components/setup/**`, `components/promoter/**`, `components/register/**`, `app/**`
- `supabase/001_schema.sql`, `002_station_labels.sql`, `003_auth.sql` (never edit a shipped migration; everything goes in `004`)
- `scripts/**`, `.env*`, `next.config.mjs`, `package.json` (no new dependencies; supabase-js 2.118 is already there)

## 1. Migration: `supabase/004_listing.sql`

Idempotent (`if not exists`, `drop policy if exists`, `create or replace`), re-runnable, same style as `003_auth.sql`. Contents:

1. **Listing columns on `meets`**, one per `MeetListing` field: `competition_status`, `registration_status`, `results_status`
   (text with check constraints matching the union types in `lib/website/types.ts`), `is_public_listed boolean default false`,
   `venue jsonb`, `federation text`, `entry_fee_display text`, `registration_deadline date`, `athlete_cap integer`
   (check `> 0`), `promoter_contact text`. Defaults must make an existing Phase 1 meet (the 10/24 meet) unlisted and closed.
2. **Public read of listings.** `meets` already has a column-level `grant select (...) to anon` in `001_schema.sql` line 249 and
   a `meets_read` policy. Extend the grant with the new public columns (`promoter_contact` is public by contract; `athlete_cap`
   and `registration_deadline` are needed by `/register`). `join_code`, `admin_pin`, `owner_id` stay ungranted. If you prefer
   a view (`zt_public_meets`) say why in the notes; either is acceptable, but `/shows` must only see rows with
   `is_public_listed = true` OR the caller's own meets, and the existing scoreboard (`/m/<slug>`, reads `meets` by slug for
   any meet) must keep working.
3. **`registrations` table**: `id uuid default gen_random_uuid()`, `meet_id uuid references meets on delete cascade`,
   `user_id uuid null references auth.users` (the athlete's account when signed in), `athlete_id text null` (the
   `athletes.id` created on accept; composite FK `(meet_id, athlete_id) -> athletes(meet_id, id) on delete set null`),
   `division_id text not null`, `name`, `email`, `bodyweight numeric null`, `emergency_contact text not null`,
   `status text` (check: pending / accepted / declined / withdrawn / waitlist, the exact set in the contract), `waitlisted
   boolean`, `waiver_accepted_at timestamptz`, `created_at`, `updated_at` (touch trigger like `profiles_touch`).
   RLS: anon and authenticated can **insert only through the RPC below**, never directly (`revoke insert`); select/update for
   the meet owner (`meets.owner_id = auth.uid()`) or a `meet_members` row; a signed-in athlete may select rows where
   `user_id = auth.uid()`; anon reads nothing. `emergency_contact` is never readable by anyone but the owner/member.
4. **RPCs** (security definer, `set search_path = public`, every check inside the function, same pattern as `zt_publish_meet`):
   - `zt_submit_registration(p_slug text, p_input jsonb) returns jsonb` -> `{id, status}`. Server-side re-implementation of
     `decideRegistrationOutcome` in `fixtureApi.ts` (status must be open or waitlist; deadline; cap vs accepted count ->
     waitlist or refuse); validation mirrors `validateRegistrationInput` and `validateEmergencyContact`. Stamps `user_id`
     from `auth.uid()` when present. Raises with errcode `P0001` and a message the client can show verbatim.
   - `zt_set_registration_status(p_id uuid, p_status text) returns jsonb` (owner/member only). Accept: division must still
     exist, creates the `athletes` row (`id = 'reg-ath-' || left(p_id::text, 8)`, `lot_number 0`, `status 'active'`) and stores
     `athlete_id`, all in one transaction. Decline/withdraw of an accepted request deletes exactly that `athlete_id` row and
     nulls the column; refuse if that athlete has rows in `results` (same rule as H3). Reopen -> pending.
   - `zt_save_meet_config(p_meet_id uuid, p_meet jsonb, p_divisions jsonb, p_events jsonb, p_athletes jsonb) returns jsonb`
     (owner/member only). Same upsert logic as `zt_publish_meet` for config and roster, **but raises instead of cascading**
     when a removed athlete, event or division owns rows in `results` (the server-side H3 guard). Does not touch `results`.
     Do not modify `zt_publish_meet`; the meet-day phones depend on its current behaviour.
   - `zt_rotate_join_code(p_meet_id uuid) returns jsonb` (owner/member only) -> `{joinCode}`. Reuse `gen_join_code()` from
     `001_schema.sql`; retry on unique violation.
   - `zt_create_meet(p_name text, p_date date, p_slug text) returns jsonb` (authenticated only): inserts the meet with
     `owner_id = auth.uid()`, a `meet_members` row, defaults for everything else, unlisted. Slug conflicts -> raise.
5. **Comments at the top**: what the migration assumes about `001` and `003`, and a checklist for Slate to verify after
   applying it to staging (one `select` per table/policy).

## 2. `lib/promoter/db.ts` and `lib/promoter/supabaseApi.ts`

- `db.ts` exports `interface PromoterDb` with one method per query or RPC you need (e.g. `selectMyMeets()`, `selectMeet(id)`,
  `selectChildren(meetId)`, `rpc(name, params)`, `selectRegistrations(meetId)`, `selectPublicMeetBySlug(slug)`, `getUser()`,
  `selectProfile(id)`, `updateProfile(...)`), returning plain row types (reuse `MeetRow`, `DivisionRow`, `EventRow`,
  `AthleteRow`, `ResultRow` from `lib/sync/mapping.ts`; add `RegistrationRow` and the listing columns on a `MeetListingRow`).
  Export `createSupabaseDb(client: SupabaseClient): PromoterDb` as the only place supabase-js is called. Keep it thin: no
  business logic in the adapter.
- `supabaseApi.ts` exports `createSupabasePromoterApi(db: PromoterDb): PromoterApi`. All mapping and rules live here:
  rows -> `PromoterMeetSummary` / `PromoterMeetDetail` (use `rowsToState` from `lib/sync/mapping.ts` for the `AppState`),
  `MeetListing` <-> listing columns, `RegistrationRow` <-> `RegistrationRequest` (never put `emergencyContact` into anything
  public), `toPublicRegistrationMeet` (exported from `fixtureApi.ts`; import it rather than re-implementing the allowlist). Every method returns the `ApiResult` shape; PostgREST and RPC errors become
  `{ ok: false, error: <message> }`, never a throw. `saveMeetState` calls `zt_save_meet_config` and then re-reads the meet
  (the contract returns the full detail). `getCurrentUser` reads the session plus the `profiles` row; `updateProfile` writes
  `profiles` (same columns as `lib/auth/profile.ts`).
- Counts: `athleteCount` = athletes rows, `pendingCount` = registrations with status pending, `registrationCount` = status
  accepted. Compute from the rows you already fetched; no extra round trips per meet in `listMyMeets` beyond one grouped
  query (PostgREST embedded counts are fine: `registrations(count)`).
- `usePromoterApi.ts`: `getSupabase()` non-null -> `createSupabasePromoterApi(createSupabaseDb(client))`, memoised; null ->
  the fixture as today. Export `isLiveBackend()` so the amber "data lives in this tab" banners can hide themselves when real.

## 3. `/shows` on real data: `lib/website/data.ts`

Keep the exported function signatures. When `getSupabase()` (or `readSyncEnv()` for server components; pick one and say
which, these functions run in both places today) is available, `listPublicShows` reads listed meets and maps them to
`PublicShowSummary`; `getPublicShowBySlug` maps one meet plus divisions, athletes and finalized standings
(`buildAllDivisionResultsViews` in `lib/website/standingsAdapter.ts` already turns a `PublicShowRecord` into
`DivisionResultsView[]`; reuse it). Fixture shows stay as the
fallback when there is no backend, and are appended with `isDemo: true` when there is one only if
`process.env.NEXT_PUBLIC_ZT_DEMO_SHOWS === '1'` (default off). Filters in `lib/website/filters.ts` must keep working on the
mapped rows; do not fork them.

## 4. Website loose ends

- `ShowDetailClient.tsx`: the placeholder "In-App Registration Status" button becomes a real link to `/register/<slug>` when
  `registrationStatus` is open or waitlist; otherwise a disabled button whose label is the status text. No other changes.
- `WebsiteAccountChip.tsx` (client): shows the signed-in display name (from `useAuth`) linking to `/website/account`, or
  "Sign in" when signed out; renders nothing until the session is known (no flash). Mount it in `WebsiteShell`'s header next
  to `WebsiteThemeControls`. It must not break server rendering of `WebsiteShell`.
- `AccountClient.tsx` "Where to next": add "Promoter dashboard -> /promoter" when `roles.promoter` is true. Nothing else in
  that file.

## 5. Tests (you cannot run them; design them so Slate can)

- `test/supabaseApi.test.mjs`: build `createSupabasePromoterApi(fakeDb)` where `fakeDb` is an in-memory `PromoterDb` seeded
  from the same fixtures the promoter tests use. Cover: list/detail mapping and the three counts; `saveMeetState` passing
  through to the RPC and surfacing its error; accept/decline mapping of `athleteId`; `getPublicMeetBySlug` output contains
  none of `joinCode`, `adminPin`, `emergencyContact`, `ownerId` (JSON.stringify search, same as the H1 test); every method
  returns `ok: false` with a message when the db throws; `usePromoterApi` picks the fixture when the client is null.
- `test/shows.data.test.mjs`: `listPublicShows` with a fake backend returns only listed meets; fixture fallback when the
  backend is absent; demo rows only with the env flag.
- Tests are `bun test` files (`import { test, expect } from 'bun:test'`), importing `.ts` directly as the existing ones do.
  Look at `test/promoter.test.mjs` for the pattern. Behaviour tests, not mirrors of the implementation (Astra checks this).

## 6. Environment facts you must respect

- Browser only ever has `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. No service-role key anywhere in the
  app, ever; every privilege boundary is RLS or a security-definer RPC.
- `meets.id` is a uuid and is the contract's `serverId`. Child tables use composite `(meet_id, id)` keys with text ids
  (`sf-g1` style) so a demo and a real meet can share child ids. `AppState.meet.id` is a local id; `lib/sync/controller.ts`
  maps local id to server uuid in `SyncLink`. The promoter dashboard always works in server uuids.
- Phase 1 phones keep publishing through `zt_publish_meet` with a key or a session; they do not know about listings. A meet
  published from a phone must appear in that promoter's `/promoter` list when they are signed in (`owner_id`), unlisted.
- `is_demo` meets (`001_schema.sql`) are never listed and never accept registrations.
- Dates are `YYYY-MM-DD` strings in the app; timestamps are ISO with offset.

## 7. Delivery format (this is the part that broke last time; follow it exactly)

Paste the prompt text Kurt gives you first; this bundle is the attachment it refers to. Then deliver:
- One fenced code block per file. The fence opens with ```tsx, ```ts, ```js, ```sql or ```text, then the two marker lines,
  then the whole file, then the END marker, then the closing fence. Nothing between fences but a blank line.
  ```ts
  ===== ZEROTACKY FILE BEGIN =====
  {"path": "lib/promoter/supabaseApi.ts", "encoding": "utf-8"}
  <entire file>
  ===== ZEROTACKY FILE END =====
  ```
- Markdown files use a ```text fence, not ```md (a ```md fence breaks when the file itself contains fences).
- No "bytes" or "sha256" fields. You cannot compute them; invented values cost us an hour.
- Deliver EVERY file you created or changed, whole, not diffs. `M3_NOTES.md` first, then `supabase/004_listing.sql`, then the
  rest. If the response is cut off, stop at a file boundary and Kurt will say "continue".
- Markdown survives the paste; TSX does not unless fenced. Unfenced code gets rendered as prose and loses its JSX.
