// src/tests/requireAuth.test.js
import assert from 'node:assert';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../app.js';
import { config } from '../config/env.js';

// Helper to create a valid token for a random address
function makeToken(address) {
  return jwt.sign({ sub: address.toLowerCase(), type: 'auth' }, config.JWT_SECRET, { expiresIn: `${config.SESSION_TTL_HOURS}h` });
}

test('requireAuth passes with valid token', async () => {
  const address = '0x' + 'a'.repeat(40);
  const token = makeToken(address);
  const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.address, address.toLowerCase());
});

test('requireAuth rejects missing header', async () => {
  const res = await request(app).get('/api/auth/me');
  assert.strictEqual(res.statusCode, 401);
});

test('requireAuth rejects malformed token', async () => {
  const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer invalidtoken');
  assert.strictEqual(res.statusCode, 401);
});

test('requireAuth rejects token with wrong type', async () => {
  const address = '0x' + 'b'.repeat(40);
  const badToken = jwt.sign({ sub: address, type: 'lookup' }, config.JWT_SECRET, { expiresIn: `${config.SESSION_TTL_HOURS}h` });
  const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${badToken}`);
  assert.strictEqual(res.statusCode, 401);
});

