// Copy for /how-it-works (Kurt 10/19). Kept as data so test/howItWorks.test.mjs can check every link against the
// routes that exist. Wording describes the product as built; update it when a flow changes.

export interface HowStep {
  title: string;
  body: string;
  link?: { label: string; href: string };
}

export interface HowTrack {
  id: 'promoters' | 'athletes' | 'volunteers';
  kicker: string;
  title: string;
  intro: string;
  steps: HowStep[];
}

export type HowFaqGroup = 'everyone' | 'athletes' | 'promoters' | 'gyms';

export interface HowFaq {
  group: HowFaqGroup;
  q: string;
  a: string;
  link?: { label: string; href: string };
}

export const HOW_FAQ_GROUPS: Array<{ id: HowFaqGroup; title: string }> = [
  { id: 'everyone', title: 'Everyone' },
  { id: 'athletes', title: 'Athletes and spectators' },
  { id: 'promoters', title: 'Promoters' },
  { id: 'gyms', title: 'Gym owners' },
];

export interface HowRoadmapItem {
  title: string;
  body: string;
}

export const HOW_IT_WORKS_TRACKS: HowTrack[] = [
  {
    id: 'promoters',
    kicker: 'Running a show',
    title: 'Promoters',
    intro:
      'You set the meet up once, on your phone or a laptop. When you publish it, every judge, pit crew phone, and the public scoreboard see the same divisions, events, and scores, so nobody is working from a different copy.',
    steps: [
      {
        title: 'Create an account and tick Promoter',
        body: 'Your account is what proves a meet is yours. Only you can change or delete it, and if you lose your phone you sign in on another one and everything is still there. There is nothing to write down or pass around between promoters.',
        link: { label: 'Account', href: '/website/account' },
      },
      {
        title: 'Build the meet',
        body: 'On My Meets, New Meet asks for a name and a date and opens the meet as eight tabs: details and rules (admin PIN, run order, tiebreaker, gym plates), divisions, stations, events, athletes, listing, registrations and meet day. The phone scorer can build the meet itself under Meet Setup, but listing it and approving registrations happen on My Meets. The first-show guide walks through every tab with pictures.',
        link: { label: 'Set up your first show', href: '/how-it-works/first-show' },
      },
      {
        title: 'List it and open entries',
        body: 'A new meet starts unlisted: it is not in Find a Show and has no show page yet, though its registration page and scoreboard open for anyone with the direct link. On the Listing tab you tick Listed to put it in Find a Show, fill in the venue and entry fee, and decide whether athletes can register right now, join a waitlist, or only enter on the day. Building on the phone instead? Publish from the scorer while signed in and the meet lands under My Meets the same way.',
        link: { label: 'My Meets', href: '/promoter' },
      },
      {
        title: 'Approve registrations',
        body: 'When an athlete registers, their entry appears on your Registrations tab with the division they picked and their signed waiver. Accepting them adds them to the roster for that division. You can also decline, or leave them pending while you sort out numbers.',
      },
      {
        title: 'Hand out the join code on meet day',
        body: 'The Meet Day tab shows a six-character code. Anyone helping you enters it on Join a Meet and their phone is connected to your meet. Judges and anyone who needs to change the setup also type in the admin PIN from step 1. If the code gets out to people who should not have it, tap rotate and the old one stops working.',
        link: { label: 'Join a Meet', href: '/join' },
      },
      {
        title: 'Share the live scoreboard',
        body: 'Every published meet gets a web page with the standings, each event\'s results and who is up next. The link is on the Meet Day tab. Put it on a TV in the gym with the TV layout and send it to spectators, who can open it on any phone without signing in.',
        link: { label: 'See a demo board', href: '/m/keystone-fall-brawl-2026' },
      },
    ],
  },
  {
    id: 'athletes',
    kicker: 'Competing and watching',
    title: 'Athletes & Spectators',
    intro:
      'Find a show, keep an eye on it, register when entries open, then follow the scoring live on the day. All of it is free for athletes, always. Shows marked DEMO are made up so you can see what a listing and a scoreboard look like; they do not take entries.',
    steps: [
      {
        title: 'Find a show',
        body: 'Search by name, division, status, state, implement, or federation. Each show page has the venue, the divisions and events, and whether registration is open.',
        link: { label: 'Find a Show', href: '/shows' },
      },
      {
        title: 'Follow it',
        body: 'If you are signed in you can tap Follow on a show you are thinking about. It then appears under Following on your My Meets page so you can find it again without searching. Following does not enter you in anything and the promoter is not told.',
        link: { label: 'Account', href: '/website/account' },
      },
      {
        title: 'Register',
        body: 'Once entries are open, sign in or create a free account on the form itself, then pick your division, give an emergency contact and your date of birth, and sign the waiver. You need to be 12 or older on the day of the meet. If you are under 18, a parent or guardian creates the account and fills in their part of the form.',
      },
      {
        title: 'Track it on My Meets',
        body: 'Your entry starts as Pending approval until the promoter looks at it, then becomes Registered, Waitlisted, or Declined. After the meet it moves to Completed, so over time My Meets becomes a record of where you have competed.',
        link: { label: 'My Meets', href: '/promoter' },
      },
      {
        title: 'Watch live',
        body: 'The scoreboard page updates as judges enter scores. If you are at the venue you can also enter the join code on Join a Meet and see the Next Up list, including the weights and heights for each athlete, without being able to change anything.',
        link: { label: 'Join a Meet', href: '/join' },
      },
    ],
  },
  {
    id: 'volunteers',
    kicker: 'Meet-day crew',
    title: 'Volunteers & Judges',
    intro:
      'You do not need an account. The promoter gives you a six-character code, you pick what you are doing that day, and the app opens already set up for your job.',
    steps: [
      {
        title: 'Enter the join code',
        body: 'Open Join a Meet and type the code. The meet name comes back so you can check it is the right one.',
        link: { label: 'Join a Meet', href: '/join' },
      },
      {
        title: 'Pick your role',
        body: 'Athlete or Spectator shows the standings and who is up next, with nothing to tap by accident. Volunteer is for pit crew and shows the plate loading calculator. Judge and Promoter need the admin PIN from the promoter; you type it once and the phone remembers which role you chose.',
      },
      {
        title: 'Judges: score from the pad',
        body: 'Pick the event and the athletes come up in the right order. Enter reps, time, distance, the bar height reached or stone splits, depending on the event. Scores go to the scoreboard the moment the phone has signal.',
      },
      {
        title: 'Pit crew: load from Next Up',
        body: 'Next Up shows who is lifting, the weight they need, the plates to put on each side and any rack or pin height, so nobody is doing plate maths at the bar. The promoter decides whether you can change the bar weight or enter a custom load.',
      },
      {
        title: 'Lose signal? Keep going',
        body: 'The app keeps working with no signal. Anything you enter is held on the phone and sent as soon as it reconnects, so a dead spot in the gym does not cost you any scores.',
      },
    ],
  },
];

