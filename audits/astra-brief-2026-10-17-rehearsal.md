# Rehearsal request: ZeroTacky v2 after the gate fixes (2026-10-17, evening)

Your gate report (`audits/astra-2026-10-17-gate.md`) is answered line by line in `PROMOTER_NOTES.md` section 5; the server side is `supabase/007_gate_fixes.sql` (applied to staging). The two blockers are fixed and the FK one was reproduced on staging before and after. What was missing from your audit was the live two-phone rehearsal, which you could not run for want of a confirmed account and a key. Both are provided now; this request is that rehearsal plus a re-verification of the fixes. Same rules: audit, do not fix; no SQL; production untouched.

## Access
- Working copy `C:\Users\kpollack\.aki\aki_workspace\zerotacky-v2\` at the HEAD Kurt names when he pastes this. Expect `tsc` clean and `bun test test/` 206 pass across 16 files.
- Staging preview (no login wall): `https://zerotacky-git-v2-kvpollack-6654.vercel.app`; local `http://localhost:3079`. Both talk to the staging Supabase project.
- **Account:** `astra-gate-20261017@zerotacky.com`, the password you chose this morning; the address is confirmed now. It owns nothing yet.
- **Staging publish key:** Kurt pastes it after this text. It is the legacy key for the staging project only. Use it for the "key phone" and for the claim step.
- Existing staging meet: `all-out-strongfest-2026-the-power-plant-gym` (join code visible on its dashboard once you own it; you do not). Prefer meets you create yourself.

## Part 1: re-verify the gate round (Part 1 of your report + the Part 2 table)
For every line in `PROMOTER_NOTES.md` section 5, verdict fixed / partial / not fixed / regressed with file:line or a staging observation. In particular, try to defeat: the user-id binding (`lib/sync/controller.ts`, `paused`, `otherAccount`); the claim path (`hooks/useMeetSync.js` `keyToSend`, `components/setup/SyncPanel.jsx`, `006_ownership.sql` publish function); the PIN check (`zt_check_admin_pin`, `hooks/useRoleLock.js`: can a joined phone still unlock without the PIN, e.g. by editing localStorage `meet.adminPin` or the role key?); the listing RPC (`zt_update_listing`: any whitelisted column that lets a member change what they should not?); the submit hardening (`zt_submit_registration`: what did I miss that a hostile anon client can still do?).

## Part 2: the live rehearsal (the part that was not run)
Two browser contexts minimum (a private window is a second phone); three is better (admin, judge, projector). Record what you saw, not what the code says.
1. **Key phone, signed out:** `/scorer`, build a small meet (2 divisions, 2 events, 4 athletes), Sync panel, paste the key, Publish. Note the join code. This meet is now ownerless, like Strongfest on prod.
2. **Claim:** sign in on that same phone (`/website/account`), return to `/scorer`. The Sync panel should show "Publishing as" plus the saved-key line. Publish update. Then on the dashboard (`/promoter`) the meet should appear as yours. Check `meet_members` indirectly: the dashboard lists it and its tabs work. Then Forget the key and publish again keyless: it must still succeed.
3. **Judge phone:** `/join` with the code. Score several athletes across both events, including an edit to a recorded result. Try to unlock admin on this phone: wrong PIN, the real PIN (shown on the admin phone's Setup page), then 11 wrong attempts in a row and report the message.
4. **Projector:** `/m/<slug>?layout=tv` picks up the scores within the poll; switch layouts and themes.
5. **Guard from the phone:** on the admin phone delete a scored athlete and wait for the auto re-publish. The Sync panel must show "Last publish was refused: ... recorded result(s) ..." and keep showing it after the next successful tick. Restore the athlete (or mark withdrawn), confirm the message clears on the next good publish.
6. **Account switch:** with scores queued on the signed-in admin phone (go offline first), sign out, sign in as a second throwaway account, come back to `/scorer`. Expect paused with "different ZeroTacky account", nothing sent; sign back in as the owner, expect the queue to flush. Delete the second account's rows afterwards? No: leave them, list them for Slate.
7. **Registration to judge:** list the meet (Listing tab: listed, open, cap 5, contact), open `/register/<slug>` in a fresh context, submit twice with the same email (second refused), submit a third athlete, Accept on the dashboard, confirm the athlete appears on the judge phone's roster without a rejoin. Then withdraw an accepted, unscored registrant from the dashboard: it must succeed and the roster must shrink (this is the FK blocker). Try to withdraw a scored one: refused with the result named.
8. **Listing race:** two dashboard tabs; tab A closes registration, tab B (stale) sets anything and saves. Expect the reload message in B and registration still closed.
9. **Cap:** set cap to the current roster size, then add an athlete on the Athletes tab and save: refused, message names both numbers. Raise the cap, save again: succeeds. Then try lowering the cap below the roster in Listing: refused.
10. **Stale publish:** second admin phone (signed in as the owner too, or with the key) with an older copy of the meet publishes after the first. Report exactly which athletes and results survive.
11. **Offline:** judge phone offline, score, back online; no duplicates, projector catches up.

## Report
`audits/astra-2026-10-17-rehearsal.md`: Part 1 table with verdicts; Part 2 as numbered observations with pass / fail / could not run and the exact message when something refused; a list of every row you created (meet slugs, emails) so Slate can clean staging; a gate verdict for the v2 to main merge; anything you would add to the meet-day runbook Kurt will follow on 10/24.
