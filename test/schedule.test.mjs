import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.env.ZT_ROOT || '..';
const S = await import(`${ROOT}/lib/website/schedule.ts`);
const R = await import(`${ROOT}/lib/promoter/rules.ts`);
const B = await import(`${ROOT}/lib/email/broadcast.ts`);
const M = await import(`${ROOT}/lib/promoter/supabaseApi.ts`);

describe('schedule: clock parsing', () => {
  test('accepts picker values and typed text, refuses nonsense', () => {
    assert.equal(S.normalizeClock('09:00'), '09:00');
    assert.equal(S.normalizeClock('9:00'), '09:00');
    assert.equal(S.normalizeClock('9am'), '09:00');
    assert.equal(S.normalizeClock('9:30 PM'), '21:30');
    assert.equal(S.normalizeClock('12 am'), '00:00');
    assert.equal(S.normalizeClock('12:15pm'), '12:15');
    assert.equal(S.normalizeClock('0900'), '09:00');
    assert.equal(S.normalizeClock('930'), '09:30');
    assert.equal(S.normalizeClock('13pm'), null);
    assert.equal(S.normalizeClock('24:00'), null);
    assert.equal(S.normalizeClock('noon'), null);
    assert.equal(S.normalizeClock(''), null);
    assert.equal(S.normalizeClock(9), null);
  });
  test('formatClock prints 12-hour', () => {
    assert.equal(S.formatClock('00:05'), '12:05 AM');
    assert.equal(S.formatClock('12:00'), '12:00 PM');
    assert.equal(S.formatClock('16:45'), '4:45 PM');
  });
});

describe('schedule: parse / clean / timeline', () => {
  test('parseSchedule keeps known keys with valid values and drops the rest', () => {
    const s = S.parseSchedule({ start: '09:00', weighInEnd: 'late', timezone: 'America/Chicago', notes: ' at the gym ', bogus: '1' });
    assert.deepEqual(s, { start: '09:00', timezone: 'America/Chicago', notes: 'at the gym' });
    assert.equal(S.parseSchedule(null), null);
    assert.equal(S.parseSchedule({}), null);
    assert.equal(S.parseSchedule({ timezone: 'Mars/Olympus' }), null);
    assert.equal(S.parseSchedule([]), null);
  });
  test('cleanSchedule: blank = null, order problems are named, typed times normalise', () => {
    assert.deepEqual(S.cleanSchedule({ start: '', checkIn: '' }), { schedule: null, problem: null });
    assert.deepEqual(S.cleanSchedule(null), { schedule: null, problem: null });
    const ok = S.cleanSchedule({ checkIn: '7am', weighInStart: '07:00', weighInEnd: '8:15', start: '9:00', estimatedEnd: '16:00', timezone: '', notes: '' });
    assert.equal(ok.problem, null);
    assert.deepEqual(ok.schedule, { checkIn: '07:00', weighInStart: '07:00', weighInEnd: '08:15', start: '09:00', estimatedEnd: '16:00' });
    assert.match(S.cleanSchedule({ start: 'nine' }).problem, /First event is not a time/);
    assert.match(S.cleanSchedule({ weighInStart: '08:00', weighInEnd: '07:00' }).problem, /Weigh-in must end after/);
    assert.match(S.cleanSchedule({ start: '09:00', estimatedEnd: '09:00' }).problem, /Estimated finish/);
    assert.match(S.cleanSchedule({ start: '09:00', weighInEnd: '09:30' }).problem, /close before the first event/);
    assert.match(S.cleanSchedule({ start: '09:00', timezone: 'Nowhere' }).problem, /Time zone/);
    assert.match(S.cleanSchedule({ notes: 'x'.repeat(201) }).problem, /too long/);
    assert.deepEqual(S.cleanSchedule({ notes: 'Doors at the side entrance' }).schedule, { notes: 'Doors at the side entrance' });
  });
  test('timeline joins windows and marks the day-before row', () => {
    const rows = S.scheduleTimeline({ eveWeighInStart: '17:00', eveWeighInEnd: '19:00', checkIn: '07:00', weighInStart: '07:00', weighInEnd: '08:15', rulesMeeting: '08:30', start: '09:00', estimatedEnd: '16:00' });
    assert.deepEqual(rows.map((r) => [r.label, r.value, Boolean(r.dayBefore)]), [
      ['Weigh-in, day before', '5:00 PM to 7:00 PM', true],
      ['Check-in opens', '7:00 AM', false],
      ['Weigh-in', '7:00 AM to 8:15 AM', false],
      ['Rules meeting', '8:30 AM', false],
      ['First event', '9:00 AM', false],
      ['Estimated finish', '4:00 PM', false],
    ]);
    assert.deepEqual(S.scheduleTimeline({ weighInStart: '07:00' }), [{ label: 'Weigh-in', value: '7:00 AM' }]);
    assert.deepEqual(S.scheduleTimeline(null), []);
    assert.equal(S.hasScheduleTimes({ notes: 'x' }), false);
    assert.equal(S.hasScheduleTimes({ start: '09:00' }), true);
  });
  test('time zone defaults follow the venue state', () => {
    assert.equal(S.timeZoneForState('tn'), 'America/Chicago');
    assert.equal(S.timeZoneForState('AZ'), 'America/Phoenix');
    assert.equal(S.timeZoneForState('Not provided'), null);
    assert.equal(S.scheduleTimeZone({ timezone: 'America/Denver' }, 'TN'), 'America/Denver');
    assert.equal(S.scheduleTimeZone({}, 'CA'), 'America/Los_Angeles');
    assert.equal(S.scheduleTimeZone(null, null), 'America/New_York');
    assert.equal(S.timeZoneLabel('America/Chicago'), 'Central');
    assert.equal(S.timeZoneLabel('Europe/Berlin'), 'Berlin');
  });
});

