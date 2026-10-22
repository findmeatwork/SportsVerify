// src/tests/authService.test.js
import assert from 'node:assert';
import { test } from 'node:test';
import { ethers } from 'ethers';
import jwt from 'jsonwebtoken';
import { generateNonce, verifySignature } from '../services/authService.js';
import { config } from '../config/env.js';

// Use a deterministic wallet for reproducibility
const wallet = ethers.Wallet.createRandom();
const address = wallet.address;

test('Nonce generation returns expected fields', async () => {
  const result = await generateNonce(address);
  assert.ok(result.nonce);
  assert.ok(result.message.includes(result.nonce));
  assert.ok(result.expiresAt instanceof Date);
});

test('Signature verification returns JWT', async () => {
  const { message } = await generateNonce(address);
  const signature = await wallet.signMessage(message);
  const { token, expiresAt } = await verifySignature(address, signature);
  assert.ok(token);
  assert.ok(expiresAt instanceof Date);
  // Verify token payload
  const payload = jwt.verify(token, config.JWT_SECRET);
  assert.strictEqual(payload.sub, address.toLowerCase());
  assert.strictEqual(payload.type, 'auth');
});

