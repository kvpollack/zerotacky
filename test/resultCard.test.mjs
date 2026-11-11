// IG result card data (11/10 night): the card reads the same adapter as the standings table.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.env.ZT_ROOT || '..';
const RC = await import(`${ROOT}/lib/website/resultCard.ts`);
const F = await import(`${ROOT}/lib/website/fixtures.ts`);
const SA = await import(`${ROOT}/lib/website/standingsAdapter.ts`);
const IMG = await import(`${ROOT}/lib/website/resultCardImage.tsx`).catch(() => null);

const completed = F.DEMO_SHOW_RECORDS.filter((s) => s.competitionStatus === 'completed');
const upcoming = F.DEMO_SHOW_RECORDS.find((s) => s.competitionStatus !== 'completed' && s.competitionStatus !== 'live');

describe('buildResultCardData', () => {
  test('every placed athlete on every completed demo show gets a card that agrees with the standings table', () => {
    assert.ok(completed.length >= 1);
    let cards = 0;
    for (const show of completed) {
      for (const view of SA.buildAllDivisionResultsViews(show)) {
        for (const row of view.standings) {
          const data = RC.buildResultCardData(show, row.athleteId);
          assert.ok(data, `${show.slug} ${row.athleteName}`);
          cards++;
          assert.equal(data.athleteName, row.athleteName);
          assert.equal(data.divisionName, view.division.name);
          assert.equal(data.totalPoints, row.totalPoints);
          assert.equal(data.eventWins, row.eventWins);
          if (data.place !== null) {
            assert.equal(data.place, row.overallPlace);
            assert.equal(data.isTied, Boolean(row.isTiedOverall));
            assert.match(data.placeLabel, /^(T-)?\d+(st|nd|rd|th) of \d+$/);
          } else {
            assert.equal(data.placeLabel, 'Scratched');
          }
          assert.equal(data.events.length, show.state.events.length);
          for (const e of data.events.filter((e) => e.scored)) {
            const cell = row.eventBreakdown[show.state.events.find((x) => x.eventNumber === e.eventNumber).id];
            assert.equal(e.display, cell.display); assert.equal(e.points, cell.points); assert.equal(e.place, cell.place);
          }
          assert.equal(data.isDemo, true);
          assert.ok(['Official Final', 'Provisional'].includes(data.statusLabel));
          assert.ok(data.dateLabel.length > 4);
        }
      }
    }
    assert.ok(cards >= 5, `only ${cards} cards`);
  });
  test('field size counts the scored field, so place never exceeds it', () => {
    for (const show of completed) {
      for (const a of show.state.athletes) {
        const d = RC.buildResultCardData(show, a.id);
        if (d && d.place !== null) assert.ok(d.place <= d.fieldSize, `${show.slug} ${a.name} ${d.placeLabel}`);
      }
    }
  });
  test('tied place label carries T-', () => {
    const show = structuredClone(completed[0]);
    const div = show.state.divisions[0];
    const ids = show.state.athletes.filter((a) => a.divisionId === div.id).map((a) => a.id).slice(0, 2);
    assert.equal(ids.length, 2);
    // copy athlete 1's results onto athlete 2 so they are level everywhere
    show.suppliedDivisionPlacements = undefined;
    show.state.results = show.state.results.map((r) => (r.athleteId === ids[1] ? { ...show.state.results.find((x) => x.athleteId === ids[0] && x.eventId === r.eventId) ?? r, athleteId: ids[1], id: `${r.eventId}_${ids[1]}` } : r));
    const d = RC.buildResultCardData(show, ids[1]);
    assert.ok(d.isTied, 'tied'); assert.match(d.placeLabel, /^T-/);
  });
  test('upcoming show, unknown athlete, unknown division: null', () => {
    if (upcoming) assert.equal(RC.buildResultCardData(upcoming, upcoming.state.athletes[0]?.id ?? 'x'), null);
    assert.equal(RC.buildResultCardData(completed[0], 'nobody'), null);
  });
});

describe('sizes, hrefs, file names', () => {
  test('three sizes with IG / FB dimensions', () => {
    assert.deepEqual(Object.entries(RC.RESULT_CARD_SIZES).map(([k, v]) => [k, v.width, v.height]), [['square', 1080, 1080], ['story', 1080, 1920], ['link', 1200, 630]]);
    for (const k of ['square', 'story', 'link']) assert.ok(RC.isResultCardSize(k));
    assert.equal(RC.isResultCardSize('portrait'), false);
  });
  test('href encodes slug and athlete id', () => {
    assert.equal(RC.resultCardHref('iron-valley-summer-slam-2026', 'a 1', 'story'), '/shows/iron-valley-summer-slam-2026/card/a%201?size=story');
  });
  test('file name is safe and names the athlete, meet and size', () => {
    const d = RC.buildResultCardData(completed[0], SA.buildAllDivisionResultsViews(completed[0])[0].standings[0].athleteId);
    const f = RC.resultCardFileName(d, 'square');
    assert.match(f, /^[a-z0-9-]+-square\.png$/);
    assert.ok(f.includes(d.athleteName.split(' ')[0].toLowerCase()));
  });
  test('PLACE_SUFFIX: 1st 2nd 3rd 4th 11th 12th 13th 21st 22nd 23rd 101st 111th', () => {
    assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(RC.PLACE_SUFFIX), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th']);
  });
});

describe('renderer text helpers', { skip: !IMG }, () => {
  test('fitMono shrinks long names and never goes under the floor', () => {
    assert.equal(IMG.fitMono('Jo', 900, 72, 30), 72);
    assert.equal(IMG.fitMono('A'.repeat(60), 900, 72, 30), 30);
    assert.ok(IMG.fitMono('Alexandria Montgomery-Whitfield', 900, 72, 30) < 72);
  });
  test('clip adds an ellipsis only when needed', () => {
    assert.equal(IMG.clip('Short', 10), 'Short');
    assert.equal(IMG.clip('A very long meet name indeed', 10), 'A very lo…');
    assert.equal(IMG.clip('A very long meet name indeed', 10).length, 10);
  });
});