describe('schedule: zoned time and ics', () => {
  test('zonedToUtc handles standard and daylight time', () => {
    assert.equal(S.zonedToUtc('2026-11-21', '09:00', 'America/New_York').toISOString(), '2026-11-21T14:00:00.000Z');
    assert.equal(S.zonedToUtc('2026-07-11', '09:00', 'America/New_York').toISOString(), '2026-07-11T13:00:00.000Z');
    assert.equal(S.zonedToUtc('2026-07-11', '09:00', 'America/Phoenix').toISOString(), '2026-07-11T16:00:00.000Z');
    assert.equal(S.zonedToUtc('2026-7-11', '09:00', 'America/Phoenix'), null);
    assert.equal(S.shiftIsoDate('2026-03-01', -1), '2026-02-28');
    assert.equal(S.shiftIsoDate('2026-12-31', 1), '2027-01-01');
  });
  test('buildShowIcs: timed event from the first thing on the timeline, day-before weigh-in as a second event', () => {
    const now = new Date('2026-11-06T12:00:00Z');
    const ics = S.buildShowIcs({
      slug: 'iron-harbor', name: 'Iron Harbor Classic; 2026', date: '2026-11-21', venueState: 'TN',
      location: 'Harbor Gym, 1 Main St, Memphis, TN 38103',
      schedule: { checkIn: '07:00', weighInStart: '07:00', weighInEnd: '08:15', start: '09:00', estimatedEnd: '16:00', eveWeighInStart: '17:00', eveWeighInEnd: '19:00' },
      url: 'https://www.zerotacky.com/shows/iron-harbor',
    }, now);
    assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
    assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
    assert.match(ics, /UID:show-iron-harbor@zerotacky\.com/);
    assert.match(ics, /DTSTAMP:20261106T120000Z/);
    assert.match(ics, /DTSTART:20261121T130000Z/);   // 07:00 Central = 13:00Z
    assert.match(ics, /DTEND:20261121T220000Z/);     // 16:00 Central
    assert.match(ics, /SUMMARY:Iron Harbor Classic\\; 2026/);
    assert.match(ics, /LOCATION:Harbor Gym\\, 1 Main St\\, Memphis\\, TN 38103/);
    assert.match(ics, /UID:show-iron-harbor-weighin@zerotacky\.com/);
    assert.match(ics, /DTSTART:20261120T230000Z/);   // 17:00 Central the day before
    assert.match(ics, /DTEND:20261121T010000Z/);
    assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
    for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, `folded: ${line.length}`);
    assert.match(ics, /Times are Central \(America\/Chicago\)/);
  });
  test('buildShowIcs: no schedule = all-day event, one VEVENT', () => {
    const ics = S.buildShowIcs({ slug: 's', name: 'Show', date: '2026-11-21', venueState: null, schedule: null, url: 'https://x/shows/s' });
    assert.match(ics, /DTSTART;VALUE=DATE:20261121/);
    assert.match(ics, /DTEND;VALUE=DATE:20261122/);
    assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
    assert.equal(S.icsHref('a b'), '/shows/a%20b/calendar.ics');
  });
  test('estimatedEnd before arrival falls back to eight hours', () => {
    const ics = S.buildShowIcs({ slug: 's', name: 'Show', date: '2026-11-21', venueState: 'NY', schedule: { start: '09:00', estimatedEnd: '08:00' }, url: 'https://x/shows/s' });
    assert.match(ics, /DTSTART:20261121T140000Z/);
    assert.match(ics, /DTEND:20261121T220000Z/);
  });
});

