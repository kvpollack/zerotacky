# Disposition: Astra freeze audits (mobile sweep + dry run), 2026-10-21

Reports: `astra-2026-10-21-mobile-sweep.md` (MS-01..14) and `astra-2026-10-21-dry-run.md` (DR-01..07), both against v2 `d6d80efc` and the staging dry-run fixture `all-out-strongfest-2026-dryrun`. Every SHIP item is fixed in this change set. Checks below were run on dev (:3079 against staging) at 375x667 with `~/.aki/tmp/zt/shots/s26_sweep.mjs`; unit suite 363 pass, tsc clean.

## Mobile sweep

| ID | Astra class | Finding | Disposition |
|---|---|---|---|
| MS-01 | SHIP | Color scheme popover opened at x=-75, 288x902, clipped and unscrollable | **Fixed.** `WebsiteThemeControls.tsx`: on phones the panel is `fixed inset-x-3 top-16`, `max-h-[70vh] overflow-y-auto`; from `sm` it anchors right under the button as before. Measured: x=12, w=351, h=467, scrollable. |
| MS-02 | SHIP | Four-step register indicator overflowed (365 px in a 343 px box) | **Fixed.** `RegisterClient.tsx`: steps are `grid-cols-2 sm:grid-cols-4`, `text-xs leading-tight`, 44 px tall. Measured scrollWidth 375, 2 columns on phone. |
| MS-03 | SHIP | Hard-coded light badge/callout text (emerald/amber/red/sky 200-400) near-white on Daylight and Warm Pavement | **Fixed.** `globals.css`: `daylight` and `sandstone` schemes override `.text-emerald-*`, `.text-amber-*`, `.text-red-*`, `.text-sky-300` to dark tones (#047857, #92400e, #991b1b, #075985). Covers the live badge, demo badge, waiver callout and the legal warning blockquote. |
| MS-04 | SHIP | `text-zt-primary` red at 3.96-4.19:1 and blue secondary headings at 3.60:1 on Steel | **Fixed.** `globals.css`: `.text-zt-primary` resolves to `--zt-primary-2` (every scheme's primary-2 measures >= 6.9:1); new `--zt-secondary-text` per scheme (steel #60a5fa, brass #f87171, others = secondary). Measured on steel: rgb(251,113,133) = #fb7185. |
| MS-05 | SHIP | Nav links 30 px, theme buttons 36x28, board chips 30 px, footer links 16 px | **Fixed.** `WebsiteShell.tsx`, `PromoterNavLink.tsx`, `WebsiteAccountChip.tsx`, `WebsiteThemeControls.tsx`, `ScoreboardClient.tsx`: all are `min-h-[44px]` (theme buttons also `min-w-[44px]`). Measured: nav 44, Join 44, theme 44x44, chips 44, footer links 44. |
| MS-06 | SHIP | Board title truncates with the timestamp; Up Now strips truncate event/division/name | **Fixed** with DR-03 (below). |
| MS-07 | SHIP | Join code and PIN fields placeholder-only; errors not announced | **Fixed.** `JoinClient.tsx`: `<label for="join-code">Meet join code</label>` and `<label for="join-pin">` wired to the inputs; both error blocks are `role="alert"`. |
| MS-08 | SHIP | DOB input had no accessible name | **Fixed.** `RegisterClient.tsx`: `aria-label="Athlete date of birth"`. |
| MS-09 | SHIP | 10-11 px informational text on board, standings, register | **Fixed.** Every `text-[10px]` / `text-[11px]` in `ScoreboardClient.tsx`, `RegisterClient.tsx`, `Standings.jsx`, `LeaderboardTable.jsx` is now `text-xs` (12 px); SyncDot badge 9 px -> 11 px. |
| MS-10 | SHIP | "Sample Shows in the Directory (Demo Fixtures)" heading over a section holding the real Strongfest card | **Fixed.** `app/website/page.tsx`: heading is "Shows in the Directory"; demo badges still mark the fixtures. |
| MS-11 | SHIP | Promoter copy pointed at the scorer's New Blank Meet | **Fixed.** `app/website/page.tsx`: copy points at My Meets (`/promoter`) and the first-show guide. Also added (Kurt 10/21): an "always free for athletes" statement in the hero, the athlete track intro and the "Does it cost anything?" FAQ in `lib/website/howItWorks.ts`. |
| MS-12 | LATER | Root/Join force Steel; board uses `?theme=` | Not changed. Ledger: unify theme source across scorer, join and board. |
| MS-13 | LATER | No skip link; signed-in header ~210 px at 375; Join wraps | Not changed. Ledger. |
| MS-14 | LATER | Raw ISO timestamp on show page; em-dashes in copy; no directions link | Not changed. Ledger. |

## Dry run

| ID | Astra class | Finding | Disposition |
|---|---|---|---|
| DR-01 | SHIP | Changing the PIN did not revoke an already-joined judge's write access | **Fixed in SQL.** `supabase/022_pin_change_revokes_grants.sql`: trigger `meets_pin_change_revokes_grants` AFTER UPDATE OF `admin_pin` sets `revoked_at = now()` on every open `meet_grants` row for that meet when the PIN actually changes (same-PIN save revokes nothing). Applied on staging and verified in a rolled-back transaction (new PIN -> grant revoked; same PIN -> untouched). **Prod: not yet applied; needs Kurt's go.** Until it is on prod the Saturday procedure stays "rotate the join code to revoke". The client side of this is DR-04. |
| DR-02 | SHIP | Completed + Final meet still rendered "Live scoreboard", green dot and stale Up Now | **Fixed.** `meetApi.ts` pulls `competition_status` and `results_status` (anon-readable, verified on staging) on first load and on every poll; `ScoreboardClient.tsx` labels the header "Final results" / "Completed · results provisional" / "Cancelled" with a grey dot, hides Up Now when the meet is not live, renders the completed notice as `role=status`, and titles the tab "... Final Results". Measured on the dry-run fixture: label Final, Up Now absent; the live staging meet still shows Up Now and "Live scoreboard". |
| DR-03 | SHIP | Meet name truncated at 375 once the timestamp appears; station lines truncated before the division | **Fixed.** h1 is `break-words` (truncate only in TV layout); Up Now grid is one column on phones and the event/division/name lines wrap. Board scrollWidth 375. |
| DR-04 | DAY-OF | Revoked judge saw a raw RLS 401 | **Fixed anyway.** `SyncDot.jsx` maps RLS / 401 / 403 / JWT errors to: "This phone no longer has access to the meet (the join code or PIN changed). Write down any scores still waiting, then re-join with the current code and PIN." |
| DR-05 | DAY-OF | Pit crew card: Group badge describes the next group while the text describes the next athlete | **Not coded.** Saturday procedure: pit crew reads the text line (next athlete's setup), the badge is the group marker. Ledger for a post-meet card redesign. |
| DR-06 | LATER | Unscored previous meet gets no recovery snapshot on join | Not changed; by design (snapshots only when there is something to recover). Ledger as a note. |
| DR-07 | DAY-OF | Fixture: Astra is `meet_members.owner` but not `meets.owner_id`, so cannot delete | **Procedure.** Prod meet `all-out-strongfest-2026` is owned by Kurt's account (`owner_id`), so this does not apply Saturday. Brief wording corrected for future fixtures. |

## Not re-audited here

Astra's verdict was to hold the freeze until the SHIP items were reviewed. All eleven SHIP items (MS-01..11, DR-01..03) are in this change set; DR-04 came along. Retest suggested for Astra: MS-01/02/05 at 375 on a real phone if available, DR-02 on the Completed fixture, DR-01 on staging (new PIN, old-PIN judge write must fail).
