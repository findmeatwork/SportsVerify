// src/tests/cryptoService.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  encryptField,
  decryptField,
  encryptBuffer,
  decryptBuffer,
  computeCommitment,
  computeDobHash,
  hashBytes,
} from '../services/cryptoService.js';
import { ethers } from 'ethers';

/** Helper to create a deterministic bytes32 hex string */
function makeBytes32(value) {
  // Pad or trim to 32 bytes, return 0x-prefixed hex
  const hex = value.replace(/^0x/, '').padStart(64, '0').slice(0, 64);
  return '0x' + hex;
}

describe('Crypto Service – field encryption', () => {
  it('encryptField/decryptField round‑trip and different IVs', () => {
    const plaintext = 'Hello, SportsVerify!';
    const enc1 = encryptField(plaintext);
    const enc2 = encryptField(plaintext);
    // Encrypted payloads should differ because of random IV
    assert.notStrictEqual(enc1, enc2, 'IV should be random, encrypted payloads must differ');
    // Decrypt both and verify original text
    assert.strictEqual(decryptField(enc1), plaintext);
    assert.strictEqual(decryptField(enc2), plaintext);
  });

  it('decryptField throws on tampered payload', () => {
    const payload = encryptField('tamper test');
    // corrupt the ciphertext (change one character)
    const parts = payload.split(':');
    const corrupted = parts[2].replace(/.$/, c => (c === 'A' ? 'B' : 'A'));
    const badPayload = [parts[0], parts[1], corrupted].join(':');
    assert.throws(() => decryptField(badPayload), /Invalid|authentication/);
  });
});

describe('Crypto Service – buffer encryption', () => {
  it('encryptBuffer/decryptBuffer round‑trip and random IV', () => {
    const buf = Buffer.from('binary data ⛰️');
    const enc1 = encryptBuffer(buf);
    const enc2 = encryptBuffer(buf);
    assert.notDeepStrictEqual(enc1, enc2, 'IV should differ, encrypted buffers must differ');
    const dec1 = decryptBuffer(enc1);
    const dec2 = decryptBuffer(enc2);
    assert.deepStrictEqual(dec1, buf);
    assert.deepStrictEqual(dec2, buf);
  });

  it('decryptBuffer throws on tampered ciphertext', () => {
    const buf = Buffer.from('tamper buffer');
    const enc = encryptBuffer(buf);
    // flip a byte after the IV+authTag region
    const tampered = Buffer.from(enc);
    tampered[tampered.length - 1] ^= 0xff;
    assert.throws(() => decryptBuffer(tampered), /Invalid|authentication/);
  });
});

describe('Crypto Service – commitment & DOB hash', () => {
  const eventId = 42;
  const participantId = makeBytes32('aa'); // 0x...aa padded
  const salt = makeBytes32('bb');
  const salt2 = makeBytes32('cc');
  const dob = '1990-01-01';

  it('computeCommitment matches ethers keccak256 of ABI encoding', () => {
    const expected = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'bytes32', 'bytes32'],
        [eventId, participantId, salt]
      )
    );
    assert.strictEqual(computeCommitment(eventId, participantId, salt), expected);
  });

  it('computeDobHash matches ethers keccak256 of ABI encoding', () => {
    const expected = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'bytes32', 'string', 'bytes32'],
        [eventId, participantId, dob, salt2]
      )
    );
    assert.strictEqual(computeDobHash(eventId, participantId, dob, salt2), expected);
  });
});

describe('Crypto Service – hashBytes', () => {
  it('hashes arbitrary buffer correctly', () => {
    const data = Buffer.from('test data');
    const expected = ethers.keccak256(data);
    assert.strictEqual(hashBytes(data), expected);
  });
});

