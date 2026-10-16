# ZeroTacky Public Website Skeleton — Handoff Notes for Slate & Kurt

Date: 2026-10-16

## 1. Route & Component Map

All existing routes (`/`, `/join`, `/m/[slug]`), engine logic, sync controllers, presets, hooks, and tests remain 100% untouched.

| Route / File | Type | Purpose |
| :--- | :--- | :--- |
| `app/website/page.tsx` | Server Page | Public landing page (`Find a Show` -> `/shows`, `Run a Meet` -> `/`, secondary `Strongman Gym Directory` -> `/gyms`) |
| `app/shows/page.tsx` | Server Page | Show discovery container loading fixtures via `lib/website/data.ts` |
| `components/website/ShowsBrowser.tsx` | Client Component | Search & structured filters (Competition Status, State, Implement Tag, Federation, Division/Group query, Reset Filters) |
| `app/shows/[slug]/page.tsx` | Server Page | Dynamic metadata (`generateMetadata`) + server lookup for persistent show URLs |
| `components/website/ShowDetailClient.tsx` | Client Component | Lifecycle-aware show view (`upcoming`, `live`, `completed` provisional vs. final, `postponed`, `cancelled`), division podiums, event-by-event scoreboard, and division weight cards |
| `app/gyms/page.tsx` | Server Page | Strongman gym directory page |
| `components/website/GymsBrowser.tsx` | Client Component | Gym filter bar (text search, state, required strongman implement, day-pass filter) |
| `app/gyms/[slug]/page.tsx` | Server Page | Gym detail listing with implement specs, day-pass price/policy, drop-in hours, and hosted shows |
| `app/website/account/page.tsx` | Server Page | Account & capability dashboard preview route |
| `components/website/AccountPreviewClient.tsx` | Client Component | Overlapping Athlete / Promoter / Gym Owner capability dashboard with an explicit **Demo Persona** switcher |
| `components/website/WebsiteShell.tsx` | Shared Layout | Mobile-first responsive shell using `data-zt-theme="steel"` and existing `--zt-*` CSS variables |

---

## 2. Data Interfaces & Fixture Locations

- **`lib/website/types.ts`**: Defines `PublicShowSummary`, `PublicShowRecord`, `ShowCompetitionStatus`, `ShowRegistrationStatus`, `ResultsFinalizationStatus`, `SuppliedStandingRow`, `StrongmanGymListing`, and `DemoPersonaProfile` while reusing `AppState`, `Meet`, `Division`, `EventDef`, `Athlete`, `Result`, and `ScoredRow` from `lib/types.ts`.
- **`lib/website/standingsAdapter.ts`**: Read-only adapter calling `scoreSingleEvent` and `calculateDivisionStandings` from `lib/engine/scoring.ts`. Accepts optional `suppliedDivisionPlacements` so official finalized demo results can represent unbroken overall ties (`#1`, `#1`, `#3`) without altering `lib/engine/scoring.ts`.
- **`lib/website/filters.ts`**: Pure filtering and lifecycle badge helpers (`filterPublicShows`, `filterPublicGyms`, `describeShowLifecycle`).
- **`lib/website/fixtures.ts`**: Fictional demo fixtures covering:
  1. `strongfest-2026`: Upcoming show with inclusive strength groups (`Group 1`–`Group 5`) and closed registration (fictional sample athlete placeholders; real roster data from `lib/presets/strongfest.ts` is not republished).
  2. `keystone-fall-brawl-2026`: Live show linking to `/m/keystone-fall-brawl-2026`.
  3. `iron-valley-summer-slam-2026`: Completed show with **finalized** results, demonstrating a tied 1st-place podium (`T-#1`, `T-#1`, `#3`) in `Middleweight 100kg` and a 2-finisher division (`Masters Heavyweight`) with no fabricated 3rd place.
  4. `chesapeake-harbor-strongman-2026`: Completed show with **provisional** results (suppresses official podium cards and displays a provisional audit notice).
  5. `garden-state-winter-wreckage-2026`: Postponed show with waitlisted registration.
- **`lib/website/data.ts`**: Data-access boundary (`listPublicShows`, `getPublicShowBySlug`, `listPublicGyms`, `getPublicGymBySlug`, `listDemoPersonas`). Defaults to `'demo'` mode with zero backend credentials required; never silently substitutes demo fixtures if an explicit `'live_supabase'` request fails.

---

## 3. What Works, What Is Mocked, and What Requires Backend Work

### Works Now
- Full route navigation (`/website`, `/shows`, `/shows/[slug]`, `/gyms`, `/gyms/[slug]`, `/website/account`), direct URL loads, and server-rendered metadata.
- Structured show filtering by text, competition status, state, implement tag, federation, and inclusive group / weight class query, plus one-click filter reset.
- Persistent show page rendering across `upcoming`, `live`, `completed` (`provisional` vs `final`), and `postponed` states.
- Read-only event-by-event scoreboards and division standings via `lib/website/standingsAdapter.ts`.
- Demo persona switcher on `/website/account` showing overlapping Athlete, Promoter, and Gym Owner capabilities with zero writes to `localStorage`.

### Mocked / Preview-Only in This Pass
- Show directory and gym directory data come from `lib/website/fixtures.ts`.
- Account persona switching and gym day-pass edits on `/website/account` are session-only React state and clearly labeled as preview actions.
- Show-specific **Manage This Show (Preview)** buttons on `/website/account` explain that opening `/` loads the device's active localStorage meet until the account-to-meet handoff is wired.

---

## 4. Proposed Integration Changes (For Slate — Not Applied Here)

1. **Upstream Tie-Placement & Finalization Contract (`lib/engine/scoring.ts` + `meets` table)**:
   - Update `calculateDivisionStandings` (or add an official standings helper) so athletes tied on `totalPoints`, `eventWins`, and `finalEventPoints` share the same `overallPlace` (`1, 1, 3`) instead of sequential `1, 2, 3`.
   - Add explicit columns to `meets` in a future migration: `competition_status` (`upcoming|live|completed|postponed|cancelled`), `registration_status`, `results_status` (`not_started|in_progress|provisional|final`), `is_public_listed` (`boolean`, default `false` so test/demo meets stay out of discovery), `venue_json`, and `federation`.
2. **Account-to-Scorer Handoff**:
   - Once Supabase Auth + `meet_members` RLS are active in Phase 2, add a dedicated route or query parameter contract (e.g. `/?meetSlug=<slug>`) that snapshots the current local meet before loading a promoter's selected cloud meet.
3. **Root Route Swap**:
   - After the October 24, 2026 Strongfest field test, move the meet-day scorer to `/scorer` (updating `app/join/JoinClient.tsx` redirect and `public/manifest.json` `start_url` together) and promote `/website` to `/`.

---

## 5. Test / Build Disclosure & Known Limitations

- **Test & Build Status**: **Not run here** (this authoring environment does not have a local `bun`, `node`, or `tsc` runtime attached).
- **Shipped Tests**: Added `test/website.test.mjs` using the project's exact `node:test` + `node:assert/strict` conventions to test show filters, gym filters, lifecycle podium certification rules, tied podiums, and `<3` finisher divisions via `bun test test/`.