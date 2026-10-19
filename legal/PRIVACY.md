# ZeroTacky Privacy Policy

> **DRAFT FOR LEGAL REVIEW.** Working draft for ZeroTacky; a qualified attorney should review it before it is relied on.

**Effective date:** October 2026  
**Operator:** ZeroTacky, operated from the Commonwealth of Pennsylvania, United States  
**Contact:** privacy@zerotacky.com

---

## 1. What ZeroTacky is

ZeroTacky is a public directory of strongman competitions, an athlete registration tool, and an offline-first scoring app that promoters run on their own phones on meet day. This policy covers all of it.

## 2. What we collect and why

| Who | What | Why | Where it comes from |
|---|---|---|---|
| Anyone with an account (athletes, promoters) | Email address, display name, password (stored hashed by our authentication provider), sign-in timestamps | To sign you in, let promoters manage their meets, and send you messages about your registrations | You |
| Athletes who register for a competition | Name, email, emergency contact (name and phone), the division you chose, optional bodyweight, your date of birth, the date and time you accepted the waiver and an identifier of the exact waiver text you accepted; for an athlete under 18 on competition day, the parent or guardian's name and contact | To send your entry to the promoter, put you on the roster when accepted, and give the promoter your emergency contact on meet day | You, or your parent or guardian |
| Athletes on a meet roster (added by a promoter, with or without an account) | Name, division, lot number, optional bodyweight and rack heights, scores and placings | To run and score the meet and show standings | The promoter and their judges |
| Everyone who visits | Standard server logs (IP address, browser type, pages requested, timestamps) kept by our hosting provider; the IP address of a device that submits a registration or tries a PIN, kept for about a day to stop abuse | To keep the site running and stop brute-force and spam | Your browser |

We do not run advertising trackers or sell data. We do not collect payment details; entry fees are between you and the promoter.

## 3. Cookies and storage on your device

- **Sign-in:** a session token from our authentication provider (Supabase Auth) keeps you signed in.
- **Local storage:** your theme and layout choice, and, if you use the scoring app (`/scorer`, `/join`), the meet you are working on, recovery snapshots and a queue of scores waiting to sync. Scores entered while the gym Wi-Fi is down stay on the phone and are sent when it reconnects. Clearing your browser data removes them.
- No third-party advertising or cross-site tracking cookies.

## 4. Who sees your data

- **Promoters.** When you register for a competition, the promoter of that competition gets your registration (name, email, emergency contact, date of birth, division, bodyweight if given, waiver acceptance, and guardian details for an athlete under 18). Promoters agree to use it only to run that competition.
- **The public.** For a meet the promoter has listed or published, rosters, athlete names, divisions, scores and placings are public on `/shows/<meet>` and the live scoreboard `/m/<meet>`. Emails, emergency contacts and guardian details are never public.
- **Our providers.** Vercel (hosting, United States), Supabase (database and authentication, United States) and Resend (transactional email, United States) process data for us under their own terms. We do not share data with anyone else except as the law requires.

## 5. How long we keep it

- Account data: while your account exists. Close your account and we delete the profile within 30 days; your name may remain in competition results you took part in (below).
- Registrations: until the promoter deletes the meet, or until you ask us to remove yours.
- Results: published competition results are part of the sport's record and stay up unless the promoter removes the meet or you ask for your name to be removed from a past result.
- Abuse-prevention IP records: about a day. Server logs: per our hosting provider's retention.

## 6. Your choices

Email **privacy@zerotacky.com** to see what we hold about you, correct it, delete your account or registrations, or have your name removed from a past result. We answer within 30 days. We may need to confirm you are the account holder first. Residents of states with privacy laws that give extra rights (for example California) can exercise them the same way.

## 7. Children

Nobody under 13 may create an account, and we do not knowingly collect information about anyone under 13. Athletes under 18 are registered for competitions by a parent or legal guardian, who provides the information in section 2. If you believe a child has given us information without a guardian's involvement, email us and we will delete it.

## 8. Security

Data is encrypted in transit; passwords are hashed by Supabase Auth; database access is restricted by row-level rules so promoters see only their own meets and athlete contact details are never readable by the public. No system is perfectly secure; if we learn of a breach affecting you we will tell you as the law requires.

## 9. Changes

If we change this policy in a way that matters (for example, when we add payments), we will update the effective date and email account holders before the change takes effect.
