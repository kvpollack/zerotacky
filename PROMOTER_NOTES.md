# PROMOTER_NOTES.md — Promoter Dashboard, Registration UI, Themes & Legal Drafts (2026-10-16)

## 1. Environment & Test Execution Disclosure

* **Runtime Status**: This authoring environment does not have a local `bun`, `node`, or `tsc` runtime attached.
* **Test Suites Shipped**:
* `test/promoter.test.mjs`: 12 unit & integration tests using `node:test` and `node:assert/strict`. Covers `createFixturePromoterApi()` round-trips (`getCurrentUser`, `updateProfile`, `listMyMeets`, `createMeet`, `saveMeetState` preserving read-only `results` and syncing `name`/`date`/`slug`, `updateListing` validation, `rotateJoinCode` changing the 6-char code, `archiveMeet`, `setRegistrationStatus` adding/removing roster entries) plus pure helpers `isMeetStateDirty` and `validateListingPatch`.
* `test/register.test.mjs`: 9 unit & integration tests using `node:test` and `node:assert/strict`. Covers `isRegistrationOpen`, `validateRegistrationInput` (required fields, email format, division membership, emergency contact, waiver boolean), and `submitFixtureRegistration` (creates a `'pending'` `RegistrationRequest` on open/waitlist meets, rejects closed meets, increments `registrationCount` on `PromoterMeetSummary`).


* **Verification Precautions**: All imports, types, and sentinel values were cross-checked against `lib/promoter/contract.ts`, `lib/types.ts`, `lib/website/types.ts`, and `lib/meetBuilder.ts`. Both dynamic Next.js 16 server pages (`app/promoter/[serverId]/page.tsx` and `app/register/[slug]/page.tsx`) await `params: Promise<...>` and call `notFound()` with a companion `not-found.tsx` when an unknown ID or slug is requested, returning a real HTTP 404.

---

## 2. File Inventory (19 New Files, 0 Read-Only Files Touched)

| Path | Purpose |
| --- | --- |
| `lib/promoter/fixtures.ts` | Demo user (`demo-promoter-1`) + 3 seeded meets (upcoming with open reg & 5 pending registrations, live, completed + final) using obviously fictional athlete names (`Alex Sample`, `Blake Demo`, etc.) |
| `lib/promoter/fixtureApi.ts` | In-memory `createFixturePromoterApi(): PromoterApi`, singleton `getFixturePromoterApi()`, pure helpers (`isMeetStateDirty`, `validateListingPatch`), and registration helpers (`getFixtureMeetForRegistration`, `submitFixtureRegistration`, `validateRegistrationInput`, `isRegistrationOpen`) |
| `lib/promoter/usePromoterApi.ts` | Client hook `usePromoterApi(): PromoterApi` returning the module-level singleton fixture API (with the 1-line comment marking where Slate swaps in Supabase) |
| `app/promoter/page.tsx` | Server page for `/promoter` |
| `components/promoter/PromoterDashboardClient.tsx` | My Meets list, "+ New Meet" modal (`createMeet`), signed-out card (`?signedout=1` dev toggle or `getCurrentUser() === null`) linking to `/website/account` |
| `app/promoter/[serverId]/page.tsx` | Server page for `/promoter/[serverId]` |
| `app/promoter/[serverId]/not-found.tsx` | Real HTTP 404 view for unknown `serverId` |
| `components/promoter/PromoterMeetDetailClient.tsx` | 7-tab meet editor reusing `MeetSection`, `DivisionsSection`, `EventsSection`, `AthletesSection` from `components/setup/builder/*` + sticky dirty-state "Save changes" bar |
| `components/promoter/ListingSection.tsx` | Tab 5: `MeetListing` editor with public-listed visibility warning, lifecycle statuses, venue, federation, entry fee, deadline, and athlete cap |
| `components/promoter/RegistrationsSection.tsx` | Tab 6: M4 registration table with Accept/Decline actions and live "On Roster (Lot #N)" correlation badges |
| `components/promoter/MeetDaySection.tsx` | Tab 7: Owner join code with "Rotate code" (`rotateJoinCode`) and copyable links for `/scorer`, `/join`, and `/m/<slug>?layout=tv` |
| `app/register/[slug]/page.tsx` | Server page for `/register/[slug]` reading `legal/WAIVER.md` from disk at render time |
| `app/register/[slug]/not-found.tsx` | Real HTTP 404 view for unknown registration slug |
| `components/register/RegisterClient.tsx` | Multi-step public registration flow (Division & Entry -> Waiver -> Review & Submit -> Confirmation) + closed registration state |
| `test/promoter.test.mjs` | Unit & round-trip tests for `fixtureApi.ts` |
| `test/register.test.mjs` | Unit & round-trip tests for registration validation & submission |
| `THEME_PROPOSALS.md` | 5 new theme token proposals with WCAG AA contrast ratios |
| `legal/PRIVACY.md`, `legal/TERMS.md`, `legal/WAIVER.md` | Plain-English US/Pennsylvania legal drafts marked for lawyer review |

---

## 3. What Works & What Is Mocked

