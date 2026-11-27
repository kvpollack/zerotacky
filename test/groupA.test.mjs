// UI group A (11/27): defects and pass 1 corrections from the signed-in review (audits/ui-audit-merged-part2-2026-11-27.md,
// findings S2, S3, S4, S6, S12, S23, S24, S26). Formatter behaviour, plus source and CSS guards that keep each fix in place.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const F = await import(`${process.env.ZT_ROOT || '..'}/lib/website/sheetFormat.ts`);
const { describeShowLifecycle } = await import(`${process.env.ZT_ROOT || '..'}/lib/website/filters.ts`);
const css = read('app/globals.css');

describe('S12 place lines', () => {
  test('placeLine never ends in a comma and never prints the filler', () => {
    assert.equal(F.placeLine('York', 'PA'), 'York, PA');
    assert.equal(F.placeLine('Oslo', ''), 'Oslo');
    assert.equal(F.placeLine('Oslo', 'Not provided'), 'Oslo');
    assert.equal(F.placeLine('', 'PA'), 'PA');
    assert.equal(F.placeLine('Not provided', 'not provided'), '');
    assert.equal(F.placeLine(null, undefined), '');
    assert.equal(F.placeLine(' York ', ' PA '), 'York, PA');
  });
  test('venueWithPlace joins what is on file', () => {
    assert.equal(F.venueWithPlace({ facilityName: 'The Power Plant Gym', city: 'York', state: 'PA' }), 'The Power Plant Gym, York, PA');
    assert.equal(F.venueWithPlace({ city: 'Oslo', state: '' }), 'Oslo');
    assert.equal(F.venueWithPlace({ facilityName: 'Not provided', city: 'Not provided', state: 'Not provided' }), '');
    assert.equal(F.venueWithPlace(null), '');
    assert.equal(F.venueWithPlace({ facilityName: 'York', city: 'York', state: 'PA' }), 'York, PA');
  });
  test('the show band and the register band use the same header formatter', () => {
    assert.ok(read('components/website/ShowDetailClient.tsx').includes("'Date not set', venueWithPlace(show.venue)]"));
    assert.ok(read('components/register/RegisterClient.tsx').includes('venueWithPlace(meet.listing.venue)'));
  });
});

describe('S12 / S24 registration phrase', () => {
  test('the short phrase drops the repeated word and the N/A', () => {
    assert.equal(F.registrationShort('open'), 'Open');
    assert.equal(F.registrationShort('closed'), 'Closed');
    assert.equal(F.registrationShort('waitlist'), 'Waitlist only');
    assert.equal(F.registrationShort('day_of_only'), 'Day-of entry only');
    assert.equal(F.registrationShort('not_provided'), 'Not provided');
    assert.equal(F.registrationShort('not_applicable'), null);
  });
  test('an open show at its cap reads Full · Waitlist', () => {
    assert.equal(F.registrationShort('open', { full: true }), 'Full · Waitlist');
    assert.equal(F.registrationShort('closed', { full: true }), 'Closed');
  });
  test('no lifecycle label says N/A', () => {
    for (const s of ['open', 'closed', 'waitlist', 'day_of_only', 'not_applicable', 'not_provided']) {
      assert.ok(!/N\/A/i.test(describeShowLifecycle('upcoming', s, 'not_started').registrationLabel), s);
    }
  });
  test('the register band, the notice and the final key carry the waitlist', () => {
    const src = read('components/register/RegisterClient.tsx');
    assert.ok(src.includes("regShort && `Registration: ${regShort}`"), 'band uses the short phrase');
    assert.ok(!src.includes('`Registration: ${life.registrationLabel}`'), 'the doubled band label is gone');
    assert.ok(src.includes("'Join the waitlist'"), 'final key names the waitlist');
    assert.ok(src.includes('data-testid="waitlist-line"'), 'the waitlist notice is a ruled line');
  });
});