describe('schedule: listing contract', () => {
  const base = M.rowToMeetListing({});
  test('validateListingPatch refuses a bad schedule and passes a clean one', () => {
    assert.equal(R.validateListingPatch('2026-11-21', base, { schedule: { start: '09:00', checkIn: '07:00' } }), null);
    assert.match(R.validateListingPatch('2026-11-21', base, { schedule: { start: 'nine' } }), /First event/);
    assert.equal(R.validateListingPatch('2026-11-21', base, { schedule: null }), null);
  });
  test('row <-> listing mapping carries schedule and null clears', () => {
    const l = M.rowToMeetListing({ schedule: { start: '09:00', bogus: 'x' } });
    assert.deepEqual(l.schedule, { start: '09:00' });
    assert.equal(M.rowToMeetListing({ schedule: null }).schedule, null);
    assert.deepEqual(M.listingPatchToColumns({ schedule: { start: '09:00' } }), { schedule: { start: '09:00' } });
    assert.deepEqual(M.listingPatchToColumns({ schedule: null }), { schedule: null });
    assert.deepEqual(M.listingPatchToColumns({}), {});
  });
});

describe('schedule: reminder email quotes it', () => {
  const payload = {
    id: 'b1', kind: 'reminder_1d', audience: 'accepted', subject: '', body: '', test_only: false,
    meet_id: 'm1', meet_name: 'Iron Harbor', meet_date: '2026-11-21', meet_slug: 'iron-harbor',
    venue: { city: 'Memphis', state: 'TN' }, promoter_email: null, promoter_name: '', promoter_contact: null,
    schedule: { checkIn: '07:00', start: '09:00', notes: 'Park behind the gym.' }, recipients: [],
  };
  const r = { id: 'r1', registration_id: 'reg1', email: 'a@example.com', athlete_name: 'Ada', division_name: 'Open', mail_token: 'tok' };
  test('facts list check-in, first event, time zone; .ics link present; note leads the paragraph', () => {
    const m = B.reminderEmail(payload, r, 'https://www.zerotacky.com', 'd1');
    assert.match(m.text, /Check-in opens:? +7:00 AM/i);
    assert.match(m.text, /First event:? +9:00 AM/i);
    assert.match(m.text, /Time zone:? +Central/i);
    assert.match(m.text, /Park behind the gym\. Check the show page tonight for any late changes/);
    assert.match(m.text, /https:\/\/www\.zerotacky\.com\/shows\/iron-harbor\/calendar\.ics/);
  });
  test('without a schedule the old wording and no .ics link', () => {
    const m = B.reminderEmail({ ...payload, schedule: null, kind: 'reminder_7d' }, r, 'https://www.zerotacky.com', 'd1');
    assert.match(m.text, /Weigh-in times, the schedule and anything about the fee come from the promoter/);
    assert.doesNotMatch(m.text, /calendar\.ics/);
  });
});
