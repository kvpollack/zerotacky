// "Set up your first show": one made-up meet (the Iron Harbor Classic) taken from a blank screen to meet day, with a
// picture of each screen and a note on what that screen changes for the public. Kurt 10/21: replaces the demo-centric
// approach. Screenshots live in public/guide and a test checks every one exists. A video walkthrough follows the
// first real show.

export type GuideImage = { src: string; alt: string; caption?: string };
export type GuideLink = { label: string; href: string };
export type FirstShowStep = {
  id: string;
  title: string;
  /** Where in the product this happens, shown as a kicker. */
  where: string;
  body: string[];
  /** What this step changes on the public side (Find a Show, the show page, the scoreboard). */
  publicSide: string;
  images: GuideImage[];
  link?: GuideLink;
};

export const FIRST_SHOW_INTRO = {
  title: 'Set up your first show',
  lede:
    'This walks one made-up meet, the Iron Harbor Classic, from a blank screen to meet day. Every screen below is the real one you will use, and each step says what it changes for athletes and spectators. Budget about half an hour the first time.',
  needs: [
    'A ZeroTacky account with Promoter ticked on the Account page. The meet belongs to that account, so it follows you from laptop to phone and only you can change it.',
    'A laptop for the setup. Everything here also works from the phone scorer under Meet Setup, but the tabs are easier to read on a bigger screen.',
    'On the day: one phone per judge and one for the pit crew. Volunteers do not need accounts; they join with a code you hand out in step 9.',
  ],
};