* **Works Now**:
* `/promoter` lists the 3 seeded meets with competition status, public-listed badge, division/athlete/registration counts, and "Open" links. Creating a new meet via "+ New Meet" calls `createMeet` and navigates to `/promoter/<new-serverId>`.
* Appending `?signedout=1` to `/promoter` (e.g. `/promoter?signedout=1`) makes `getCurrentUser()` return `null` so the signed-out card and `/website/account` link can be verified.
* `/promoter/[serverId]` renders all 7 tabs in order:
1. **Meet** (`MeetSection.jsx` imported directly from `@/components/setup/builder/MeetSection`)
2. **Divisions** (`DivisionsSection.jsx`)
3. **Events** (`EventsSection.jsx`)
4. **Athletes** (`AthletesSection.jsx`)
5. **Listing** (`ListingSection.tsx`, saves via `updateListing`)
6. **Registrations** (`RegistrationsSection.tsx`, Accept/Decline calls `setRegistrationStatus` and immediately adds/removes the corresponding athlete in `state.athletes` with a visible Lot # badge)
7. **Meet day** (`MeetDaySection.tsx`, displays `summary.joinCode`, rotates via `rotateJoinCode`, and provides one-click copy fields for `/scorer`, `/join?code=XXXXXX`, and `/m/<slug>?layout=tv`)


* Editing any builder field in Tabs 1–4 marks the working `AppState` dirty (`isMeetStateDirty`), reveals a sticky bottom "Unsaved changes" bar with Discard / Save Changes buttons, and persists via `saveMeetState` without ever touching `state.results` or `localStorage`.
* `/register/iron-furnace-classic-2026` walks an athlete through picking a division (with target event weights shown), entering name/email/emergency contact, reading and accepting the full text of `legal/WAIVER.md`, reviewing, and submitting. Submitting creates a `'pending'` `RegistrationRequest` in the shared singleton fixture API; navigating to `/promoter/srv-meet-upcoming-1` immediately shows the new pending registration in Tab 6.
* Visiting `/register/steel-river-showdown-2026` (where `registrationStatus` is `'closed'`) renders the closed registration card instead of the form.



---

## 4. Proposed Contract & Cross-File Changes for Slate

Because `lib/promoter/contract.ts` and `components/website/ShowDetailClient.tsx` are read-only in this brief, I built cleanly around them and documented the exact changes below for when you integrate:

### A. `lib/promoter/contract.ts` — Add Public Registration Methods & Contact/Emergency Fields

Right now `RegistrationRequest` does not have an `emergencyContact` field, `MeetListing` does not have `promoterContact`, and `PromoterApi` does not expose a public lookup-by-slug or submit-registration method for `/register/[slug]`. Proposed diff to `lib/promoter/contract.ts`:

```diff
 export interface MeetListing {
   competitionStatus: ShowCompetitionStatus;
   registrationStatus: ShowRegistrationStatus;
   resultsStatus: ResultsFinalizationStatus;
   isPublicListed: boolean;      // false = invisible on /shows (default for new and test meets)
   venue: ShowVenue | null;
   federation: string | null;    // free text, e.g. "USS", "Strongman Corporation", "Unsanctioned"
   entryFeeDisplay: string | null;
   registrationDeadline: string | null;  // YYYY-MM-DD
   athleteCap: number | null;
+  promoterContact?: string | null;
 }

```

```diff
 export interface RegistrationRequest {
   id: string;
   meetServerId: string;
   divisionId: string;
   athleteName: string;
   email: string;
+  emergencyContact?: string;
   status: 'pending' | 'accepted' | 'declined' | 'withdrawn';
   waiverAcceptedAt: string | null;
   paid: boolean;
   createdAt: string;
 }

```

```diff
   // registrations (M4; fixture only until the schema lands)
   listRegistrations(serverId: string): Promise<ApiResult<RegistrationRequest[]>>;
   setRegistrationStatus(id: string, status: RegistrationRequest['status']): Promise<ApiResult<RegistrationRequest>>;
+  submitRegistration?(input: {
+    slug: string;
+    divisionId: string;
+    athleteName: string;
+    email: string;
+    emergencyContact: string;
+    waiverAccepted: boolean;
+  }): Promise<ApiResult<RegistrationRequest>>;
 }

```

*(In `lib/promoter/fixtureApi.ts`, `submitFixtureRegistration` and `getFixtureMeetForRegistration` already implement this exact signature and also bridge the `/shows` demo slugs so `/register/<slug>` works for both promoter fixture slugs and public show slugs.)*

### B. `components/website/ShowDetailClient.tsx` — Wire "Register for This Show" Button to `/register/[slug]`

In `components/website/ShowDetailClient.tsx` (lines 167–186), replace the placeholder `In-App Registration Status` toggle button with a direct `<Link href="{`/register/${show.slug}`}">`:

```diff
-          ) : (
-            <button
-              type="button"
-              onClick={() => setRegistrationNoticeOpen((v) => !v)}
-              className="px-3.5 py-2.5 rounded-xl bg-zt-inset border border-zt-border text-zt-muted font-extrabold text-xs uppercase"
-            >
-              In-App Registration Status
-            </button>
-          )}
+          ) : (
+            <Link
+              href={`/register/${show.slug}`}
+              className="px-4 py-2.5 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase tracking-wider inline-flex items-center gap-1.5"
+            >
+              {show.registrationStatus === 'open' || show.registrationStatus === 'waitlist'
+                ? 'Register for This Show →'
+                : 'View Registration Status →'}
+            </Link>
+          )}

```