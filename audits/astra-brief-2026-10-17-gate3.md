# Gate run 3: ZeroTacky v2 after gate 2 (2026-10-17, night)

Your gate-2 report (`audits/astra-2026-10-17-gate2.md`) is answered in `PROMOTER_NOTES.md` section 7. Both HIGHs were yours to find and mine to own: the 008 `coalesce` defaulted the PIN before `excluded` saw it, and `publish()` read React state before the pull's setState committed. Both are fixed with the regression tests you asked for (the G2-H2 test fails against the unfixed line). G2-M1 is fixed along the policy you proposed. STYLE-1 fixed. Expect `tsc` clean and `bun test test/` 212 pass across 16 files. Same access as gate 2.

## Focused recheck
1. **G2-H1.** Repeat your reproduction exactly: owner sets PIN 7391, joined/keyed phone with no local PIN clicks Publish update (`p_meet.admin_pin: null`), owner rereads. Then two more payload shapes through the same RPC: `admin_pin` absent, and `admin_pin: "  "`. All three must leave 7391. `supabase/008_publish_guards.sql`, the `v_pin` lines.
2. **G2-H2.** Repeat your stale-phone scenario with healthy reads: judge adds two walk-ons, stale admin publishes once. Capture the publish body: both must be in `p_athletes`, on the server afterwards, and on the judge. Then the reload variant (admin reloads between the judge's add and the publish). `lib/sync/controller.ts` `pull()` return value and the `pulled` block in `publish()`.
3. **G2-M1.** At cap 3 with 4 on the roster from a floor walk-on: close registration from Listing (expect 200), save an unchanged config (200), add a fifth athlete on the Athletes tab (refused, names 5 and 3), lower the cap to 2 (200). Move an accepted athlete's division on the floor and on the dashboard: both save; the Registrations row shows the submitted division with "competing in ..." under it; the registration's `division_id` is unchanged. Say whether this is the reconciliation you meant or whether you still want a transfer RPC.
4. **STYLE-1.** `/register/<no-such-slug>` on the live preview: no "browser tab" sentence.
5. Anything in sections 6 and 7 you want to re-verify; the fresh-upgrade run and the second account remain Kurt's items and are not claimed.

## Report
`audits/astra-2026-10-17-gate3.md`, same format, same three verdict options, Astra dates advisory.
