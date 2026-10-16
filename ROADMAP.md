# ZeroTacky roadmap to "final state" (drafted 10/16 evening, Slate; Kurt to edit)

Two tracks run at once. `main` stays the meet-day build for 10/24 and only takes the five sprint items plus bug fixes. A `v2` branch takes everything that needs accounts. They merge after the meet.

## 1. Branches and environments

| | `main` (demo / meet-day) | `v2` (final state) |
|---|---|---|
| Deploys to | https://zerotacky-lime.vercel.app (Vercel production) | Vercel preview URL per push (`zerotacky-git-v2-*.vercel.app`), or a second Vercel project `zerotacky-v2` if we want a stable URL |
| Supabase | `kagitbfthapxmaljsdtz` (the real meet's data) | a second project, `zerotacky-staging`; v2 testing never touches meet-day rows |
| Takes | sprint items 1-5, bug fixes, UI polish that both branches want | auth, profiles, promoter dashboard, registration, Supabase-backed shows/gyms |
| Freeze | 10/22 evening through the meet; hotfixes only | none |
| After 10/24 | collect meet-day issues, fix on `main` | merge `main` into `v2` (fixes flow forward), finish, then `v2` becomes `main`; the old demo meet stays as `isDemo` fixtures |

Rule: both branches get the same UI fix on the same day (I cherry-pick), so the demo never drifts behind on things a user would notice.

## 2. Milestones

- **M0 (10/17 to 10/22, `main`)**: Station naming; Meet Setup reorder (details, divisions, events, athletes, theme last); Config/Advanced bar hiding everything but Results CSV; live overall leaderboard; landscape/phone toggle for leaderboard and Pit Crew; theme ideation plus configure button and day/night toggle on the website landing. Add a one-command meet export (`dump_meet.py`) as the backup for 10/24, since the free Supabase tier has no point-in-time recovery.
- **M1 (10/24)**: All Out Strongfest. Judges and pit crew on phones, leaderboard on a TV. Capture every issue in `PHASE1_SYNC_NOTES.md`.
- **M2 (start 10/17 in parallel, `v2`)**: accounts. Supabase Auth (email magic link + password; Google optional), `profiles` table (display name, role flags: athlete / promoter / gym owner, all three can be true), Account page replaces the persona switcher in `AccountPreviewClient`. Publish moves from the shared publish key to the signed-in promoter: `zt_publish_meet` gets an authenticated path, `meets.owner_id` and `meet_members` (already in `001_schema.sql`) become the authority. Migration `002_auth.sql`.
- **M3 (`v2`)**: promoter dashboard in the browser. Create and edit meets with the existing Meet Builder, set `competition_status`, `registration_status`, `results_status`, `is_public_listed`, `venue_json`, `federation` (Argon's proposed columns, migration `003_listing.sql`). `/shows` reads Supabase instead of `lib/website/fixtures.ts` through the existing `lib/website/data.ts` seam. Phone keeps meet-day edits only.
- **M4 (`v2`)**: athlete registration. Pick a listed meet and division, roster rows flow into the promoter's meet (and so to the judge phones). Waiver text and acceptance stamp. Payments deferred: `registration_fee` and `paid` columns exist, Stripe comes when a promoter actually charges.
- **M5 (`v2`)**: gyms directory with owner claims and edits; results archive (finalized meets publish standings with tie placement `1, 1, 3`).
- **M6**: `v2` becomes `main`. Custom domain, Vercel Pro if we charge anyone, demo banner off, `/website` promoted to `/` with the splash's two buttons folded into the landing page.

## 3. What Kurt sets up (in order of when it blocks us)

1. **Second Supabase project** (`zerotacky-staging`, free tier allows two active projects). Send me the URL and anon key; I apply `001_schema.sql` and the new migrations there. Blocks M2 on day one.
2. **Domain name** (Cloudflare Registrar or Porkbun, roughly $10/yr). Needed earlier than it looks: Supabase's built-in email sender is rate-limited to a handful of messages an hour and is for testing only, so real sign-up emails need a sender domain. Add the domain in Vercel (Domains tab) and in Resend.
3. **Resend account** (free tier: 3,000 emails/month) with the domain verified (three DNS records). Paste the SMTP credentials into Supabase Auth > SMTP Settings. Blocks the first real sign-up test.
4. **Supabase Auth settings** on the staging project: enable Email provider, set Site URL to the v2 preview URL, add Redirect URLs for the preview URL and the future domain. Five minutes in the dashboard; I write out the exact values when the branch exists.
5. **Google sign-in (optional, M2 or later)**: Google Cloud project, OAuth consent screen, client ID and secret into Supabase. Apple sign-in needs the $99/yr developer account; skip until there is an iOS app.
6. **Vercel**: nothing new for previews (automatic). If we want a stable staging URL, create a second project from the same repo on the `v2` branch with the staging Supabase env vars. Pro ($20/mo) only when money changes hands.
7. **Legal text before accounts go live**: privacy policy and terms of use (Argon drafts, you read). Waiver language for M4.
8. **Later**: Stripe account (M4 payments), Sentry free tier for error reporting once real users exist.

## 4. Who does what: Fable 5.1 (Slate), Gemini 4 Argon, GPT-6 Astra

The benchmark gaps between the three are a few points and vendor-reported. What actually separates them for this project is access: Slate has the repo, tests, Supabase, GitHub push, the browser panel and months of memory; Argon in Kurt's Gemini app has none of that and cannot run anything; Astra in an Aki thread has the same tools as Slate but no history. So:

- **Slate (Fable 5.1): integrator and owner of both branches.** All code lands through Slate: run tests, apply migrations, push, keep notes and memory. Fable 5.1 has the top coding-agent score inside a harness (Artificial Analysis coding-agent index 70 vs Astra 67) and the cheapest cache reads for long sessions, which is the shape of this work.
- **Argon (Kurt's personal Gemini): big self-contained drafts.** Argon leads long-horizon software engineering (DeepSWE 77.9 vs 74.1 Astra, 67.4 Fable) and is the only model with 1M output tokens per response, so whole-feature skeletons and long documents are where it pays off: promoter dashboard UI, registration flow screens, migration drafts with RLS, theme system, privacy policy and terms. Two rules from today's handoff: give it the exact contracts (`lib/types.ts`, `001_schema.sql`, the component it must plug into) and require tests; treat its output as untested until Slate runs it (the filters bug and the fake 404s were both in code Argon never executed).
- **Astra (GPT-6 Astra, thread here): audit and adversarial testing.** Astra leads frontier engineering (FrontierSWE 65.5) and computer use (OSWorld 72.6), and ties Argon on vulnerability remediation. Use it for three things: security review of every migration's RLS before it reaches prod; browser-driven end-to-end runs against the preview URL (two phones joining, publish, config refresh, sign-up flow); and the hardest debugging when Slate is stuck. It costs 5x the cheaper OpenAI model per token, so point it at review and hard problems, not bulk code.

Worst case collapses to the same shape: Slate builds, Argon drafts large pieces, Astra audits. Cadence per feature: Slate writes the brief and contracts, Argon drafts, Slate integrates and tests, Astra reviews on the preview URL, Slate fixes and merges.

Sources: Google's Argon announcement (blog.google, 10/13/2026), OpenAI's GPT-6 model guide (10/2/2026), MarkTechPost's four-model comparison (10/4/2026) which relays Google's benchmark table and Artificial Analysis figures.
