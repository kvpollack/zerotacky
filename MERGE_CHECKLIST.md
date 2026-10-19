# v2 -> main merge checklist (written 10/17 night after Astra gate 3; Kurt moved the merge to 10/19 evening, before the 10/24 meet, so sign-ups can open this week)

Astra's gate 3 verdict at `52c7abb9` was "merge as is for the audited code" (`audits/astra-2026-10-17-gate3.md`); `e3c7f346` after it is notes and evidence only. This is the order of operations. Items marked **Kurt** need his browser or his accounts; everything else Slate does on a go.

## 0. Before the day (any time between 10/24 and the merge)
- [x] **Kurt**: regenerate the GitHub PAT and the Supabase PAT (both expire 10/23) into `~/.aki/tmp/zt/github_pat.txt` and `supabase_pat.txt`; revoke the old Supabase PAT if not done. **Done 10/19** (GitHub PAT write proven by the `43bc1d03` push; Supabase PAT scoped to staging + upgrade-test, no prod).
- [x] **Kurt**: prod Supabase Auth: Site URL `https://www.zerotacky.com`; Redirect URLs `https://www.zerotacky.com/**` and `https://zerotacky-lime.vercel.app/**`. Enable the Email provider. **Done 10/19** (a `zerotacy` typo in the v2 preview redirect was caught and fixed the same day).
- [x] **Kurt**: Resend SMTP into prod Supabase Auth > SMTP Settings (ROADMAP section 3, items 2-3). Without it, Supabase's built-in sender is rate-limited and meant for testing; sign-up confirmation mails for real promoters will not reliably arrive. Can be done after the merge if the first promoters are people Kurt confirms by SQL, but it blocks "anyone can sign up". **Done 10/19** (domain verified, DKIM/SPF/DMARC present, test mail delivered to spam with the default template).
- [x] **Kurt**: `privacy@zerotacky.com` forwarding (operator contact in the privacy page). Separate from Resend. **Done 10/19.**
- [ ] **Kurt**: paste the six Auth email templates from `emails/` into prod (and staging) per `emails/README.md`; set SMTP sender to `ZeroTacky <no-reply@zerotacky.com>`. Not blocking the merge, but do it before the first real sign-up invite goes out.
- [ ] **Kurt**: send `legal/COUNSEL_PACKET.md` plus the three documents to counsel (10/19 drafts). The live waiver hash is `3d524437e38f` (009); a wording change from counsel means a new hash row in a migration (`test/waiver.test.mjs` fails until it is there). Real registrations can open before counsel answers if Kurt accepts that risk; the packet lists the questions.
- [x] Slate: confirm Vercel **Production** env vars point at prod (`NEXT_PUBLIC_SUPABASE_URL` = `kagitbfthapxmaljsdtz`, anon key) and **Preview** at staging; Kurt reads them off the Vercel dashboard, Slate checks the deployed bundle afterwards. **Kurt read them back 10/19: Production `kagitbfthapxmaljsdtz`, Preview `hryiqiopkihkcrkdyllg`.** Bundle check stays in step 3.
- [ ] Slate: re-run on the exact merge candidate: `./node_modules/.bin/tsc.exe --noEmit -p tsconfig.json` clean, `bun test test/` 219 pass, `changed.py --root <v2> --branch v2` empty (working copy = remote).

## 1. Pick the moment
- Nobody on a meet. The migrations and the client deploy need to land together: 007 changes what `zt_meet_by_join_code` returns (no `admin_pin`), so a main-client phone joining during the gap gets the default-PIN unlock. The gap is the Vercel build, about 2 minutes. Doing it when no meet is running makes the gap harmless.
- Kurt's call 10/19: merge the evening of 10/19 rather than after the meet, so registration and sign-ups are live during the week. Prod runs 001+002+004 and the main client until then. The Thursday dress rehearsal on prod (join, unlock, score a test event, projector) is the safety net for Saturday; a bad outcome there rolls back per section 4.

## 2. Prod database (Kurt pastes, Slate watches)
- [ ] **Kurt**: dump every prod meet first from his shell: `uv run scripts/dump_meet.py strongfest-2026 --join-code <code>` (and any other slug worth keeping); dumps land in `dumps/`, gitignored. This is the rollback: `--restore` republishes a dump.
- [ ] **Kurt**: Supabase prod SQL editor, one file at a time, in this order, each must end "Success": `supabase/003_auth.sql`, `005_listing.sql`, `006_ownership.sql`, `007_gate_fixes.sql`, `008_publish_guards.sql`, `009_minors.sql`. Re-running any of them is safe (dry run proved idempotence for 003-008; 009 uses `if not exists` / `create or replace` throughout). Do not stop halfway: 005 without 007 leaves the join RPC returning the PIN to a client that no longer expects it.
- [ ] Slate: read-only verification queries Kurt pastes back (or Slate runs if the new PAT is scoped to prod for read, which it currently is not and need not be): row counts on meets/athletes/results unchanged against the dump; `select count(*) from pg_policies where schemaname='public'` = 19; `select proname from pg_proc join pg_namespace n on n.oid=pronamespace where nspname='public'` = 28 functions; `select count(*) from zt_waiver_versions` = 2; `select admin_pin is not null from meets` all true.
- [ ] **Kurt**: rotate the prod publish key: `insert into publish_keys (key, label) values ('<new>', 'kurt-2026-10');` then `delete from publish_keys where key = '<old>';`. Admin phones re-enter the key once in Sync (signed-in phones that saved the old key will be refused on their next publish until they do).
- [ ] Optional: `delete from meets where slug = 'all-out-strongfest-2026-the-power-plant-gym';` (the accidental 10/16 meet; cascades).