// FAQ rewritten 10/21 (Kurt): the questions a stranger lands with, grouped by who is asking. Promoter internals
// (stations, run order) moved to the first-show guide, which sits next to the screens that use them.
export const HOW_IT_WORKS_FAQ: HowFaq[] = [
  {
    group: 'everyone',
    q: 'Does it cost anything?',
    a: 'Athlete features are free, always: finding shows, registering, My Meets, your profile and the live scoreboard. There is no premium tier for athletes and there will not be one. Running a meet and the gym directory are free right now too; if that ever changes for promoters or gyms, the price will be on the page before you use it.',
  },
  {
    group: 'everyone',
    q: 'Does it work without Wi-Fi?',
    a: 'Yes. Scoring happens on the phone and is held there until it can be sent. A judge can score a whole event with no signal, and the public scoreboard catches up when the phone reconnects.',
  },
  {
    group: 'everyone',
    q: 'Do I need to install an app?',
    a: 'No. Everything runs in the browser on any phone, tablet or laptop. Promoters and judges can add the scorer to the home screen so it opens like an app, but nothing is downloaded from a store.',
    link: { label: 'Open the scorer', href: '/scorer' },
  },
  {
    group: 'everyone',
    q: 'I forgot my password.',
    a: 'On the sign-in form, enter your email and tap Forgot password. The email you get has a link that brings you back to the Account page to choose a new one. If you are already signed in, use Change password on the same page.',
    link: { label: 'Account', href: '/website/account' },
  },
  {
    group: 'everyone',
    q: 'What happens to my data?',
    a: 'What you enter when you register goes to the promoter of that meet, and ZeroTacky keeps what it needs to run the service. Your email is never shown publicly. The Privacy Policy lists what is kept and for how long.',
    link: { label: 'Privacy Policy', href: '/legal/privacy' },
  },
  {
    group: 'athletes',
    q: 'Do I need an account to register for a show?',
    a: 'Yes, a free one, and you can create it right on the registration form without leaving the page. The entry is tied to your account: it shows on My Meets so you can see when the promoter accepts it, and after the meet it stays there as part of your record. You need to be 12 or older on the day of the meet; under 18, a parent or guardian creates the account, registers you and completes their part of the waiver.',
    link: { label: 'Find a Show', href: '/shows' },
  },
  {
    group: 'athletes',
    q: 'How do I watch a show live?',
    a: 'Open the show page and tap the live scoreboard link. It shows standings, each event and who is up next, and updates as judges score. No account, no code. If you are at the venue, the promoter can also give you the join code, which adds the Next Up list with each athlete\'s weights.',
  },
  {
    group: 'athletes',
    q: 'What shows up publicly about me?',
    a: 'Once the promoter accepts you, your name and division appear on the meet roster and the live scoreboard, the same as a printed start list. Your email, date of birth and emergency contact go to the promoter only. Nothing else is public unless you turn on your own athlete page.',
  },
  {
    group: 'athletes',
    q: 'How do I get my own athlete page?',
    a: 'On your Account page, pick a username and turn on Show my profile publicly. Your name, photo, roles, location, home gym, favorite lift, PRs and the social handles you added show at zerotacky.com/athletes/yourname and in the Athletes list. Turn it off any time and the page is gone.',
    link: { label: 'Athletes', href: '/athletes' },
  },
  {
    group: 'promoters',
    q: 'What do I need to run a show on ZeroTacky?',
    a: 'An account with Promoter ticked, your phone or a laptop to set the meet up, and one phone per judge on the day. Nothing is installed and the gym does not need Wi-Fi. The first-show guide walks through the whole thing with pictures.',
    link: { label: 'Set up your first show', href: '/how-it-works/first-show' },
  },
  {
    group: 'promoters',
    q: 'Join code or admin PIN: who gets which?',
    a: 'Two codes, two jobs. The six-character join code gets a phone into your meet; give it to everyone helping, and to athletes or spectators who want the Next Up list. The admin PIN lets a joined phone score and change the setup; give it to judges and your co-promoters only. The join code is on the Meet Day tab; the PIN is set on the Meet tab.',
  },
  {
    group: 'promoters',
    q: 'Can other people help me run it?',
    a: 'Yes. Anyone with the join code and the admin PIN can judge or edit from their phone; several phones can score different stations at the same time and everything merges. The meet itself belongs to your account, so only you can list, unlist or delete it.',
  },
  {
    group: 'promoters',
    q: 'How do athletes get on the roster?',
    a: 'Two ways, and you can mix them. Open registration on the Listing tab and athletes register from the show page; each entry appears on your Registrations tab and you accept or decline it (Waitlist Only on the Listing tab holds new entries instead). Or type athletes straight into the roster in Meet Setup, which is what most people do for a small show or for day-of entries.',
  },
  {
    group: 'promoters',
    q: 'Can I unlist or delete a meet?',
    a: 'Unlist any time from the Listing tab; the meet stays yours, it just leaves Find a Show. Delete from the Meet Day tab as long as the meet is not running or finished; if it already has athletes or results you type its name to confirm. Finished meets are kept so results stay available.',
    link: { label: 'My Meets', href: '/promoter' },
  },
  {
    group: 'gyms',
    q: 'My gym is in the directory. How do I claim it?',
    a: 'Open the gym\'s page and tap Claim this gym, then give your name, email and role at the gym. Sign in first and the approved listing attaches to your account straight away; otherwise we confirm by email. We check each claim against the gym\'s own site or contact address. Once approved, the listing is yours to edit from My Gym: equipment, day passes, drop-in hours, website and contact.',
    link: { label: 'Gym Directory', href: '/gyms' },
  },
  {
    group: 'gyms',
    q: 'My gym is not listed. How do I add it?',
    a: 'Sign in, tick Gym owner on your Account page, and use Add my gym. It goes into a short review queue so the directory stays real gyms with real equipment, then appears under your account.',
    link: { label: 'Add my gym', href: '/website/account/gym/add' },
  },
];

// What is coming (Kurt 10/21): the honest list of what is on the roadmap, so people know what is not here yet.
export const HOW_IT_WORKS_ROADMAP: HowRoadmapItem[] = [
  { title: 'Paid show registration', body: 'Promoters set an entry fee and athletes pay when they register, instead of settling up separately.' },
  { title: 'Day passes from the gym directory', body: 'Buy a drop-in pass for a listed gym from its page, so travelling athletes can train on the way to a show.' },
  { title: 'Trainer directory', body: 'Coaches who train in person or online get their own searchable list, built from the trainer flag on athlete profiles.' },
  { title: 'Show history on athlete pages', body: 'Meets you competed in, with placings, listed on your public page once the promoter marks the show complete.' },
  { title: 'Gyms and shows linked both ways', body: 'A show page points at its host gym, and a gym page lists the shows it has hosted.' },
];