describe('S26 one fee sentence', () => {
  test('the facts strip, the review and the confirmation share it', () => {
    const src = read('components/register/RegisterClient.tsx');
    for (const old of ['Collected by promoter', 'the promoter collects payment<', 'Standard entry fee', 'will collect payment directly']) {
      assert.ok(!src.includes(old), `old fee wording remains: ${old}`);
    }
    assert.equal(src.split('{FEE_WHO}').length - 1, 4);
  });
});

describe('S23 admin stamps and notices', () => {
  test('stampDateTime is day, month, year, 24 h time', () => {
    assert.equal(F.stampDateTime(new Date(2026, 10, 20, 8, 22, 19)), '20 Nov 2026, 08:22');
    assert.equal(F.stampDateTime(new Date(2027, 0, 3, 17, 5, 0)), '3 Jan 2027, 17:05');
    assert.equal(F.stampDateTime('not a date'), '');
    assert.equal(F.stampDateTime(null), '');
  });
  test('both queues use the shared stamp and notice', () => {
    for (const f of ['components/website/AdminClaimsClient.tsx', 'components/website/AdminExternalShowsClient.tsx']) {
      const src = read(f);
      assert.ok(!src.includes('toLocaleString('), `${f} still formats a date with toLocaleString`);
      assert.ok(src.includes('stampDateTime('), `${f} does not use stampDateTime`);
      assert.ok(src.includes('<QueueNotice'), `${f} does not use QueueNotice`);
    }
  });
  test('the claim card breaks only inside an address', () => {
    const src = read('components/website/AdminClaimsClient.tsx');
    assert.ok(!src.includes('break-all'), 'break-all splits ordinary words');
    assert.ok(src.includes('[overflow-wrap:anywhere]'));
  });
});