export const FIRST_SHOW_STEPS: FirstShowStep[] = [
  {
    id: 'create',
    title: 'Create the meet',
    where: 'My Meets, New Meet',
    body: [
      'Open My Meets and tap New Meet. It asks for the name, the competition date and an optional web address. The address (the slug) becomes zerotacky.com/shows/your-slug; leave it blank and one is made from the name.',
      'Create & Open Meet saves the meet to your account and opens it as eight numbered tabs. The order of the tabs is the order you fill them in.',
    ],
    publicSide:
      'Nothing yet. A new meet starts unlisted, so it is not in Find a Show. Its page exists at the direct link, which is handy for checking your work before anyone else sees it.',
    images: [{ src: '/guide/01-new-meet.png', alt: 'The New Meet form with a meet name, date and web address filled in' }],
    link: { label: 'My Meets', href: '/promoter' },
  },
  {
    id: 'rules',
    title: 'Meet details and rules',
    where: 'Tab 1, Meet',
    body: [
      'The admin PIN is four to six digits. Judges and anyone who needs to change the setup on meet day type it once on their phone, after the join code from step 9. Collar weight is per pair and is added to every bar load the pit crew calculator shows.',
      'Athlete run order decides who lifts when. Reverse Overall Points is the usual choice: the leader goes last so the podium race builds. Reverse Previous Event looks only at the last event. Roster Order never reshuffles. The screen explains each one under the buttons.',
      'The tiebreaker only matters when two athletes finish on the same points. Available Gym Plates tells the pit crew calculator what it is allowed to use; turn off anything the gym does not own.',
    ],
    publicSide:
      'The run order drives the Next Up list on the scoreboard and on volunteer phones. Plates and collars drive the loads the pit crew sees. None of this is shown to athletes directly.',
    images: [{ src: '/guide/03-meet.png', alt: 'The Meet tab: name, date, slug, admin PIN, collar weight, run order, tiebreaker and gym plates' }],
  },
  {
    id: 'divisions',
    title: 'Divisions',
    where: 'Tab 2, Divisions',
    body: [
      'Add one division per weight class or experience group, named the way athletes expect to read them. Type a name and press Add; the arrows reorder them.',
      'The order here is the order they appear everywhere else: the registration dropdown, the scoreboard and the show card. Edits sit in working memory until you press Save Changes in the banner at the bottom.',
    ],
    publicSide:
      'Division names show as chips on the show card in Find a Show, as the choices on the registration form and as the sections of the live scoreboard.',
    images: [{ src: '/guide/04-divisions.png', alt: 'The Divisions tab with five divisions listed' }],
  },
  {
    id: 'stations',
    title: 'Stations and floor plan',
    where: 'Tab 3, Stations',
    body: [
      'A station is one set of implements running its own order. Divisions on the same station run back to back; two stations run at the same time in different parts of the gym.',
      'A small meet is fine on one station. Most promoters decide this after sign-ups close, when they know how many athletes each division has. Rename the stations if the gym calls them something else. If one station runs the events in a different order from the rest, the arrows on its card set that order.',
    ],
    publicSide:
      'Each station gets an Up Now strip at the top of the scoreboard, so spectators can see who is lifting where. Next Up on the volunteer phones is per station.',
    images: [{ src: '/guide/05-stations.png', alt: 'The Stations tab with women and novice divisions on Station 1 and open men on Station 2' }],
  },
  {
    id: 'events',
    title: 'Events',
    where: 'Tab 4, Events',
    body: [
      'Add Event opens the form. Pick how it is scored (reps, max weight, time or distance, time or implements), set the time cap and lanes, then tell the loader how the implement works: load points is how many places plates go on, tare is what the empty implement weighs. Those two numbers are what make the pit crew plate maths right.',
      'Under per-division weights, enter the target weight for each division. Add a callout title if the pit crew should see a note, for example the keg or the pin height. Save Event, then Save Changes.',
      'Events run in the order listed. Use the arrows on the cards if the running order changes.',
    ],
    publicSide:
      'Implement names show as chips on the show card. The registration page lists every division with its target weight for each event, so athletes know what they are signing up to lift. The scoreboard gets one column per event.',
    images: [
      { src: '/guide/06-events.png', alt: 'The Events tab listing five events with scoring type, time cap and load points' },
      { src: '/guide/07-event-form.png', alt: 'The event form for a log clean and press with per-division target weights' },
    ],
  },
  {
    id: 'athletes',
    title: 'Athletes',
    where: 'Tab 5, Athletes',
    body: [
      'There are two ways onto the roster. Athletes who register online land here when you accept them in step 8. Paper sign-ups and walk-ins you add yourself: Bulk Add takes one name per line into a division, Single Add takes one at a time.',
      'Each athlete gets a lot number inside their division. That is the order for the first event, and the fallback order whenever two athletes are level.',
    ],
    publicSide:
      'Roster names appear on the live scoreboard as soon as the meet is listed, with a dash in every event column until scores come in. Add only athletes you expect to show up.',
    images: [{ src: '/guide/08-athletes.png', alt: 'The Athletes tab with rosters under each division' }],
  },
  {
    id: 'listing',
    title: 'List it and open entries',
    where: 'Tab 6, Listing',
    body: [
      'Tick Listed to put the meet in Find a Show. The three status dropdowns are the badges the public sees: competition status (upcoming, live, completed), registration status (open, waitlist, closed, day-of only) and results status.',
      'Fill in the venue, the federation or format, the entry fee as you want it displayed, the deadline, an athlete cap and a contact. No money moves through the site; the fee line tells athletes how you want to be paid. Save Listing Settings writes it straight to the server.',
    ],
    publicSide:
      'This tab is the public face of the show. The card in Find a Show, the show page and the top of the registration page are all built from it, and the capacity line counts accepted entries against your cap.',
    images: [
      { src: '/guide/09-listing.png', alt: 'The Listing tab with the meet listed, registration open and venue details filled in' },
      { src: '/guide/12-show-card.png', alt: 'The resulting card in Find a Show with divisions and implements', caption: 'The card athletes see in Find a Show.' },
      { src: '/guide/13-show-page.png', alt: 'The public show page built from the listing', caption: 'The show page at zerotacky.com/shows/your-slug.' },
    ],
    link: { label: 'Find a Show', href: '/shows' },
  },
  {
    id: 'registrations',
    title: 'Approve registrations',
    where: 'Tab 7, Registrations',
    body: [
      'An athlete picks a division, gives a name, email, emergency contact and date of birth, signs the waiver and submits. They do not need an account. Under-18s are entered by a parent or guardian.',
      'Each entry shows up here as Pending with the division and the signed waiver. Accept adds the athlete to that division roster with the next lot number; Decline removes them. Emergency contacts and dates of birth are visible to you only.',
    ],
    publicSide:
      'The athlete sees Pending, then Registered or Declined, on their My Meets page if they signed in. Accepted entries count toward the capacity line on the registration page.',
    images: [
      { src: '/guide/14-register.png', alt: 'The public registration form showing divisions with target weights and the athlete fields', caption: 'What the athlete fills in.' },
      { src: '/guide/10-registrations.png', alt: 'The Registrations tab with two pending entries and Accept and Decline buttons', caption: 'What you see.' },
    ],
  },
  {
    id: 'meetday',
    title: 'Meet day codes and screens',
    where: 'Tab 8, Meet Day',
    body: [
      'The six-character join code is how volunteer phones attach to your meet. Print Both gives you two QR codes for the gym wall: one for judges and pit crew, one for the live scoreboard. Rotate the code if it gets out to people who should not have it; phones signed in to your account are unaffected.',
      'Volunteers open Join a Meet, enter the code and pick a role. Athlete and Spectator are read-only. Pit crew get the loading calculator. Judge and Promoter also type the admin PIN from step 2.',
      'The scorer link is for your own phone. The TV link is a full-width standings table for a laptop plugged into the gym TV.',
    ],
    publicSide:
      'The scoreboard link is public and needs no sign-in. Share it with spectators and put the TV layout on a screen in the gym.',
    images: [
      { src: '/guide/11-meet-day.png', alt: 'The Meet Day tab with the join code, QR codes and the scorer, join and TV links' },
      { src: '/guide/16-join.png', alt: 'The Join a Meet page with a code entered', caption: 'What a volunteer sees after scanning the join QR.' },
    ],
    link: { label: 'Join a Meet', href: '/join' },
  },
  {
    id: 'scoreboard',
    title: 'The live scoreboard',
    where: 'zerotacky.com/m/your-slug',
    body: [
      'As judges score, the board updates on every phone and TV that has it open. Each division is its own table, with one column per event and the total on the right. The strips at the top show who is up on each station, and the chips filter to one division.',
      'When the last event is in, go back to the Listing tab and set competition status to Completed and results to Final. The show moves to Completed on every athlete\'s My Meets page and the standings stay up as the record of the day.',
    ],
    publicSide:
      'This is the page spectators share. It works on any phone with no app and no account, and it keeps the final standings after the show.',
    images: [{ src: '/guide/15-scoreboard.png', alt: 'The live scoreboard with station strips, division filter chips and a per-event standings table' }],
    link: { label: 'See a demo board', href: '/m/keystone-fall-brawl-2026' },
  },
];

export const FIRST_SHOW_OUTRO = {
  title: 'After the show',
  body: 'Set the statuses to Completed and Final on the Listing tab and the show becomes a record: the public page and scoreboard stay up, and it moves to Completed on every athlete\'s My Meets. A video walkthrough of this guide is coming after our first full show.',
};
