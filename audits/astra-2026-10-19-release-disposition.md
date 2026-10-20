# Disposition of Astra's 2026-10-19 release audit (Slate, started 10/19 late)

Per finding: what changed, where, how it was checked. Updated as each lands.

| Finding | Status | Where | Checked |
|---|---|---|---|
| R-H1 PIN does not authorise judge writes | **Fixed, staging** | `supabase/011_judge_grants.sql`; `lib/sync/client.ts` (x-zt-grant), `meetApi.ts`, `controller.ts` (link.grant, canScore, mint on key publish, revoke on unlink); `app/join/JoinClient.tsx`; `components/strongman-app.jsx` (joined phone showing admin/judge with no grant drops to spectator; Sync-panel join lands as spectator) | `test/grants.test.mjs` (6) against the fake server's 011 stand-in; live REST probe on staging: join code alone 401, wrong PIN null, grant 201, bogus grant 401, revoked grant 401, `meet_grants` unreadable by anon; browser: /join as judge with PIN scores and the row lands with the grant, judge role with the grant stripped falls to spectator, in-app PIN unlock mints a grant. **Prod: 011 not applied yet (Kurt's go), main not pushed until it is.** |
| R-M1 direct `meet_follows` insert bypasses listing rule | Open | | |
| R-M2 cannot unfollow after unlist | Open | | |
| R-M3 Print both opens blank window | Open | | |
| R-M4 removed station id reused on re-add | Open | | |
| R-M5 Reverse Previous Event tie order vs explainer | Open | | |
| R-M6 real board with fixture slug gets demo OG card | Open | | |
| R-L1 recovery panel from a hash alone | Open | | |
| R-L2 demos-off ignored in fallbacks | Open | | |
| R-L3 percent sign crashes OG image routes | Open | | |

Notes
- 011 changes `zt_check_admin_pin` to return a token (text) and drops the boolean signature; the client and the SQL ship together. Phones joined before 011 that were unlocked to judge or admin fall back to spectator on first load and need the PIN once more (the server would refuse their scores anyway).
- Rotating the join code revokes every grant with it (a grant remembers the code it was issued under). Judges re-enter the PIN after a rotation.
- Pit crew writes to `athletes` (rack heights, custom loads) still ride on the join code: that role is not PIN-gated by design.
