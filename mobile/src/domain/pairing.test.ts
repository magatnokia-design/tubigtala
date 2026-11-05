// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CODE_ALPHABET, formatCode, isValidCode, normalizeCode, pairingCodeError, pairingPayload, parsePairingPayload, stationIdError,
} from './pairing.ts';

test('QR payload round-trips', () => {
  const info = { deviceId: 'tank-01', code: 'ABCDEFGHJKMN' };
  assert.equal(pairingPayload(info), 'tubigtala:station?id=tank-01&code=ABCD-EFGH-JKMN');
  assert.deepEqual(parsePairingPayload(pairingPayload(info)), info);
});

test('codes are read the way people type them', () => {
  assert.equal(normalizeCode(' abcd-efgh jkmn '), 'ABCDEFGHJKMN');
  assert.equal(formatCode('ABCDEFGHJKMN'), 'ABCD-EFGH-JKMN');
  assert.equal(isValidCode('ABCDEFGHJKMN'), true);
  assert.equal(isValidCode('ABCDEFGHJKM0'), false, 'zero is not in the alphabet');
  assert.ok(!CODE_ALPHABET.includes('O') && !CODE_ALPHABET.includes('I') && !CODE_ALPHABET.includes('1'));
});

test('other QR codes and malformed ones are rejected', () => {
  assert.equal(parsePairingPayload('https://example.com'), null);
  assert.equal(parsePairingPayload('tubigtala:station?id=tank-01'), null);
  assert.equal(parsePairingPayload('tubigtala:station?id=tank 01&code=ABCD-EFGH-JKMN'), null);
  assert.equal(parsePairingPayload('tubigtala:station?id=tank-01&code=ABCD'), null);
  assert.equal(parsePairingPayload('tubigtala:station?id=%E0%A4%A&code=ABCD-EFGH-JKMN'), null, 'bad escape');
});

test('hand entry gives a clear message per field', () => {
  assert.ok(stationIdError(''));
  assert.ok(stationIdError('tank 01'));
  assert.equal(stationIdError('tank-01'), undefined);
  assert.ok(pairingCodeError(''));
  assert.match(pairingCodeError('ABCD-EFGH')!, /12/);
  assert.ok(pairingCodeError('ABCD-EFGH-JKM0'));
  assert.equal(pairingCodeError('abcd efgh jkmn'), undefined);
});
