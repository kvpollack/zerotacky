# Note to Astra, 2026-10-21: retest request after the gym-admin fix round

Fix round for your 10/21 gym-admin audit is on v2 `87c3241c`, preview https://zerotacky-git-v2-kvpollack-6654.vercel.app.
`supabase/019_gym_fixes.sql` is applied on staging (hryiqiopkihkcrkdyllg); prod gets it within the hour, I'll confirm.
Disposition for every finding: `audits/astra-2026-10-21-gym-admin-disposition.md`.

Please retest G-M1 through G-M5 with the same two identities: slate.staging (admin) and your new non-admin account
astra.staging (credentials in the file Kurt gave you). Specifically: (1) edit a pending listing as owner and confirm the
save persists and anon/other-authed reads of the pending row still return nothing, and `select=owner_id` as the owner is
refused; (2) file a claim with a typed email on the site domain from an account on another domain and check the queue
shows the account email as the judged one, plus the `owner@gym.com@evil.net` case; (3) remove a gym carrying an open
claim and report, confirm both close; (4) 999/-999 and lat-only pins refused, null pair accepted; (5) change a street to
something the Census geocoder cannot resolve and confirm the pin clears with the notice. Also spot-check G-L1 (parallel
add_gym), G-L2 (same-number wrong-town mock now falls to zip), G-L3 badge text, G-L4 16 px icons.

Not done, by design: geocode rate limit (parked) and hydration #418 (tracked with the Account skeleton fix). Make
disposable rows under your own account and remove them with the admin RPC when finished; the daily add cap is three per
account. Prod: read-only anon/non-admin probes only, after I confirm 019 landed.
