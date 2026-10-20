# Disposition: Astra audit 2026-10-20 (profile fields + Gym Directory)

Verdict was "merge after listed fixes". Every finding below has a fix or a decision. Verified by: `tsc --noEmit`
exit 0; `bun test test/` 263 pass; staging browser checks noted per item. 014 applied on staging; prod on Kurt's go.

| ID | Disposition | Where |
|---|---|---|
| P-H1 HIGH, photo replace order | FIXED. `replaceAvatar` in `lib/auth/avatar.ts`: upload new -> `saveProfile` -> best-effort remove old; a failed save removes the orphaned new upload and rethrows, so `avatar_path` never points at a deleted object. `useAuth.setAvatar` uses it. Regression tests: `test/profileFields.test.mjs` "avatar replace ordering (P-H1)" (happy path order, save failure keeps old + removes new, upload failure touches nothing, remove failure swallowed, bad file rejected before storage). Live staging failure test: revoked `update (avatar_path)` from authenticated, attempted a replace, UI showed "permission denied for table profiles", profile still pointed at the original object, storage held only that object; grant restored and verified (14 columns). | `lib/auth/avatar.ts`, `lib/auth/useAuth.ts` |
| P-M1 MED, nested PR/social shapes accepted | FIXED. `supabase/014_profile_shape.sql`: immutable `zt_profile_prs_ok` (array <= 3, each an object with only string `lift`/`value` <= 40) and `zt_profile_socials_ok` (only the six named keys, string values, 60 chars, website 200); constraints replaced. Astra's two payloads now fail 23514 on staging; the row was unchanged. | `supabase/014_profile_shape.sql` |
| P-M2 MED, `/join` and `/m/<slug>` lack a sign-in entry | FIXED. `/join` gets "Account and sign in" under Back to Home; the scoreboard footer line gets Home and Account links when not in TV mode. One `/website/account` link on each, checked on the dev server. | `app/join/JoinClient.tsx`, `app/m/[slug]/ScoreboardClient.tsx` |
| P-L1 LOW, Configure has no mobile name | FIXED. `aria-label="Configure theme"` and `title`; visible text unchanged on sm+. | `components/website/WebsiteThemeControls.tsx` |
| P-L2 LOW, URL cut mid-escape; `socialUrl('website')` unsanitised | FIXED. `cleanWebsite` returns the whole URL or '' (never slices); `socialUrl('website')` returns '' unless the value is http(s) with no whitespace. Tests added. | `lib/auth/profile.ts` |
| Item 2, `.png` name with `image/jpeg` content type accepted | ACCEPTED. The object name is derived from the MIME type (`avatar-<ts>.jpg`), so the stored extension matches the declared type; the bucket's MIME allow-list is the control. No change. | n/a |
| Item 3, `//evil.example/path` becomes https | ACCEPTED. A protocol-relative host is a legitimate website value; it is stored as an absolute https URL and rendered nowhere yet. Revisit at the public athlete page boundary. | n/a |
| Item 4, Save enabled during upload; file input not disabled | FIXED. Save is disabled while `avatarBusy`; the file input carries `disabled` during `avatarBusy || busy`. | `components/website/AccountClient.tsx` |
| Item 4, hydration error #418 on the signed-in account page | OPEN, pre-existing (ledger). Server renders the signed-out card; no field loss observed. Fix is to render a neutral skeleton until `auth.loading` resolves; scheduled with the athlete pages. | `components/website/AccountClient.tsx` |
| Item 5, zip label echoes raw segment | FIXED. Route returns `normalizeZip(zip)`. | `app/api/zip/[zip]/route.ts` |
| Item 5, unknown zip keeps the list unfiltered | KEPT by Astra's recommendation. | n/a |
| Item 7, persona note says "All Out Strongfest 2026" | FIXED. Now "Riverside Iron Fest 2026 • Ev 2: Keg Over Bar" (that show's real Ev 2). | `lib/website/fixtures.ts` |
| STYLE-1 | FIXED as suggested. | `app/gyms/page.tsx` |
| STYLE-2 | FIXED. "The day-pass price has not been provided." / "No booking link has been provided." / card badge "Day pass not provided". | `app/gyms/[slug]/page.tsx`, `components/website/GymsBrowser.tsx` |
| STYLE-3 | FIXED. "You can save your coaching details here. Other people cannot find them in a directory yet; that is on the roadmap." | `components/website/AccountClient.tsx` |
| Open from Astra | A real two-account cross-owner Storage UPDATE/DELETE test, and production verification of 013/014, remain to be done with a second account. Noted for the next round. | |
