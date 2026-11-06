import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.env.ZT_ROOT || '..';
const X = await import(`${ROOT}/lib/website/extras.ts`);
const M = await import(`${ROOT}/lib/promoter/supabaseApi.ts`);
const R = await import(`${ROOT}/lib/promoter/rules.ts`);
const C = await import(`${ROOT}/lib/promoter/contract.ts`);

const UID = '36970762-b3e1-43c2-87f0-d1093816f94e';

describe('livestream link (046, #17)', () => {
  test('https only, blank clears, bare domain gets https', () => {
    assert.deepEqual(X.cleanLivestreamUrl(' https://youtube.com/live/abc '), { url: 'https://youtube.com/live/abc', problem: null });
    assert.deepEqual(X.cleanLivestreamUrl('youtube.com/live/abc'), { url: 'https://youtube.com/live/abc', problem: null });
    assert.deepEqual(X.cleanLivestreamUrl(''), { url: null, problem: null });
    assert.equal(X.cleanLivestreamUrl('http://insecure.tv').url, null);
    assert.match(X.cleanLivestreamUrl('http://insecure.tv').problem, /https/);
    assert.equal(X.cleanLivestreamUrl(`https://x.y/${'a'.repeat(300)}`).url, null);
    assert.equal(X.httpsUrlOk('https://a b'), false);
    // MD-17: a scheme with no usable host is refused
    assert.equal(X.httpsUrlOk('https://?'), false);
    assert.equal(X.httpsUrlOk('https://localhost/x'), false);
    assert.equal(X.httpsUrlOk('https://x.y:8443/a?b=c#d'), true);
    assert.equal(X.cleanLivestreamUrl('https://?').url, null);
  });
});

describe('sponsors (046, #14)', () => {
  test('cleanSponsors drops blank rows, trims, refuses a link without a name and more than six', () => {
    const c = X.cleanSponsors([{ name: ' Iron Gym ', url: 'irongym.com', logoPath: '' }, { name: '', url: '', logoPath: '' }, { name: 'Chalk Co' }]);
    assert.deepEqual(c, { sponsors: [{ name: 'Iron Gym', url: 'https://irongym.com' }, { name: 'Chalk Co' }], problem: null });
    assert.match(X.cleanSponsors([{ name: '', url: 'https://x.y' }]).problem, /Sponsor 1 needs a name/);
    assert.match(X.cleanSponsors([{ name: 'A', url: 'ftp://x' }]).problem, /https/);
    assert.match(X.cleanSponsors([{ name: 'A', logoPath: '../etc/passwd' }]).problem, /logo/);
    assert.match(X.cleanSponsors(Array.from({ length: 7 }, (_, i) => ({ name: `S${i}` }))).problem, /Up to 6/);
    assert.deepEqual(X.cleanSponsors([]), { sponsors: null, problem: null });
  });
  test('parseSponsors is lenient on row data and keeps a valid logo path', () => {
    assert.deepEqual(X.parseSponsors([{ name: 'A', logoPath: `${UID}/logo-1.png`, url: 'http://no' }, 'junk', { url: 'https://x.y' }]),
      [{ name: 'A', logoPath: `${UID}/logo-1.png` }]);
    assert.equal(X.parseSponsors(null), null);
    assert.equal(X.parseSponsors([{ name: '' }]), null);
  });
  test('sponsorLogoUrl builds the public bucket URL and is empty without a path or base', () => {
    assert.equal(X.sponsorLogoUrl(`${UID}/logo-1.png`, 'https://p.supabase.co/'), `https://p.supabase.co/storage/v1/object/public/sponsor-logos/${UID}/logo-1.png`);
    assert.equal(X.sponsorLogoUrl(undefined, 'https://p.supabase.co'), '');
    assert.equal(X.sponsorLogoUrl('x/y.png', undefined), '');
    assert.equal(X.sponsorLogoProblem({ type: 'image/gif', size: 10 }), 'Use a JPG, PNG, or WebP logo.');
    assert.match(X.sponsorLogoProblem({ type: 'image/png', size: 2 * 1024 * 1024 }), /1 MB/);
    assert.equal(X.sponsorLogoProblem({ type: 'image/webp', size: 1000 }), null);
    assert.match(X.sponsorLogoObjectPath(UID, 'image/jpeg', 5), new RegExp(`^${UID}/logo-5\\.jpg$`));
  });
});

