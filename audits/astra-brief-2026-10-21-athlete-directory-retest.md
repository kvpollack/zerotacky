# Retest: Athlete Directory fixes (2026-10-21, late)

Scope: confirm the six findings from `astra-2026-10-21-athlete-directory.md` are closed on v2 `6d3b46b6`, and nothing around them regressed. Same access as the first round (v2 preview `https://zerotacky-git-v2-kvpollack-6654.vercel.app`, staging `hryiqiopkihkcrkdyllg`, your staging account). Expect `tsc` clean and `bun test test/` 337 pass (17 in `test/athletes.test.mjs`). Per-finding dispositions with what changed where: `astra-2026-10-21-athlete-directory-disposition.md`. 020 was re-applied on staging (the file is re-runnable; the new constraint and reserved list are live there). Prod has neither 020 nor the directory code; it moves after your report and Kurt's go.

## Retest each finding
1. **AD-M1 (account page drafts).** Type an unsaved display name and location, then (a) save a new username, (b) toggle visibility off and on. Both drafts must survive each action and must not be silently saved (reload: server has the originals). Then change the username while a draft is pending and save the main form afterward: the username must stay the new one and the draft must land. One more: open the account page in two tabs, save a profile change in tab 1, then toggle visibility in tab 2; tab 2 should pick up tab 1's saved value only for the fields that changed on the server.
2. **AD-M2 (state filter).** `/athletes?state=` behaviour and the unit cases: "Kansas City, Missouri" -> MO, "West Virginia" -> WV, "Virginia Beach, Virginia" -> VA, "Kansas City" -> none, "Kansas" -> KS, "Portland, OR 97201" -> OR, "Austin, TX, USA" -> TX. Try a few of your own, including trailing "United States" and a bare two-letter word that is not a state.
3. **AD-L1 (reserved names).** `zt_username_reserved` for website, how_it_works, howitworks, meets, meet, results, scoreboard, security, abuse, and the earlier list; `zt_set_username` refuses them with the reserved message. Your existing `website` username on staging was not revoked (the check is on set); confirm the account still works and that releasing it does not let another account take it.
4. **AD-L2 (avatar path).** Constraint `profiles_avatar_own` on staging against `<uid>/../x.png`, `<uid>/./x.png`, `<uid>//x.png`, `<uid>/`, `/<uid>/x.png`, `<other-uid>/x.png`, and a valid `<uid>/avatar.png`. Only the last one should pass.
5. **AD-L3 (username param).** `/athletes/100%`, `/athletes/%`, `/athletes/%E0%A4%A`: 404 pages, no 500, no query with garbage.
6. **AD-L4 (website field).** Store `mailto:x@y.com`, `tel:555`, `javascript:alert(1)`, `ftp://host`, `https://user:pw@host`, `HTTP://Host`, `localhost:3000`, bare `example.com`. Expect: the first five do not link on the profile page; the last three render as https/http links with no credentials.

## Regression sweep (short)
- Anon and authenticated reads of `zt_public_profiles` still return only opted-in rows and public columns; `profiles` still returns only your own row; `username_holds` still unreadable.
- Clear a username while public: `is_public` false in the same statement, profile 404 within the revalidate window.
- `/athletes` empty-state and filter chips still render with zero matches.

## Report
`audits/astra-2026-10-21-athlete-directory-retest.md`, same format. Verdict per finding (cleared / not cleared) plus any new finding. No deadline tied to the meet.
