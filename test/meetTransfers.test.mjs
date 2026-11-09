import { test } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.env.ZT_ROOT || '..';
const T = await import(`${ROOT}/lib/website/meetTransfers.ts`);

test('cleanTransferUsername strips the @, whitespace and case', () => {
  assert.equal(T.cleanTransferUsername('  @Jess_Test '), 'jess_test');
  assert.equal(T.cleanTransferUsername('jess'), 'jess');
  assert.equal(T.cleanTransferUsername('   '), '');
  assert.equal(T.cleanTransferUsername('@'), '');
});

test('partyLabel reads display name with handle, falls back sensibly', () => {
  assert.equal(T.partyLabel({ username: 'jess_test', displayName: 'Jess' }), 'Jess (@jess_test)');
  assert.equal(T.partyLabel({ username: 'jess_test', displayName: null }), '@jess_test');
  assert.equal(T.partyLabel({ username: null, displayName: 'Jess' }), 'Jess');
  assert.equal(T.partyLabel(null), 'an account');
});

test('every transfer status has a label', () => {
  for (const s of ['pending', 'accepted', 'declined', 'cancelled']) assert.ok(T.TRANSFER_STATUS_LABEL[s]);
});
