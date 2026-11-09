import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.env.ZT_ROOT || '..';
const R = await import(`${ROOT}/lib/website/meetReport.ts`);
const HR = await import(`${ROOT}/lib/website/hostingRecord.ts`);
const S = await import(`${ROOT}/lib/website/standingsAdapter.ts`);
const F = await import(`${ROOT}/lib/website/fixtures.ts`);

const completed = F.DEMO_SHOW_RECORDS.find((s) => s.competitionStatus === 'completed' && s.resultsStatus === 'final');
const upcoming = F.DEMO_SHOW_RECORDS.find((s) => s.competitionStatus === 'upcoming');

describe('meetReport.buildMeetReport', () => {
  test('a completed demo show: totals, a podium per division, event winners, no origins block', () => {
    assert.ok(completed, 'fixtures ship a completed final show');
    const r = R.buildMeetReport(completed, S.buildAllDivisionResultsViews(completed), null);
    assert.equal(r.showSlug, completed.slug);
    assert.equal(r.isFinal, true);
    assert.equal(r.totals.entered, completed.state.athletes.length);
    assert.equal(r.totals.divisions, completed.state.divisions.length);
    assert.equal(r.totals.events, completed.state.events.length);
    assert.ok(r.totals.scored > 0 && r.totals.scored <= r.totals.entered);
    assert.equal(r.divisions.length, completed.state.divisions.length);
    const withPodium = r.divisions.filter((d) => d.podium.length > 0);
    assert.ok(withPodium.length > 0);
    for (const d of withPodium) {
      assert.ok(d.podium.length <= 3 || d.podium.some((p) => p.tied), 'at most three places unless tied');
      assert.ok(d.podium.every((p) => p.place >= 1 && p.place <= 3 && p.points > 0));
      assert.equal(d.entered, completed.state.athletes.filter((a) => a.divisionId === d.id).length);
    }
    assert.ok(r.eventWinners.length > 0);
    assert.ok(r.eventWinners.every((e) => e.winners.every((w) => w.name && w.division && w.display)));
    assert.equal(r.origins, null);
    assert.equal(r.isDemo, true);
  });
  test('origins are passed through; host gym comes from the summary; CSV carries the headline rows', () => {
    const origins = { linked: 5, public: 3, homeGyms: [{ name: 'Iron Harbor', slug: 'iron-harbor', n: 2 }, { name: 'Garage', slug: null, n: 1 }] };
    const show = { ...completed, hostGymSlug: 'iron-harbor', hostGymName: 'Iron Harbor Strength' };
    const r = R.buildMeetReport(show, S.buildAllDivisionResultsViews(show), origins);
    assert.deepEqual(r.hostGym, { slug: 'iron-harbor', name: 'Iron Harbor Strength' });
    assert.equal(r.origins.homeGyms.length, 2);
    const csv = R.meetReportCsv(r);
    assert.match(csv, /^Show,/);
    assert.match(csv, /Host gym,Iron Harbor Strength/);
    assert.match(csv, /Results,Final/);
    assert.match(csv, /Division,Place,Athlete,Points,Event wins/);
    assert.match(csv, /Event,Division,Winner,Result/);
    assert.match(csv, /Home gym,Athletes\r\nIron Harbor,2\r\nGarage,1/);
    assert.equal(R.meetReportFilename(r), `${completed.slug}-report.csv`);
    assert.equal(R.reportHref('a b'), '/shows/a%20b/report');
  });
  test('an upcoming show reports zero scored and empty podiums without throwing', () => {
    assert.ok(upcoming);
    const r = R.buildMeetReport(upcoming, S.buildAllDivisionResultsViews(upcoming), null);
    assert.equal(r.isFinal, false);
    assert.ok(r.divisions.every((d) => d.podium.length === 0));
    assert.deepEqual(r.eventWinners, []);
  });
});

describe('hostingRecord.buildHostingRecord', () => {
  const s = (slug, date, competitionStatus, extra = {}) => ({ slug, date, competitionStatus, ...extra });
  test('splits upcoming from past, newest past first, counts and date span, reportable = completed non-external', () => {
    const rec = HR.buildHostingRecord([
      s('a', '2026-05-02', 'completed'), s('b', '2026-12-05', 'upcoming'), s('c', '2026-10-24', 'completed'),
      s('d', '2026-11-01', 'upcoming'), s('e', '2026-09-01', 'completed', { externalUrl: 'https://x.test' }), s('f', '2026-11-08', 'live'),
    ], '2026-11-08');
    assert.deepEqual(rec.upcoming.map((x) => x.slug), ['f', 'b'], 'live counts as upcoming; a dated-past "upcoming" show is past');
    assert.deepEqual(rec.past.map((x) => x.slug), ['d', 'c', 'e', 'a']);
    assert.equal(rec.total, 6);
    assert.equal(rec.firstDate, '2026-05-02');
    assert.equal(rec.lastDate, '2026-12-05');
    assert.deepEqual([...rec.reportable].sort(), ['a', 'c']);
  });
  test('empty list', () => {
    const rec = HR.buildHostingRecord([], '2026-11-08');
    assert.equal(rec.total, 0);
    assert.equal(rec.firstDate, null);
    assert.equal(rec.reportable.size, 0);
  });
});

test('buildMeetReport omits the venue when the data layer only has "Not provided" placeholders', () => {
  const show = { ...completed, venue: { city: 'Not provided', state: 'Not provided', country: 'US' } };
  const r = R.buildMeetReport(show, S.buildAllDivisionResultsViews(show), null);
  assert.equal(r.venue, '');
  const partial = { ...completed, venue: { facilityName: 'Hercules Gym', city: 'Not provided', state: 'Not provided', country: 'US' } };
  assert.equal(R.buildMeetReport(partial, S.buildAllDivisionResultsViews(partial), null).venue, 'Hercules Gym');
});
