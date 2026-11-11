// 11/11: account age rule behind the sign-up date-of-birth field (lib/auth/age.ts). Pure date arithmetic.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const A = await import('../lib/auth/age.ts');
const today = new Date(Date.UTC(2026, 10, 11)); // 2026-11-11

describe('parseDob', () => {
  test('accepts real ISO dates only', () => {
    assert.equal(A.parseDob('2010-02-28'), '2010-02-28');
    assert.equal(A.parseDob(' 2010-02-28 '), '2010-02-28');
    assert.equal(A.parseDob('2010-02-30'), null);
    assert.equal(A.parseDob('02/28/2010'), null);
    assert.equal(A.parseDob(''), null);
    assert.equal(A.parseDob(20100228), null);
  });
});

describe('ageOn and the 13-year rule', () => {
  test('birthday today counts, tomorrow does not', () => {
    assert.equal(A.ageOn('2013-11-11', today), 13);
    assert.equal(A.ageOn('2013-11-12', today), 12);
    assert.equal(A.ageOn('2013-11-10', today), 13);
    assert.equal(A.ageOn('1990-01-01', today), 36);
  });
  test('dobProblem messages', () => {
    assert.equal(A.dobProblem('2013-11-11', today), null);
    assert.match(A.dobProblem('2013-11-12', today), /13 or older/);
    assert.match(A.dobProblem('2027-01-01', today), /does not look right/);
    assert.match(A.dobProblem('1850-01-01', today), /does not look right/);
    assert.match(A.dobProblem('nope', today), /Enter your date of birth/);
    assert.match(A.dobProblem('', today), /Enter your date of birth/);
  });
  test('latestAllowedDob is exactly 13 years back; isMinor under 18', () => {
    assert.equal(A.latestAllowedDob(today), '2013-11-11');
    assert.equal(A.isMinor('2009-01-01', today), true);
    assert.equal(A.isMinor('2008-11-11', today), false);
    assert.equal(A.MIN_ACCOUNT_AGE, 13);
  });
});
