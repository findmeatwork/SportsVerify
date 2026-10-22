import assert from 'node:assert';
import { config } from '../config/env.js';
import { test } from 'node:test';

test('environment config should have config object', () => {
  assert.ok(config);
});

