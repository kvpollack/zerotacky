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
      'You set the meet up once, on your phone or a laptop. When you publish it, every judge, pit crew phone and the public scoreboard see the same divisions, events and scores, so nobody is working from a different copy.',
    steps: [
      {
        title: 'Create an account and tick Promoter',
        body: 'Your account is what proves a meet is yours. Only you can change or delete it, and if you lose your phone you sign in on another one and everything is still there. There is nothing to write down or pass around between promoters.',
        link: { label: 'Account', href: '/website/account' },
      },
      {
        title: 'Build the meet',
        body: 'Meet Setup takes you through the pieces in order. Meet details and rules first, where you set the admin PIN, how the run order works, the tiebreaker and which plates the gym has. Then divisions, then stations and floor plan, then events, then athletes. The last step checks that nothing is missing before meet day. On a laptop, My Meets has a New Meet button that opens the same steps as tabs.',
        link: { label: 'Open the scorer', href: '/scorer' },
      },
      {
        title: 'Publish and list it',
        body: 'Publishing from the phone puts the meet online and it shows up under My Meets. Until you say otherwise it stays private. On the Listing tab you decide whether it appears in Find a Show, and whether athletes can register right now, join a waitlist, or only enter on the day.',
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
      'Find a show, keep an eye on it, register when entries open, then follow the scoring live on the day. Shows marked DEMO are made up so you can see what a listing and a scoreboard look like; they do not take entries.',
    steps: [
      {
        title: 'Find a show',
        body: 'Search by name, division, status, state, implement or federation. Each show page has the venue, the divisions and events, and whether registration is open.',
        link: { label: 'Find a Show', href: '/shows' },
      },
      {
        title: 'Follow it',
        body: 'If you are signed in you can tap Follow on a show you are thinking about. It then appears under Following on your My Meets page so you can find it again without searching. Following does not enter you in anything and the promoter is not told.',
        link: { label: 'Account', href: '/website/account' },
      },
      {
        title: 'Register',
        body: 'Once entries are open, pick your division, give an emergency contact and your date of birth, and sign the waiver. You need to be 12 or older on the day of the meet. If you are under 18, a parent or guardian fills in their part of the form.',
      },
      {
        title: 'Track it on My Meets',
        body: 'Your entry starts as Pending approval until the promoter looks at it, then becomes Registered, Waitlisted or Declined. After the meet it moves to Completed, so over time My Meets becomes a record of where you have competed.',
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

export const HOW_IT_WORKS_FAQ: HowFaq[] = [
  {
    q: 'Does it work without Wi-Fi?',
    a: 'Yes. Scoring happens on the phone and is held there until it can be sent. A judge can score a whole event with no signal, and the public scoreboard catches up when the phone reconnects.',
  },
  {
    q: 'What is the admin PIN?',
    a: 'A 4 to 6 digit code the promoter sets in Meet Setup step 1. Judges and anyone changing the setup type it once per phone. People who are only watching never need it. The PIN is checked against the meet each time and is not saved on the phone, so a lost phone does not give away the PIN.',
  },
  {
    q: 'What is a station?',
    a: 'A set of implements with its own running order. Divisions on the same station lift one after the other; two stations run at the same time in different parts of the gym. Promoters assign divisions to stations in step 3, usually after sign-ups close and they know the numbers.',
  },
  {
    q: 'How is the run order decided?',
    a: 'Event 1 goes by lot number. For later events the promoter chooses one of two ways. Reverse overall points means the athlete with the fewest points so far goes first and the leader goes last. Reverse previous event means the order comes from the last event alone, with its winner going last. The screen where this is set explains both.',
  },
  {
    q: 'What are the DEMO shows?',
    a: 'Made-up meets with invented athletes, there so you can see what a listing and a live or finished scoreboard look like before your first real show. They carry a DEMO badge and you cannot register for them.',
    link: { label: 'Open a demo board', href: '/m/iron-valley-summer-slam-2026' },
  },
  {
    q: 'I forgot my password.',
    a: 'On the sign-in form, enter your email and tap Forgot password. The email you get has a link that brings you back to the Account page to choose a new one. If you are already signed in, use Change password on the same page.',
    link: { label: 'Account', href: '/website/account' },
  },
  {
    q: 'Can a promoter delete a meet?',
    a: 'Yes, from the Meet Day tab, as long as the meet is not running or finished. If the meet already has divisions, athletes, registrations or results, you type its name to confirm. Finished meets are kept so results stay available.',
  },
  {
    q: 'What happens to my data?',
    a: 'What you enter when you register goes to the promoter of that meet, and ZeroTacky keeps what it needs to run the service. The Privacy Policy lists what is kept and for how long.',
    link: { label: 'Privacy Policy', href: '/legal/privacy' },
  },
];
