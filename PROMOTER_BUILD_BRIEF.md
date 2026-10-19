# ZeroTacky: Promoter Dashboard, Registration UI, Theme Proposals, Legal Drafts (brief for Argon, 2026-10-16 evening)

## What you are getting and where it goes

This text bundle is the complete current source of the `v2` branch (the accounts/final-state track). It already includes
the public website skeleton you built earlier today, merged and fixed, plus everything shipped since: the root splash at `/`,
the meet-day scorer at `/scorer`, the live leaderboard with TV layout, the Meet Setup reorder, and the website's theme controls.
Start from this bundle, not from any earlier zip or your own copy.

Read first: `PHASE1_SYNC_NOTES.md` (bottom sections are newest), `ROADMAP.md`, `lib/promoter/contract.ts`, `lib/types.ts`,
`lib/website/types.ts`, `components/setup/MeetSetup.jsx` and `components/setup/builder/*`, `components/website/WebsiteShell.tsx`.

Deliver the same way as last time: a text bundle of every file you add or change, same record format, plus `PROMOTER_NOTES.md`
describing what works, what is mocked, what you could not run, and anything you want Slate to change in the contract. Run
`bun test test/` and `tsc --noEmit` if your environment allows; if it does not, say so in the notes. Last time two bugs shipped
in code that was never executed (a filter sentinel and fake 404s), so tests you actually ran are worth more than extra features.

## Ownership (hard boundaries)

Slate is building sign-in, profiles and the Supabase side of the contract in parallel on the same branch. To avoid collisions:

**Yours (create freely):**
- `app/promoter/**` (all pages)
- `components/promoter/**`
- `lib/promoter/fixtureApi.ts`, `lib/promoter/fixtures.ts`, `lib/promoter/usePromoterApi.ts` (see section 2)
- `app/register/**` and `components/register/**` (athlete registration UI, section 3)
- `test/promoter.test.mjs`, `test/register.test.mjs`
- `THEME_PROPOSALS.md` (section 4)
- `legal/PRIVACY.md`, `legal/TERMS.md`, `legal/WAIVER.md` (section 5)
- `PROMOTER_NOTES.md`

**Not yours (read only, do not modify):** everything else. In particular `lib/promoter/contract.ts` (propose changes in your
notes instead), `lib/auth/**` and `app/website/account/**` (Slate's sign-in work, may not exist yet in your bundle),
`lib/sync/**`, `lib/engine/**`, `lib/meetBuilder.ts`, `supabase/**`, `app/globals.css`, `lib/constants.ts`,
`components/setup/**`, `components/website/**`, `app/scorer/**`, `app/m/**`, `app/join/**`, `app/page.tsx`.

If you need a change in a file you do not own, write the exact diff you want into `PROMOTER_NOTES.md` and build around it.

## 1. Promoter dashboard (`/promoter`)

Browser-first. Promoters set meets up on a laptop; the phone app is for meet-day edits. Use `WebsiteShell` for the frame
(`activeNav` can stay undefined) so the site header, theme controls and footer carry over.

Routes:
- `/promoter`: my meets. Cards or rows from `listMyMeets()`: name, date, competition status, public-listed badge, division and
  athlete counts, registration count, "Open". A "New meet" button (name, date, optional slug) calls `createMeet`.
  Signed-out state (`getCurrentUser()` returns null): one card saying sign-in is required with a link to `/website/account`.
  Do not build a sign-in form; Slate owns that.
- `/promoter/[serverId]`: one meet. Tabs or sections, in this order:
  1. **Meet** (name, date, slug, stations, gym plates): reuse `components/setup/builder/MeetSection.jsx` as-is.
  2. **Divisions**: reuse `DivisionsSection.jsx`.
  3. **Events**: reuse `EventsSection.jsx`.
  4. **Athletes**: reuse `AthletesSection.jsx`.
  5. **Listing** (new): the `MeetListing` fields from the contract. Competition status, registration status, results status,
     public-listed toggle with a plain warning that off means invisible on `/shows`, venue (facility, street, city, state,
     postal, country), federation, entry fee display, registration deadline, athlete cap. Saves via `updateListing`.
  6. **Registrations** (new, M4 preview): table from `listRegistrations`: athlete, division, status, waiver, paid, created.
     Accept / Decline buttons call `setRegistrationStatus`. Accepted rows should visibly correspond to roster entries.
  7. **Meet day** (new): join code (from `summary.joinCode`) with "Rotate code" (`rotateJoinCode`), links to
     `/scorer`, `/join`, and the projector URL `/m/<slug>?layout=tv`, each as a copyable field.
  Save model: the builder sections mutate an `AppState` the same way `MeetSetup.jsx` does (look at how `strongman-app.jsx`
  passes `updateMeetConfig`, `addDivision`, etc.; those reducers live in `lib/meetBuilder.ts`, call them directly). Keep the
  working copy in component state, show a "Save changes" bar when dirty, call `saveMeetState` on save. Results are read-only
  in the dashboard; never write `state.results`.

Behaviour rules:
- Every `ApiResult.error` is shown verbatim near the action that caused it. No silent failures, no demo fallback when a
  call fails.
- Nothing in the dashboard writes `localStorage`; the scorer owns that.
- Slugs: reuse `slugify` from `lib/meetBuilder.ts` exactly as `MeetSection.jsx` does.
- Mobile layout should not break (promoters will peek on phones), but optimise for 1280 px.

## 2. Fixture API

`lib/promoter/fixtureApi.ts` exports `createFixturePromoterApi(): PromoterApi`, an in-memory implementation seeded from
`lib/promoter/fixtures.ts`: one signed-in demo promoter and three meets (one upcoming with open registration and 4 to 6 pending
registrations, one live, one completed with `resultsStatus: 'final'`). Build meet state with `createBlankMeet` and the
`lib/meetBuilder.ts` reducers, or reuse `DEMO_SHOW_RECORDS` from `lib/website/fixtures.ts`. Do not copy real athlete names
from `lib/presets/**`; use obviously fake names.

`lib/promoter/usePromoterApi.ts` exports `usePromoterApi(): PromoterApi`. For now it returns the fixture API
(module-level singleton so state persists across client navigations). Add a one-line comment where Slate will swap in the
Supabase implementation. The fixture API must honour the `getCurrentUser()` contract: add a `?signedout=1` query param
handler in `/promoter` (dev only) so the signed-out state can be seen.

Tests (`test/promoter.test.mjs`, node:test + node:assert/strict like the existing suites): fixture API round-trips
(create, save, update listing, rotate code changes the code, accept registration adds a roster entry), and any pure
helpers you write (dirty-state detection, listing validation such as deadline must be on or before meet date).

## 3. Athlete registration UI (`/register/[slug]`)

Public page, fixture-backed, reached from a show's detail page (do not edit `ShowDetailClient.tsx`; just make the route
exist and describe the link you want in your notes). Steps: pick division (from the meet's divisions; show weight class /
grouping labels), name, email, emergency contact, waiver acceptance (checkbox plus full text from `legal/WAIVER.md`
rendered on the page), review, submit. Submission creates a `RegistrationRequest` with status `pending` in the fixture API,
then shows a confirmation with the pending status and the promoter contact from the listing. Payment is out of scope:
show the entry fee display and a line saying the promoter will collect payment. Closed registration (`registrationStatus`
not `open` or `waitlist`) shows a clear closed state instead of the form. Tests in `test/register.test.mjs` for the pure
validation (required fields, email shape, division belongs to meet, closed states).

