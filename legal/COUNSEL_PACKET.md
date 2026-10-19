# ZeroTacky legal documents: packet for counsel (prepared 2026-10-19)

Three documents, all drafts, all in this folder: `WAIVER.md` (the competition waiver athletes accept when they register), `TERMS.md` (site terms of use) and `PRIVACY.md` (privacy policy). This note explains what the product does with each one, how acceptance is captured, and the questions we need answered. It is written by the person building the software, not by a lawyer.

## 1. What ZeroTacky is

A website (zerotacky.com) and phone app for strongman competitions. Promoters publish a competition, athletes register for it, and on meet day the promoter's volunteers score it on their phones. The operator is Kurt Pollack, an individual in York County, Pennsylvania; there is no legal entity yet. The service is free; no payments are collected. Competitions are run by independent promoters; ZeroTacky supplies software only.

## 2. Where each document appears

| Document | Where a user sees it | How agreement is captured |
|---|---|---|
| Terms of Use | `zerotacky.com/legal/terms`; linked in the site footer; a sentence under the "Create account" button says that creating an account is agreement to the Terms and Privacy Policy | Clickwrap by creating the account (no separate checkbox) |
| Privacy Policy | `zerotacky.com/legal/privacy`; footer; same sentence at account creation | Same |
| Competition waiver | `zerotacky.com/legal/waiver` shows the template with `{{placeholders}}`. During registration (`/register/<competition>`), step 2 shows the same text with the competition name, date, promoter and venue filled in, in a scrollable box; below it is a checkbox "I have read the full Assumption of Risk and Release of Liability Waiver above ... and agree to its terms for <competition>". Step 3 is a review page; the "Submit registration" button is the signature. | Checkbox plus submit |

## 3. What is recorded when an athlete accepts the waiver

Stored with every registration, in the database (Supabase, United States):
- athlete name, email, emergency contact (name and phone), chosen division, optional bodyweight;
- `waiver_accepted_at`: server timestamp of the submission;
- `waiver_version`: the first 12 hex characters of a SHA-256 hash of the exact waiver file shown. The server refuses a submission whose version is not on its list of approved versions, so a registration can never cite a waiver text that was never published. Current version: `3d524437e38f` (the text in this folder). The previous draft's hash `a995ce0eab26` is also listed because test registrations on staging cite it; no real athlete has accepted either yet;
- the athlete's date of birth (`date_of_birth`); age is computed against the competition date, not the submission date;
- for an athlete under 18 on competition day: the parent or guardian's name and a phone or email (an adult's registration has neither);
- the IP address of the submitting device sits in a rate-limit table for about a day (rows older than 24 hours are pruned opportunistically) and is not attached to the registration.

Not recorded: a typed name as a signature, a drawn signature, the rendered copy as the athlete saw it (we can regenerate it from the version plus the competition record), or a confirmation email (outbound email is being set up this week; when it is, we intend to email the athlete a copy of the accepted waiver).

## 4. Minors: what the product does today

Research on the sport's norms: Strongman Corporation's athlete rules (strongmancorporation.com/athlete-info-overview, effective 1/1/2026) set a minimum age of 12 and require that anyone under 18 be registered by a parent or guardian who signs the waivers; Iron Podium, the registration site most promoters use, collects a digital waiver at registration based on the USS/NAS standard forms (ironpodium.com/docs/getting_started), and promoter listings there commonly add that athletes under 18 need a parent or guardian at weigh-in to sign on paper.

Our implementation:
- Registration asks for the athlete's date of birth and shows the age on competition day as it is typed. Under 12 is refused ("contact the promoter"). Under 18 reveals the guardian's full name and phone or email, both required, with the sentence "By continuing you confirm you are the athlete's parent or legal guardian" and notice that the guardian signs on paper at check-in. The server recomputes the age from the date of birth and the meet date and enforces the same rules, so a client cannot claim adult status by omitting fields.
- The waiver's section 7 is written in the guardian's voice for a minor: the guardian confirms their status, agrees on the athlete's behalf and on their own, including release and indemnity for claims the athlete may later bring, and accepts that the promoter may require a paper signature at check-in and sets the minimum age.
- Accounts (Terms section 3): 13 or older; under 18 with a parent or guardian's agreement. An account is not needed to register for a competition.
- The promoter's dashboard shows "Age N on meet day. Guardian: name (contact). Guardian signature needed at check-in." on the registration.

## 5. Questions for counsel

1. **Entity.** Should an LLC exist before real registrations open, and should the released party in waiver section 4(3) and the operator in the Terms name it? Today both say "ZeroTacky" and "its owner, operator and contributors".
2. **Waiver enforceability by state.** Section 9 says the waiver is governed by the law of the state where the competition is held. Competitions will be in several states (Pennsylvania first). Is a per-state clause workable, or should promoters be told to attach their own state-specific waiver as well? Pennsylvania's treatment of pre-injury releases for ordinary negligence, and the states that void them, is the point we most need checked.
3. **Minors.** Is a parent's electronic acceptance (checkbox and submit, guardian name and contact typed, no drawn signature) worth anything for a release of the minor's own claims in Pennsylvania and the neighbouring states? If not, is the indemnity in section 7 the right fallback, and should the product require a paper signature at check-in for every minor rather than leaving it to the promoter?
4. **Electronic signature evidence.** Is the record in section 3 sufficient under E-SIGN/UETA, or should we add a typed full name as the signature, store the rendered copy, and send a confirmation email? Each is a small change; we would rather build what you want than guess.
5. **Media release (section 6).** We plan to let promoters attach Instagram posts to a competition page and athletes to link a handle on their profile. Does the release as written cover republishing those, or should that be separate consent at upload time?
6. **Terms: limitation of liability ($100 or fees paid) and York County venue.** Reasonable for a free service, or do you want an arbitration clause instead?
7. **Privacy.** Retention periods in PRIVACY section 5 (account data until closure plus 30 days, results indefinitely, IP 24 hours) are what the software does. Is anything missing for Pennsylvania, or for California users who may register for a show here? We have no sale of data, no advertising, no analytics beyond hosting logs.
8. **Promoter terms.** Promoters are users under the Terms (section 5), not parties to a separate agreement. Is a promoter agreement needed before we take entry fees on their behalf (not yet) or before we show their waiver to athletes (now)?

## 6. Changing the waiver text

Any wording change to `WAIVER.md` produces a new version hash; the hash must be added to the database's approved list before the new text is published, or registration stops with "The waiver text has changed since this page loaded". The build does this automatically from the file (a test fails until the migration lists the new hash). Counsel's edits can be made directly to the Markdown file or sent as a redline; either way one deployment publishes them. Placeholders `{{EVENT_NAME}}`, `{{EVENT_DATE}}`, `{{PROMOTER_NAME}}` and `{{VENUE_NAME_AND_ADDRESS}}` must stay; they are filled per competition.
