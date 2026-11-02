# Audit: pre-freeze mobile sweep of the public site (2026-10-21, Wed pm)

The meet is Saturday 10/24 and the code freezes Thursday. No features are coming; what we want from this round is every small UI, layout, copy and accessibility fix on the pages a stranger, an athlete or a spectator will open from a phone this weekend. Treat it as a punch list: short, concrete, one line per item with the route, the viewport and what you saw. Read-only against prod, no accounts needed except where noted.

Build: prod `https://www.zerotacky.com`, main `37a84557` (same code on the v2 preview). Expect `tsc` clean and `bun test test/` 363 pass. Rounds already closed today: How It Works (`astra-2026-10-21-how-it-works-disposition.md`), Athlete Directory, event order, gym admin.

## Viewports
375x667 (iPhone SE class) as the primary, 390x844 and 430x932 as confirmation, one pass at 768 (iPad portrait) and one at 1280 for anything with a table. Both color schemes (the header toggle is now "bright mode / dark mode"; the popover is "Color scheme") and at least two palettes from the popover.

## Routes, in order of how many people hit them Saturday
1. `/m/all-out-strongfest-2026` and `?layout=tv`: the live board. Phone layout = standing cards plus current event per division; TV layout = one table per division. Up Now strips, division chips, the Phone/TV header button, theme controls, long names (Hannah Litchfield, Yen Chun Huang), 13 athletes across 5 divisions, dashes before any scores. Empty strips are correct until Saturday.
2. `/join` and `/join?code=XXXXXX` (any wrong code is fine): role picker, PIN entry, error states, keyboard behaviour on iOS (numeric keypad for the PIN, no zoom on focus), Back to ZeroTacky Home.
3. `/shows` and `/shows/all-out-strongfest-2026`: card, badges, venue block, fee line, Register button state while registration is closed, Directions / map link if present, share card meta (og:image renders in a link preview).
4. `/register/all-out-strongfest-2026`: registration is closed on this meet, so the page should say so plainly and the form should not pretend otherwise. Then the staging guide meet `iron-harbor-classic-2026` on the v2 preview with your staging account for the open-registration path: account gate (Sign in / Create account / Email me a link), the four step tabs, division dropdown with target weights, waiver scroll and signature, review and confirmation, the signed-in prefill.
5. `/` (root landing), `/how-it-works`, `/how-it-works/first-show` (16 screenshots now carry width/height; check for layout shift and horizontal scroll), `/athletes`, `/athletes/<username>` (Kurt's is public now, with a photo), `/gyms`, `/gyms/<slug>`, `/website/account` signed out and signed in, `/legal/*`.
6. Header and footer on every page: nav wrapping at 375, Join a Meet at the far right, the two theme buttons, focus order, skip link if any.

## What counts
- Overflow, clipped text, horizontal scroll, buttons under 44 px, text under 12 px that carries information, tap targets that overlap.
- Contrast below 4.5:1 for body text or 3:1 for large text and UI, in either scheme; focus rings missing on keyboard navigation; images without alt; form fields without labels; status messages not announced (`role=status`).
- Copy: a sentence a promoter or athlete would misread, a stale name (publish key, Day/Night, Configure, Section 4, scorer link), a page title that does not match its content, an em-dash inside body copy (headers are fine).
- Behaviour: a control that does nothing, a link to a 404, a form that loses input on a tab switch, a toast that cannot be dismissed, a modal that traps or does not trap focus as appropriate.
- Performance only if it is felt: a page over 3 s to first content on a throttled 4G profile.

## What not to spend time on
Scoring logic, PIN and role enforcement, sync and the Supabase side (covered by the dry-run brief and earlier rounds). Browser bugs specific to desktop Safari. Anything that needs a new feature; list it in a final "after the meet" section if you must, one line each.

## Report
`audits/astra-2026-10-21-mobile-sweep.md`: a table of findings with route, viewport, scheme, what you saw, suggested fix, and a severity (SHIP = fix before freeze, LATER = after the meet). Screenshots in `audits/mobile-sweep-2026-10-21/` named by route and viewport. Evidence JSON beside it as usual. Keep the prose short; the table is the deliverable.
