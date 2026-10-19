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

export interface HowFaq {
  q: string;
  a: string;
  link?: { label: string; href: string };
}

export const HOW_IT_WORKS_TRACKS: HowTrack[] = [
  {
    id: 'promoters',
    kicker: 'Running a show',
    title: 'Promoters',
    intro:
      'Build the meet once, on your phone or a laptop. Publishing puts it in the cloud so judges, pit crew and the public scoreboard all read the same data on the day.',
    steps: [
      {
        title: 'Create an account and tick Promoter',
        body: 'Meets you publish are tied to your account, not a shared key. One account covers competing, promoting and listing a gym.',
        link: { label: 'Account', href: '/website/account' },
      },
      {
        title: 'Build the meet',
        body: 'Meet Setup walks six steps: details and rules (admin PIN, run order, tiebreaker, plates), divisions, stations and floor plan, events, athletes, then a readiness check. Start from a blank meet, or from the laptop dashboard with New Meet.',
        link: { label: 'Open the scorer', href: '/scorer' },
      },
      {
        title: 'Publish and list it',
        body: 'Publish from the phone and the meet appears under My Meets. On the Listing tab choose whether it shows in Find a Show and set the registration status: open, closed, waitlist, day-of only.',
        link: { label: 'My Meets', href: '/promoter' },
      },
      {
        title: 'Approve registrations',
        body: 'Athletes who register land on the Registrations tab with their division and waiver. Accept them onto the roster, decline, or leave them pending. Accepted athletes are on the floor list.',
      },
      {
        title: 'Hand out the join code on meet day',
        body: 'The Meet Day tab shows the six-character join code. Volunteers enter it on Join a Meet; judges and anyone opening setup also need the admin PIN you set in step 1. You can rotate the code at any time.',
        link: { label: 'Join a Meet', href: '/join' },
      },
      {
        title: 'Share the live scoreboard',
        body: 'Every published meet has a public board at /m/<your-slug>: standings, event breakdown and who is up now. Put it on a TV with the TV layout; spectators open it on their phones with no account.',
        link: { label: 'See a demo board', href: '/m/keystone-fall-brawl-2026' },
      },
    ],
  },
  {
    id: 'athletes',
    kicker: 'Competing and watching',
    title: 'Athletes & Spectators',
    intro:
      'Find a show, follow it, register when entries open, then watch the live board on the day. Demo shows are marked DEMO and are there to show the format; they take no entries.',
    steps: [
      {
        title: 'Find a show',
        body: 'Search by name, division, status, state, implement or federation. Each show page lists venue, divisions, events and the registration status.',
        link: { label: 'Find a Show', href: '/shows' },
      },
      {
        title: 'Follow it',
        body: 'Signed in, tap Follow on a show page and it sits under Following on your My Meets page. A follow is a bookmark: no email, no roster effect.',
        link: { label: 'Account', href: '/website/account' },
      },
      {
        title: 'Register',
        body: 'When entries are open, pick a division, give an emergency contact and date of birth, and sign the waiver. You must be 12 or older on competition day; under 18 needs a parent or guardian on the form.',
      },
      {
        title: 'Track it on My Meets',
        body: 'Your entry shows as Pending approval, Waitlisted, Registered, Declined or Withdrawn, then moves to Completed once the promoter closes the meet.',
        link: { label: 'My Meets', href: '/promoter' },
      },
      {
        title: 'Watch live',
        body: 'The public scoreboard updates as judges score. Spectators at the venue can also enter the join code on Join a Meet for a read-only Next Up view with heights and weights.',
        link: { label: 'Join a Meet', href: '/join' },
      },
    ],
  },
  {
    id: 'volunteers',
    kicker: 'Meet-day crew',
    title: 'Volunteers & Judges',
    intro:
      'No account needed. The promoter gives you a six-character code; the app opens attached to the meet in the role you pick.',
    steps: [
      {
        title: 'Enter the join code',
        body: 'Open Join a Meet, type the code, check the meet name that comes back.',
        link: { label: 'Join a Meet', href: '/join' },
      },
      {
        title: 'Pick your role',
        body: 'Athlete / Spectator sees standings and Next Up, read-only. Volunteer (pit crew) gets the plate-loading calculator: exact stacks per athlete from the gym plate inventory and the collar weight. Judge and Promoter ask for the admin PIN once; the phone remembers the role.',
      },
      {
        title: 'Judges: score from the pad',
        body: 'Reps, time, distance, rising bar and stone splits per athlete, with the run order already set by the promoter\'s method. Scores sync to the board as soon as the phone has signal.',
      },
      {
        title: 'Pit crew: load from Next Up',
        body: 'The Next Up list shows the athlete, the weight, the plate stack per side and any rack or pin height callout. Toggle bar weight and custom loads as the promoter allows.',
      },
      {
        title: 'Lose signal? Keep going',
        body: 'The scorer is offline-first. Scores queue on the phone and send when the connection comes back; nothing is lost if the gym Wi-Fi drops.',
      },
    ],
  },
];

export const HOW_IT_WORKS_FAQ: HowFaq[] = [
  {
    q: 'Does it work without Wi-Fi?',
    a: 'Yes. The meet-day scorer runs on the phone and queues changes until it can sync. Judges can score an entire event offline; the public board catches up when a phone reconnects.',
  },
  {
    q: 'What is the admin PIN?',
    a: 'A 4 to 6 digit code the promoter sets in Meet Setup step 1. The judge pad and promoter setup ask for it once per phone; viewing roles never need it. It is checked on the server and never stored on the phone.',
  },
  {
    q: 'What is a station?',
    a: 'One set of implements running its own order. Divisions on the same station run back to back; two stations run at the same time. Promoters assign divisions to stations in step 3, usually once sign-ups are in.',
  },
  {
    q: 'How is the run order decided?',
    a: 'Event 1 runs by lot number. After that the promoter picks one of two methods: reverse overall points (leader goes last) or reverse previous event (last event\'s winner goes last). Both are explained on the screen where they are set.',
  },
  {
    q: 'What are the DEMO shows?',
    a: 'Fictional meets with made-up athletes so you can see the directory and a live or completed scoreboard before your first real show. They carry a DEMO badge and registration is disabled.',
    link: { label: 'Open a demo board', href: '/m/iron-valley-summer-slam-2026' },
  },
  {
    q: 'I forgot my password.',
    a: 'On the sign-in form, enter your email and tap Forgot password. The link in the email brings you back to the Account page to set a new one. Signed in, use Change password on the same page.',
    link: { label: 'Account', href: '/website/account' },
  },
  {
    q: 'Can a promoter delete a meet?',
    a: 'Yes, from the Meet Day tab, as long as the meet is not live or completed. A meet with divisions, athletes, registrations or results asks you to type its name first. Completed meets stay as a record.',
  },
  {
    q: 'What happens to my data?',
    a: 'Registration details go to the promoter of that meet and to ZeroTacky to run the service. The Privacy Policy lists exactly what is kept and for how long.',
    link: { label: 'Privacy Policy', href: '/legal/privacy' },
  },
];