## 4. Theme proposals (`THEME_PROPOSALS.md`, no code changes)

Kurt: "I don't hate the all-black background, but we need to do some ideating on the colors and themes." Current themes
are in `lib/constants.ts` (`THEMES`) and the CSS tokens in `app/globals.css` (`[data-zt-theme=...]` blocks). Propose 4 to 6
new or revised themes as complete token sets in the same format as the existing blocks, each with: name, tagline, surface,
primary, secondary, and the full `--zt-*` token list the CSS uses, plus two sentences on where it works (gym TV at distance,
outdoor daylight, phone in a dim venue). Include at least one that is not near-black (a deep slate or charcoal with real
depth) and one high-contrast "TV at 40 feet" theme. Check text contrast against WCAG AA for the primary-on-surface and
text-on-surface pairs and list the ratios. Slate applies the chosen ones; do not edit `globals.css` or `constants.ts`.

## 5. Legal drafts (`legal/`)

Plain Markdown, US-focused, for a small operator (one person, Pennsylvania) running a website with user accounts, a public
competition directory, athlete registration data (name, email, emergency contact, division), and a free meet-day scoring
app. No payments yet. Write `PRIVACY.md` (what is collected, why, where it lives: Supabase in the US, Vercel hosting;
retention; how to request deletion; no sale of data; cookies limited to session/auth and local storage), `TERMS.md`
(accounts, acceptable use, promoter responsibility for their events and results, no warranty, limitation of liability,
governing law Pennsylvania), and `WAIVER.md` (a template assumption-of-risk and release for strongman competition
registration, with placeholders for promoter name, event, date, venue). Mark every file as a draft that a lawyer should
review before use; this is not legal advice and Kurt knows that.

## 6. Acceptance checklist (what Slate verifies before merging)

- `tsc --noEmit` clean; `bun test test/` passes including your new suites.
- No file outside your ownership list changed. No `localStorage` writes outside the scorer. No real athlete names in fixtures.
- `/promoter` renders signed-in and signed-out states; `/promoter/<fixture id>` renders all seven sections; `/register/<fixture slug>`
  completes a registration and shows it pending on the dashboard.
- Builder sections are imported from `components/setup/builder/*`, not copied.
- `PROMOTER_NOTES.md` lists every contract change you want with a reason.
