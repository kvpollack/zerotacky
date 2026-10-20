# Argon prompt: strongman + powerlifting gym collector (2026-10-20, Slate for Kurt)

Paste from the line below into Argon. Context for us: output lands in the `gyms` table as `unclaimed` listings
(ROADMAP s6), facts only, Google/Yelp excluded, CrossFit skipped (Kurt 10/20).

---

You are building the seed list for a public gym directory on ZeroTacky, a strongman meet platform. The directory
helps travelling athletes find a place to train with real strongman or powerlifting equipment. Gym owners will
later claim and edit their own listing, so your job is an accurate starting point, not a finished profile.

## What to collect
US gyms (all 50 states plus DC) that fit one of these:
- **strongman**: the gym's own site or a federation page says it has strongman implements or hosts strongman
  training (log, axle, yoke, farmer's handles, Atlas stones, sandbags, kegs, circus dumbbell, and so on).
- **powerlifting**: a dedicated powerlifting or barbell club (competition bars, calibrated plates, monolift or
  combo racks, a lifting team, hosts meets). Not a commercial chain that merely has squat racks.
- **mixed**: clearly both.
Skip CrossFit boxes and commercial chains (Planet Fitness, Crunch, LA Fitness, Anytime, Gold's franchises) even if
a location has a yoke. Skip gyms that are permanently closed or have no verifiable address.

## Sources you may use
- The gym's own website and its own Instagram or Facebook page.
- Federation and sanctioning lists: Strongman Corporation affiliate gyms, United States Strongman (USS) gym and
  promoter pages, USAPL and USPA member gym or club lists, state powerlifting association club pages.
- Meet listings that name a host gym (ZeroTacky, federation calendars, OpenPowerlifting meet pages).
- OpenStreetMap (tag `leisure=fitness_centre` with strongman/powerlifting in the name or description).
- Reddit r/Strongman and r/powerlifting "gyms near X" threads only as leads; confirm every lead on the gym's own
  site before it goes in the file.

## Sources you may not use
Google Maps, Google Places, Google Business Profiles, Yelp, Apple Maps, Foursquare, Mindbody listings. Their terms
forbid storing their data. Do not copy any gym's descriptive text or photos; we only want facts.

## Output
One CSV per batch, UTF-8, comma separated, double quotes around any field containing a comma, header row exactly:

name,street,city,state,zip,website,phone,instagram,gym_type,equipment_mentioned,day_pass_text,source_url,evidence,checked_date,confidence

Field rules:
- `name`: as the gym writes it, no "LLC" unless it is part of the public name.
- `street`, `city`, `state` (2-letter), `zip` (5 digits): from the gym's own site or a federation page. Blank if
  not stated; never guess a zip.
- `website`: full URL with https. `phone`: digits and dashes, blank if not public. `instagram`: handle without @.
- `gym_type`: one of `strongman`, `powerlifting`, `mixed`.
- `equipment_mentioned`: semicolon-separated ids ONLY from this list, only when the source states the item:
  `log;axle;yoke;farmers;frame;stones;natural_stones;sandbags;kegs;circus_db;husafell;conans_wheel;viking_press;loading_platform;car_deadlift;pull_harness;arm_over_arm;tire;power_stairs;turf_lane;comp_bars;calibrated_plates;monolift;combo_rack;deadlift_platform`.
  Blank if the site does not list equipment. Do not infer "yoke" from "strongman gym".
- `day_pass_text`: a verbatim phrase from the site about drop-ins or day passes ("$20 day pass", "drop-ins
  welcome, text ahead"), max 120 characters, blank if not stated.
- `source_url`: the page you confirmed the gym on. Required; a row without it will be dropped.
- `evidence`: one sentence quoted from the source that shows it fits (max 200 characters).
- `checked_date`: today, YYYY-MM-DD.
- `confidence`: `high` (own site confirms type and address), `medium` (federation page or social confirms, address
  partial), `low` (lead only). Low rows are kept in a separate review file, so include them but mark them.

## Working rules
- Blank beats guessed, every time. A wrong address helps nobody and we have to remove it later.
- One row per physical location. A gym with two locations is two rows.
- Dedupe by name + zip before you send a batch.
- No owner names, no personal emails, no home addresses. Business contact details only.
- Work by region so batches are checkable: Northeast, Southeast, Midwest, Southwest, West, then a sweep for
  anything the federation lists have that the regions missed. Expect a few hundred strongman gyms and a few
  hundred powerlifting clubs nationally; if a region returns thousands, you are counting commercial gyms.
- Start with Pennsylvania, Tennessee, Kentucky, Alabama, and Georgia so we can load a first batch quickly.
- After each batch, list the sources you leaned on and anything you could not resolve (gyms with two addresses,
  possibly closed, name changes). Keep that list short and factual.