describe('staff (046, #12)', () => {
  test('cleanStaff needs a name and a known role; a row with only a role is dropped', () => {
    const c = X.cleanStaff([{ name: ' Pat ', role: 'head_judge', station: 'Station 1', contact: '', note: ' brings tape ' }, { name: '', role: 'judge', station: '', contact: '', note: '' }]);
    assert.deepEqual(c, { staff: [{ name: 'Pat', role: 'head_judge', station: 'Station 1', note: 'brings tape' }], problem: null });
    assert.match(X.cleanStaff([{ name: 'Pat', role: 'boss' }]).problem, /needs a role/);
    assert.match(X.cleanStaff([{ name: '', role: 'judge', note: 'x' }]).problem, /row 1 needs a name/);
    assert.match(X.cleanStaff([{ name: 'Pat', role: 'judge', note: 'n'.repeat(161) }]).problem, /note is over 160/);
    assert.deepEqual(X.cleanStaff([]), { staff: null, problem: null });
  });
  test('parseStaff drops rows with unknown roles and clips long fields', () => {
    assert.deepEqual(X.parseStaff([{ name: 'A', role: 'judge', station: 'A' }, { name: 'B', role: 'boss' }, { name: 'C', role: 'medic', note: 'x'.repeat(200) }]),
      [{ name: 'A', role: 'judge', station: 'A' }, { name: 'C', role: 'medic', note: 'x'.repeat(160) }]);
    assert.equal(X.staffRoleLabel('state_rep'), 'State rep');
    assert.equal(X.staffRoleLabel('nope'), 'Other');
  });
  test('staffByStation groups by station id, matches old label rows loosely, floating last (MD-15)', () => {
    const stations = [{ id: 'A', label: 'Station 1' }, { id: 'B', label: 'Station 2' }];
    const g = X.staffByStation([
      { name: 'A', role: 'judge', station: 'station 2' },
      { name: 'B', role: 'loader', station: 'A' },
      { name: 'C', role: 'scorer' },
      { name: 'D', role: 'judge', station: 'Platform X' },
    ], stations);
    assert.deepEqual(g.map((x) => [x.station, x.label, x.people.map((p) => p.name)]), [['A', 'Station 1', ['B']], ['B', 'Station 2', ['A']], ['Platform X', 'Platform X', ['D']], ['', '', ['C']]]);
    // two stations with one label: an id row lands on its own station, a label row on the first only
    const dup = [{ id: 'A', label: 'Station 1' }, { id: 'B', label: 'Station 1' }];
    const h = X.staffByStation([{ name: 'P', role: 'judge', station: 'B' }, { name: 'Q', role: 'judge', station: 'Station 1' }], dup);
    assert.deepEqual(h.map((x) => [x.station, x.people.map((p) => p.name)]), [['A', ['Q']], ['B', ['P']]]);
  });
});

describe('listing plumbing (046)', () => {
  test('rowToMeetListing / listingPatchToColumns carry the three fields; emptyListing has them null', () => {
    const l = M.rowToMeetListing({ sponsors: [{ name: 'A', url: 'https://a.b' }], livestream_url: 'https://t.tv/x', staff: [{ name: 'P', role: 'judge' }] });
    assert.deepEqual(l.sponsors, [{ name: 'A', url: 'https://a.b' }]);
    assert.equal(l.livestreamUrl, 'https://t.tv/x');
    assert.deepEqual(l.staff, [{ name: 'P', role: 'judge' }]);
    assert.equal(M.rowToMeetListing({ livestream_url: 'http://t.tv/x' }).livestreamUrl, null);
    const cols = M.listingPatchToColumns({ sponsors: null, livestreamUrl: ' https://t.tv/x ', staff: [{ name: 'P', role: 'judge' }] });
    assert.deepEqual(cols, { sponsors: null, livestream_url: 'https://t.tv/x', staff: [{ name: 'P', role: 'judge' }] });
    const e = C.emptyListing();
    assert.equal(e.sponsors, null); assert.equal(e.livestreamUrl, null); assert.equal(e.staff, null);
  });
  test('validateListingPatch names the problem row', () => {
    const cur = C.emptyListing();
    assert.match(R.validateListingPatch('2026-06-01', cur, { sponsors: [{ name: '', url: 'https://x.y' }] }), /Sponsor 1 needs a name/);
    assert.match(R.validateListingPatch('2026-06-01', cur, { livestreamUrl: 'http://x.y' }), /https/);
    assert.match(R.validateListingPatch('2026-06-01', cur, { staff: [{ name: 'P', role: 'boss' }] }), /needs a role/);
    assert.equal(R.validateListingPatch('2026-06-01', cur, { sponsors: [{ name: 'A' }], livestreamUrl: 'https://x.y', staff: [{ name: 'P', role: 'judge' }] }), null);
  });
});
