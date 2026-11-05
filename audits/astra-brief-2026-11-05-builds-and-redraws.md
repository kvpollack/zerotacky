# Audit: the 11/4 to 11/5 builds and hand redraws (2026-11-05, Thu)

Since the builds audit (`audits/astra-2026-11-03-builds.md`, BLD-01 to BLD-12, all fixed in `b9e92689`) Slate shipped two features, one prod fix and nine hand redraws that took the public site off the old-skin bridge. None has had an independent read. Audit them as an athlete looking for a gym, a promoter filling an event, a gym owner, an admin and a public reader on a phone. Scoring engine and meet-day surfaces are out of scope unless a change below touched them.

Build: main `b6db078b` = v2 `f3a5deee` on Vercel (prod `zerotacky.com`; v2 preview `https://zerotacky-git-v2-kvpollack-6654.vercel.app` on staging `hryiqiopkihkcrkdyllg`). `tsc --noEmit` clean, `bun test test/` 588 pass. **No new migration**: 039 is still the latest on both databases; features 3 and 4 ride `events.config` and a client-side filter. Notes per build in `UI_TRANSITION_NOTES.md` (last nine sections, "Phone scoreboard" onward); each lists what Slate checked, so start from what it did not.

Commit chain on main since the last audit: `ad1cadae` Set Stone V9 brand, `4a9c2590` phone board + 404 sheets, `e74782e4` /register redraw, `feed3356` feature 3, `e7761f46` /promoter + account redraws + Phase 6 leftovers (emails, OG cards, guide shots), `1a3b9f8f` OG font fix, `6d54358e` feature 4, `a903b6f6` athlete / gym / how-it-works redraws, `b6db078b` sweep item 5 (the small pages).

## Fixture
Staging: `iron-harbor-classic-2026` (owner `slate.staging@zerotacky.com`) has an event spec on "Yoke Carry 50 ft" set through the real editor; `riverside-iron-fest-2026` is the demo fixture with specs on events 2 and 3; `all-out-strongfest-2026-dryrun2` is completed with final results. Gyms: `hercules-gym-syracuse-ny` (claimed, owned by the staging account), `the-lift-factory-las-vegas-nv` (unclaimed). `slate_staging` is the only public athlete profile and is in `zt_admins`, so it sees `/website/admin/claims`; use a second account for the non-admin paths. The gym claims queue is empty on staging. Delete whatever you create.

## 1. Feature 3: structured event spec starter (`feed3356`, no migration)
`EventDef.spec` (`lib/types.ts`), helpers `lib/events/spec.ts`, form block at the end of `components/setup/builder/EventForm.jsx`, show page line + kg cells in `components/website/ShowDetailClient.tsx`.
- Round trip: save a spec with every field filled, reload the editor, confirm each field comes back; save an empty spec block and confirm `events.config.spec` is absent (not `{}`), so older clients and the scorer see no change.
- `validateEventSpec`: Other without a description, course 0 / 5281 / negative / non-integer, a rule in both allowed and notAllowed via a hand-built config (the UI prevents it; the mapper may not), `videoUrl` as `javascript:`, `data:`, 501 chars, bare `youtube.com/...` with no scheme. Notes at 281 chars.
- Show page: the spec line and kg cells against a meet with a light tier, a division with no weight, a weight given in kg already, and an event with a spec but no weights. `lbToKg` rounding: 225 lb and 226 lb must not print the same kg wrongly; check 1 lb and 0 lb.
- Scorer regression: the scorer's own MeetSetupSheet (no `host`) opens an event with a spec and saves without stripping it; the scoring surfaces ignore `spec` entirely.
- Known gaps, not findings: numeric per-division pick heights, kg on the register page.

## 2. Feature 4: train for this show (`6d54358e`, no migration)
`lib/website/trainFor.ts`, `test/trainFor.test.mjs` (5 tests), `/gyms?show=<slug>&state=` in `app/gyms/page.tsx` + `components/website/GymsBrowser.tsx`, key "Find a gym to train for this show" on the show page.
- `?show=` with an unknown slug, a draft or unlisted meet, a demo meet, a completed meet, a meet whose events carry no spec: each must render a sane block (or none) with no error and no leak of an unlisted meet's name or events through the needs list.
- Coverage ranking: a gym with every implement, one with none, one with a partial set, two gyms tied; the full-kit checkbox must drop partial gyms and the coverage line must agree with the equipment tags on the card. Does the ranking survive the other filters (state, zip + radius, day pass, search)? Does Reset clear `show` or keep it?
- Vocabulary: `IMPLEMENTS[*].gymEquipment` are tested against `GYM_EQUIPMENT`; check the reverse direction: an implement that maps to no gym equipment id (Other, or any with an empty list) must not count as "missing" against every gym.
- URL and state: back / forward between `/shows/<slug>` and `/gyms?show=`, the `state=` param pre-filled from the meet's venue state, direct load at 390 px.
- Known gaps, not findings: per-gym equipment detail matching (weights, counts), promoter nudge to fill specs.

