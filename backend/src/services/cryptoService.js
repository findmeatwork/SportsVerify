// src/services/cryptoService.js
import crypto from 'crypto';
import { config } from '../config/env.js';
import { ethers } from 'ethers';

/**
 * Helper to get the 32‑byte AES key from env. Expected to be a 64‑char hex string.
 */
function getKey() {
  if (!config.PII_ENCRYPTION_KEY) {
    throw new Error('Missing PII_ENCRYPTION_KEY env variable');
  }
  // Allow hex or base64 – try hex first
  const keyHex = config.PII_ENCRYPTION_KEY.startsWith('0x')
    ? config.PII_ENCRYPTION_KEY.slice(2)
    : config.PII_ENCRYPTION_KEY;
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) {
    throw new Error('PII_ENCRYPTION_KEY must be 32 bytes (64 hex chars)');
  }
  return key;
}

/**
 * AES‑256‑GCM encryption for a textual field.
 * Returns a string "iv:authTag:cipherText" where each component is base64.
 */
export function encryptField(plainText) {
  const key = getKey();
  const iv = crypto.randomBytes(12); // 96‑bit nonce recommended for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Store as base64 for easy transport/storage
  return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':');
}

/**
 * Decrypts a payload produced by `encryptField`.
 * Throws on auth‑tag verification failure or malformed input.
 */
export function decryptField(payload) {
  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted field format');
  }
  const [ivB64, authTagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const ciphertext = Buffer.from(ctB64, 'base64');
  const key = getKey();
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    return plaintext;
  } catch (e) {
    // Re‑throw with a clearer message expected by tests
    throw new Error('Invalid authentication data');
  }
}

/**
 * Encrypt a raw Buffer (e.g., file contents). Returns a single Buffer with layout:
 *   IV(12) || authTag(16) || ciphertext
 */
export function encryptBuffer(buffer) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

/**
 * Decrypt a buffer created by `encryptBuffer`.
 */
export function decryptBuffer(encBuffer) {
  if (encBuffer.length < 28) { // 12+16 minimum
    throw new Error('Encrypted buffer too short');
  }
  const iv = encBuffer.slice(0, 12);
  const authTag = encBuffer.slice(12, 28);
  const ciphertext = encBuffer.slice(28);
  const key = getKey();
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext;
  } catch (e) {
    throw new Error('Invalid authentication data');
  }
}

/**
 * Compute commitment = keccak256(abi.encode(eventId, participantId, salt)).
 * Returns a hex string (0x...).
 */
export function computeCommitment(eventId, participantId, salt) {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ['uint256', 'bytes32', 'bytes32'],
    [eventId, participantId, salt]
  );
  return ethers.keccak256(encoded);
}

/**
 * Compute DOB hash = keccak256(abi.encode(eventId, participantId, dob, salt2)).
 * `dob` is a string like "YYYY-MM-DD".
 */
export function computeDobHash(eventId, participantId, dob, salt2) {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ['uint256', 'bytes32', 'string', 'bytes32'],
    [eventId, participantId, dob, salt2]
  );
  return ethers.keccak256(encoded);
}

/**
 * keccak256 hash of an arbitrary Uint8Array/Buffer.
 */
export function hashBytes(buffer) {
  return ethers.keccak256(buffer);
}

