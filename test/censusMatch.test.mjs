import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const { censusMatchAgrees } = await import('../lib/geo/censusMatch.ts');

// Astra G-L2 (10/21): a Census match counts only when its components are present and agree with the request.
const req = { street: '717 School Street', city: 'Pawtucket', state: 'RI', zip: '02860' };
const good = { matchedAddress: '717 SCHOOL ST, PAWTUCKET, RI, 02860', coordinates: { x: -71.37433, y: 41.85886 }, addressComponents: { city: 'PAWTUCKET', state: 'RI', zip: '02860' } };

describe('censusMatchAgrees', () => {
  test('full agreement passes', () => assert.equal(censusMatchAgrees(good, req), true));
  test('wrong town with mismatching components falls through', () => {
    assert.equal(censusMatchAgrees({ ...good, addressComponents: { city: 'DIFFERENT CITY', state: 'ZZ', zip: '99999' } }, req), false);
  });
  test('original audit mock: wrong town, no addressComponents, same number', () => {
    assert.equal(censusMatchAgrees({ matchedAddress: '717 OTHER STREET, DIFFERENT CITY, ZZ', coordinates: { x: -99, y: 30 } }, req), false);
  });
  test('no components but matchedAddress parses and agrees', () => {
    assert.equal(censusMatchAgrees({ matchedAddress: '717 SCHOOL ST, PAWTUCKET, RI, 02860', coordinates: { x: -71.37, y: 41.86 } }, req), true);
  });
  test('no components and matchedAddress lacks state/zip is not evidence', () => {
    assert.equal(censusMatchAgrees({ matchedAddress: '717 SCHOOL ST', coordinates: { x: -71.37, y: 41.86 } }, req), false);
    assert.equal(censusMatchAgrees({ matchedAddress: '717 SCHOOL ST, PAWTUCKET', coordinates: { x: -71.37, y: 41.86 } }, req), false);
  });
  test('partial components: state only, zip requested but absent, fails', () => {
    assert.equal(censusMatchAgrees({ ...good, addressComponents: { state: 'RI' } }, req), false);
  });
  test('partial components: state + zip agree, city requested but absent, fails', () => {
    assert.equal(censusMatchAgrees({ ...good, addressComponents: { state: 'RI', zip: '02860' } }, req), false);
  });
  test('zip not requested: state + city suffice', () => {
    assert.equal(censusMatchAgrees({ ...good, addressComponents: { state: 'RI', city: 'Pawtucket' } }, { ...req, zip: '' }), true);
  });
  test('city not requested: state + zip suffice; zip+4 tolerated', () => {
    assert.equal(censusMatchAgrees({ ...good, addressComponents: { state: 'RI', zip: '02860-1234' } }, { ...req, city: '' }), true);
  });
  test('right town, wrong street number fails', () => assert.equal(censusMatchAgrees({ ...good, matchedAddress: '719 SCHOOL ST, PAWTUCKET, RI, 02860' }, req), false));
  test('wrong state with otherwise agreeing components fails', () => assert.equal(censusMatchAgrees({ ...good, addressComponents: { ...good.addressComponents, state: 'MA' } }, req), false));
  test('missing match, address or coordinates fails', () => {
    assert.equal(censusMatchAgrees(undefined, req), false);
    assert.equal(censusMatchAgrees({ coordinates: { x: 1, y: 1 } }, req), false);
    assert.equal(censusMatchAgrees({ matchedAddress: good.matchedAddress }, req), false);
    assert.equal(censusMatchAgrees({ ...good, coordinates: { x: NaN, y: 1 } }, req), false);
  });
});
