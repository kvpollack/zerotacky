# ZeroTacky Privacy Policy (Draft)

> **DRAFT NOTICE — FOR LEGAL REVIEW BEFORE LIVE USE:** This document is a working draft prepared for ZeroTacky and must be reviewed by a qualified attorney before publication or reliance in production.

**Effective Date:** October 16, 2026  
**Operator:** ZeroTacky (operated in the Commonwealth of Pennsylvania, United States)

---

## 1. What ZeroTacky Is

ZeroTacky is a public strongman competition directory, strongman gym equipment directory, athlete competition registration tool, and offline-first meet-day scoring application.

## 2. Information We Collect and Why

We collect only the information needed to run the directory, register athletes for competitions, and score strongman meets:

1. **Account Information (Athletes, Promoters, and Gym Owners)**
   - **What we collect:** Email address, display name, authentication credentials (or magic-link tokens), and account capability flags (athlete, promoter, gym owner).
   - **Why:** To sign you in, let promoters manage their meets and registrations, let gym owners maintain their equipment listings, and let athletes track their competition entries.

2. **Competition Registration Data**
   - **What we collect:** Athlete full name, email address, emergency contact name and phone number, selected division or weight class, and timestamped acceptance of the competition waiver.
   - **Why:** To transmit your entry to the competition promoter, populate the meet roster when accepted, and give the promoter emergency contact information on meet day. ZeroTacky does not process credit cards or payment credentials at this stage; entry fees are collected directly by the promoter.

3. **Meet-Day Scoring, Rosters, and Public Results**
   - **What we collect:** Competition names, dates, venues, divisions, event weights, athlete display names, lot numbers, optional implement rack/pin height callouts, and event scores (reps, times, distances, weights lifted, and placements).
   - **Why:** To calculate live standings during the meet and publish competition results on `/m/<slug>` and `/shows/<slug>`.

4. **Technical Logs and Analytics**
   - **What we collect:** Basic page-view telemetry via Vercel Analytics and standard web server logs (IP address, browser user-agent, request timestamps).
   - **Why:** To keep the site reliable and diagnose sync or page-load errors.

## 3. Cookies and Local Device Storage

ZeroTacky does **not** use third-party advertising trackers or cross-site marketing cookies.
- **Session Cookies / Tokens:** Used solely to keep signed-in users authenticated via Supabase Auth.
- **Browser `localStorage`:** Used to save your chosen visual theme (`ZEROTACKY_THEME_V1`), layout preference (`ZEROTACKY_LAYOUT_V1`), and—when you use the meet-day scorer at `/scorer` or `/join`—offline meet state, recovery snapshots, and an outbound sync queue. Scores entered while gym Wi-Fi is down are queued locally and retried when the connection returns; the queue has a fixed size, so during a very long outage the oldest queued scores can be dropped, and the scorer keeps the local copy on the device.

## 4. Where Your Data Lives and Who Receives It

- **Infrastructure:** ZeroTacky is hosted on **Vercel** (United States) and stores database and authentication records in **Supabase** (United States).
- **Competition Promoters:** When you register for a competition on ZeroTacky, your registration record (name, email, emergency contact, division, and waiver timestamp) is shared with that competition's promoter.
- **Public Directory & Scoreboards:** If a promoter publishes a meet or enables public listing, division rosters and competition scores are publicly viewable on ZeroTacky. Athlete email addresses and emergency contacts are never shown on public pages.
- **No Sale of Data:** We do not sell, rent, or trade your personal information to data brokers, advertisers, or third parties.

## 5. Data Retention and How to Request Deletion

- **Account and Registration Data:** Retained while your account is active or as needed for the promoter to administer the competition you entered.
- **Historical Competition Results:** Published competition standings are retained as part of the sport's historical record unless the promoter removes the meet or an athlete requests removal of their personal identifiers.
- **Deletion Requests:** You may request access to or deletion of your account or personal registration data at any time by emailing the operator at [OPERATOR CONTACT EMAIL]. We will process verified deletion requests within 30 days [OPERATOR TO CONFIRM].

## 6. Children's Privacy

ZeroTacky is not directed to children under 13, and we do not knowingly collect personal information from children under 13. Youth divisions must be registered by a parent or legal guardian.

## 7. Changes to This Policy

If we make material changes to how we handle personal data (for example, when adding online payment processing), we will update the effective date at the top of this page and notify registered account holders.