## 3. OG share cards on prod (`1a3b9f8f`)
`lib/website/og.tsx` now reads `lib/website/fonts/*.ttf` with `path.join(process.cwd(), ...)` and `next.config.mjs` adds `outputFileTracingIncludes` for both `opengraph-image` routes. Fetch `https://zerotacky.com/shows/<listed slug>/opengraph-image` and `/m/<slug>/opengraph-image`: 200 `image/png`, the title in Red Hat Mono and ZER0TACKY in Saira Stencil (not Satori's fallback). Try a show name of 90+ characters and a demo meet (DEMO line key). Check the Vercel function size did not jump past a plan limit after the font tracing.

## 4. Hand redraws (render only, every one claims "ids, aria, handlers, data loaders unchanged")
Routes, with the file(s) and commit:
- `/register` (`components/register/RegisterClient.tsx`, `e74782e4`): walk all four steps on Iron Harbor at 390 and 1280, dark too; waiver renders through `components/legal/MarkdownBlocks.tsx` which was restyled again in `b6db078b`.
- `/promoter` and `/website/account` (`PromoterDashboardClient.tsx`, `AthleteMeetsSection.tsx`, `AccountClient.tsx`, `MembershipCardsSection.tsx`, `HostGymPicker.tsx`, `SignInForm.tsx`, `e7761f46`): create a meet from the dashboard form, change password panel open / close, roles checkboxes, PR editor, social handle ids, membership card add / remove, host gym picker.
- `/athletes/<username>`, `/gyms/<slug>`, `/how-it-works`, `/how-it-works/first-show` (`a903b6f6`): JSON-LD and metadata unchanged (diff the `<script type="application/ld+json">` output against prod before `a903b6f6` if you can; otherwise check the required Event / Place fields are present), the odd-count filler cells (an odd number of PRs, links, FAQ items, equipment rows must not show a dark hole).
- Sweep item 5 (`b6db078b`, 15 files): `/gyms` browser + filter bar, `/shows` filter block, `/athletes`, `/trainers`, gym claim form (`GymClaimClient.tsx`, prefill note shows only when signed in), `/website/account/gym/add` (`AddGymClient.tsx`, gym type radio cells), My Gym editor (`MyGymClient.tsx`, legend floated), `/website/admin/claims` (`AdminClaimsClient.tsx`), `/demo`, `/legal/<doc>`.
- For every form above: tab order and focus ring on the new cells, `<label for>` still pairs with its input, the submit key is a `<button type=submit>` and Enter submits, error text is announced (`role=alert` / `aria-live` where it was before), checkbox and radio cells are hit-testable on a 390 px phone, and the 1 px gap rows in `.zt-block` do not swallow a click between cells.
- Still on the bridge on purpose: `WebsiteThemeControls.tsx`, `WebsiteThemeFrame.tsx` (the shell) and the promoter meet-detail sections (console). Not findings.

## 5. Context (read, do not deep-test)
- `/join`, `/m/<slug>` phone board, root and route not-found pages (`b9e92689`, `4a9c2590`): a quick 390 / 1280 look.
- Email templates: the six `emails/supabase-*.html` were set on prod Auth config via the Management API on 11/5 (read-back byte-matched); staging still carries the old copies. If you trigger a password reset on prod, the mail should show the outlined wordmark PNG and the pen CTA. Staging mail will not; not a finding.
- BLD-04 carry-over: the federation results CSV BOM has still not been opened in real Excel. If you have Excel, download the CSV from a completed meet and report whether the title block and non-ASCII names survive.

## What counts
An athlete sent to the wrong gym (or told a gym lacks kit it has), an unlisted meet's name or events leaking through `?show=`, a promoter who loses a spec on save or whose scorer strips it, a form that cannot be submitted by keyboard or on a phone, a JSON-LD field that went missing in a redraw, a share card that still renders in the fallback font. Rank by who gets hurt on a Saturday.

## Report
`audits/astra-2026-11-05-builds-and-redraws.md`: per-section results, a findings table (build, surface, what happened, what should happen, severity, suggested fix with file and line), the URLs and payloads you used against `?show=` and the spec validator, and the questions above answered one line each. Slate fixes every finding before handing back and lists a disposition per finding.
