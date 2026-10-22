import assert from 'node:assert/strict';
import test from 'node:test';
import { AbiCoder, keccak256, hexlify } from 'ethers';

import { generateSalt, normalizeDob, computeDobHash, hashBytes } from '../src/utils/participant.js';

// Helper to create a Uint8Array from a string
function Uint8FromString(str) {
  return Uint8Array.from(Buffer.from(str, 'utf8'));
}

test('generateSalt returns a valid bytes32 hex string', () => {
  const salt = generateSalt();
  assert.match(salt, /^0x[0-9a-fA-F]{64}$/);
});

test('normalizeDob accepts valid date and rejects future date', () => {
  const valid = '1990-01-01';
  assert.equal(normalizeDob(valid), valid);
  const future = new Date();
  future.setDate(future.getDate() + 1);
  const futureStr = [future.getFullYear(), future.getMonth() + 1, future.getDate()]
    .map(p => String(p).padStart(2, '0')).join('-');
  assert.throws(() => normalizeDob(futureStr), /future/);
});

test('computeDobHash matches ethers keccak256 of encoded data', () => {
  const eventId = 42;
  const participantId = '0x' + '11'.repeat(32);
  const dob = '1990-01-01';
  const salt2 = '0x' + '22'.repeat(32);
  const expected = keccak256(
    AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'bytes32', 'string', 'bytes32'],
      [eventId, participantId, dob, salt2]
    )
  );
  const actual = computeDobHash(eventId, participantId, dob, salt2);
  assert.equal(actual, expected);
});

test('hashBytes returns keccak256 of Uint8Array', () => {
  const data = Uint8FromString('hello world');
  const expected = keccak256('0x' + Buffer.from(data).toString('hex'));
  const actual = hashBytes(data);
  assert.equal(actual, expected);
});
