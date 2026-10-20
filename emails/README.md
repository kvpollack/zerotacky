# Email templates

Supabase Auth sends six account emails. The defaults are unstyled with subjects like "Confirm Your Signup" and
"You have been invited", which is how the 10/19 test landed in spam. These files replace them. **Installed on prod
10/19; verified byte-identical on 10/21 through the management API (`config/auth`).** Staging still has the defaults.

## Paste guide (Supabase dashboard, prod `kagitbfthapxmaljsdtz`, then staging `hryiqiopkihkcrkdyllg`)

Authentication -> Emails -> Templates. For each tab: set **Subject**, paste the file into **Message body (HTML)**, Save.

| Tab | Subject | File |
|---|---|---|
| Confirm signup | Confirm your ZeroTacky account | `supabase-confirm-signup.html` |
| Invite user | You are invited to ZeroTacky | `supabase-invite.html` |
| Magic Link | Your ZeroTacky sign-in link | `supabase-magic-link.html` |
| Change Email Address | Confirm your new ZeroTacky email | `supabase-change-email.html` |
| Reset Password | Reset your ZeroTacky password | `supabase-reset-password.html` |
| Reauthentication | Your ZeroTacky confirmation code | `supabase-reauthentication.html` |

Authentication -> Emails -> SMTP Settings: **Sender email** `no-reply@zerotacky.com` (any address on the verified
domain works with Resend; it does not need a mailbox), **Sender name** `ZeroTacky`. A bare address or a name like
"Supabase Auth" is the second thing filters score against after a missing DKIM.

The templates use only Supabase's variables: `{{ .SiteURL }}`, `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .NewEmail }}`,
`{{ .Token }}`. `{{ .ConfirmationURL }}` already carries the redirect, so the Site URL and the redirect allow-list set on
10/19 are what make the button land on `www.zerotacky.com`.

## Deliverability as of 10/19 (checked with Resolve-DnsName)

- DKIM `resend._domainkey.zerotacky.com`: present.
- SPF `send.zerotacky.com`: Resend's record present; apex SPF covers Namecheap forwarding.
- DMARC `_dmarc.zerotacky.com`: `v=DMARC1; p=none;` present. Leave at `p=none` for now; after a few weeks of clean
  sending, `p=quarantine` with a `rua=` reporting address is the usual next step.
- A new domain has no reputation, so the first messages to Gmail and Outlook may still land in spam regardless of
  content. Marking one "Not spam" in your own mailbox teaches that mailbox only. Volume and time fix the rest.

## Not covered here

Registration emails (request received, accepted, declined, waitlist) are not Supabase Auth mail. They need a send
path from the app (a database webhook or an edge function calling Resend). Parked in ROADMAP section 5 until after
the 10/24 meet; the same layout in these files is the starting point.