## 3. Code to main
- Mechanism: no local git. Slate pushes v2's tree onto main as one commit with main's head as parent (`push.py --branch main`, every differing file plus `--delete components/website/AccountPreviewClient.tsx`). Checked 10/17: v2 contains every change main received since the branch point (38 files; the one main line absent from v2 is the `Unlock PIN: 1050` fallback that v2 removed on purpose for R1). A GitHub PR would work too but would hit 3-way conflicts on 10 files that both branches touched; the tree push avoids that and gives the same result.
- [ ] Slate: push; watch Vercel (`vercel_status.py <sha>` observer); confirm `https://www.zerotacky.com` serves the new build (bundle carries the prod ref, `/promoter` route exists).
- [ ] Slate: run `changed.py --root <v2> --branch main` afterwards: must be empty.

## 4. First ten minutes on prod (Kurt on a phone, Slate in the browser panel)
- [ ] `/` splash, `/website`, `/shows` load. `/shows` is empty or shows only listed meets (Strongfest is not `is_public_listed`; that is expected).
- [ ] `/scorer`: a phone that carried the Strongfest meet still opens it; roster and scores intact.
- [ ] `/join?code=<Strongfest code>` on a fresh phone: joins, no PIN in local storage, unlock asks the server, 1050 is refused, the real PIN works.
- [ ] Sign up as Kurt at `/website/account` (confirmation mail arrives if Resend is in; otherwise Slate confirms by SQL that Kurt pastes). Profile saves.
- [ ] `/legal/terms`, `/legal/privacy`, `/legal/waiver` render; footer links present; the Create-account form shows the Terms sentence.
- [ ] `/promoter`: Strongfest does not appear (ownerless; it was published with a key). Open Sync on an admin phone signed in as Kurt, enter the new publish key, Publish update: the meet is claimed, `/promoter` lists it, membership row written.
- [ ] Create a throwaway meet in `/promoter`, list it, cap 2, open registration. `/shows` shows it within 60 s (ISR). `/register/<slug>` submits (waiver stamp recorded; date of birth asked, a DOB under 18 reveals guardian fields); accept it in the dashboard; the athlete appears on the admin phone's roster after the next pull. Decline a second one. ~~Delete the throwaway through the dashboard afterwards~~ (no delete exists; found 10/19, spec in ROADMAP s5; Slate deletes by SQL or it stays as the practice meet).
- [ ] Projector `/m/<slug>?layout=tv` renders.
- [ ] Anything red: Slate reads the browser console and the Supabase logs Kurt pastes; rollback is the dump restore plus a push of main's previous tree (`dbfd3df1`), not a migration reversal.

## 5. After
- [ ] Slate: ROADMAP M3 marked live on prod; `PHASE1_SYNC_NOTES.md` step 5 (meet-day reset) still applies to the new schema.
- [ ] Slate: retire the v2 working copy or keep it as the next branch (Kurt's call); staging keeps running the preview alias.
- [ ] **Kurt**: Astra post-merge smoke audit on prod if wanted (read-only, a throwaway meet); brief would be `audits/astra-brief-prod-smoke.md`, not written yet.
- [ ] Delete or keep the `zerotacky-upgrade-test` Supabase project.

## 6. Follow-up release (started 10/19 night, after the merge)
- [x] Role landing + PIN gate for judge/promoter, spectator read-only Next Up (v2 `c2653fb3`, Vercel preview green).
- [x] `supabase/010_meet_lifecycle.sql` on staging: publish keeps a real meet real; `zt_delete_meet` (owner, not live/completed, name typed when the meet has data). Verified on staging: empty draft deleted; a meet with a division, event, athlete and scored result deleted with full cascade through the 004 guard; wrong name refused client-side; publish rule checked for all three transitions. Catalog: functions 29, policies 19, tables 12.
- [ ] **Kurt's go**: apply 010 on prod (`python ~/.aki/tmp/zt/sql.py --ref kagitbfthapxmaljsdtz --allow-prod --file supabase/010_meet_lifecycle.sql`, then `prod_check.sql` expecting functions 29). Then push v2 -> main. Then Kurt opens Meet Setup on the admin phone, taps **Mark as Real Meet**, publishes once: `ec1472c8` becomes real and shows on `/shows` once listed. `strongfest-2026-demo` stays demo.
- [ ] Stations as their own setup step, run-order method explained on screen (ROADMAP s5).