describe('S6 a disabled key prints its reason', () => {
  const sites = [
    ['components/website/AdminClaimsClient.tsx', 'claim-why-'],
    ['components/website/AccountClient.tsx', 'save-profile-why'],
    ['components/website/AccountClient.tsx', 'username-why'],
    ['components/website/MyGymClient.tsx', 'save-why-'],
    ['components/promoter/TransferSection.tsx', 'transfer-why'],
  ];
  for (const [f, id] of sites) {
    test(`${f} ${id}`, () => {
      const src = read(f);
      assert.ok(src.includes('<KeyReason id='), 'no KeyReason');
      assert.ok(new RegExp(`aria-describedby=\\{[^}]*${id}`).test(src), `the key does not point at ${id}`);
    });
  }
  test('the approve reason is no longer a title', () => {
    assert.ok(!/title=\{r\.user_id/.test(read('components/website/AdminClaimsClient.tsx')));
  });
  test('the show page has no dead registration key', () => {
    const src = read('components/website/ShowDetailClient.tsx');
    assert.ok(!/<button type="button" disabled className=/.test(src));
  });
});

describe('S12 dashboard', () => {
  const src = read('components/promoter/PromoterDashboardClient.tsx');
  test('My Meets leads, the athlete block follows', () => {
    assert.ok(src.indexOf('aria-labelledby="my-meets-heading"') < src.indexOf('<AthleteMeetsSection />'));
  });
  test('the Reg form key shows only while the form takes entries', () => {
    assert.ok(/\{takesEntries && <Link href=\{`\/register\/\$\{m\.slug\}`\}/.test(src));
  });
});

describe('S3 native controls follow the sheet mode', () => {
  test('bright web is light, dark web is dark, checks take pen', () => {
    assert.ok(/\[data-zt-web\] \{ color-scheme: light; accent-color: var\(--pen\); \}/.test(css));
    assert.ok(/\[data-zt-web\]\[data-zt-mode='dark'\] \{ color-scheme: dark; \}/.test(css));
  });
  test('the reset comes after the theme block that set dark', () => {
    assert.ok(css.indexOf('[data-zt-web] { color-scheme: light;') > css.indexOf('[data-zt-theme] {'));
  });
});

describe('S4 ruled blocks', () => {
  const start = css.indexOf('@media screen {');
  const block = css.slice(start, css.indexOf('\n}\n', start));
  test('on screen the ground is the sheet and each cell draws its own rule', () => {
    assert.ok(start > 0, 'no @media screen block');
    assert.ok(/\.zt-block:not\([^)]*\) \{ background: var\(--sheet\); position: relative; \}/.test(block));
    assert.ok(block.includes('box-shadow: 1px 0 0 0 var(--rule-subtle), 0 1px 0 0 var(--rule-subtle), 1px 1px 0 0 var(--rule-subtle)'));
    assert.ok(block.includes('::after'), 'the right and bottom edge is repainted on top');
    for (const sel of block.split('\n').filter((l) => l.includes('.zt-block'))) assert.ok(sel.trim().startsWith('[data-zt-web] '), `not web-scoped: ${sel.trim().slice(0, 60)}`);
  });
  test('a ruled cell is outside the 68ch measure', () => {
    assert.ok(css.includes(':not(.zt-wide, .zt-block, td *, th *, .zt-block > *, .zt-block > .contents > *) { max-width: 68ch; }'));
  });
});

describe('S2 one editable grammar', () => {
  test('web values are ink at 400, placeholders muted at 400, scoped to the shell main', () => {
    assert.ok(/\[data-zt-web\] :where\(#zt-main\) :is\(input:not\([^)]*\), textarea, select\) \{ color: var\(--ink\); font-weight: 400; \}/.test(css));
    assert.ok(css.includes("[data-zt-web] :where(#zt-main) :is(input, textarea)::placeholder { color: var(--muted); font-weight: 400; opacity: 1; }"));
  });
  test('the scorer keeps its pen value', () => {
    assert.ok(css.includes('.zt-input { background: var(--sheet); border: 2px solid var(--rule); color: var(--pen);'));
  });
  // A placeholder is an example ("e.g. York", or "Lift, e.g. Log press") or one of these labels that name what to type.
  // A new placeholder has to pick a side: an example without "e.g." reads as a value already filled in.
  const HINTS = new Set([
    'Variation, your best, or why you love it', 'Weights, count, anything useful', 'Who it is for (optional)', 'Name or @username',
    '#rrggbb', 'Name as it appeared on the scoreboard', 'Name', 'Phone or email (private)', 'email or phone athletes may use',
    'Sponsor name', 'Search the directory by gym name', 'Show name, city, state or year', 'Find an athlete', 'none',
    'Lift', 'Result',
  ]);
  const files = [];
  for (const dir of ['components/website', 'components/register', 'components/promoter', 'components/auth']) {
    for (const f of readdirSync(join(ROOT, dir))) if (f.endsWith('.tsx')) files.push(`${dir}/${f}`);
  }
  files.push('lib/auth/profile.ts', 'lib/website/myGym.ts');
  test('every literal placeholder is an example with e.g. or a listed label', () => {
    const bad = [];
    for (const f of files) {
      const src = read(f);
      const texts = [];
      for (const m of src.matchAll(/placeholder(?:="([^"]*)"|: '([^']*)')/g)) texts.push(m[1] ?? m[2]);
      // an expression: every quoted alternative counts (i === 0 ? 'Lift, e.g. Log press' : 'Lift') but not the value a
      // condition compares against (unit === 'lb'); a template literal is read whole, since the quotes inside it are
      // fallbacks for a name, not placeholders
      for (const m of src.matchAll(/placeholder=\{([^\n]*?)\}(?=[\s/>])/g)) {
        const tpl = /^`([^`]*)`$/.exec(m[1].trim());
        if (tpl) texts.push(tpl[1]); else for (const q of m[1].matchAll(/([=!]==\s*)?'((?:[^'\\]|\\.)*)'/g)) if (!q[1]) texts.push(q[2]);
      }
      for (const text of texts) if (!/(^|, )e\.g\. /.test(text) && !HINTS.has(text)) bad.push(`${f}: ${text}`);
    }
    assert.deepEqual(bad, []);
  });
});
