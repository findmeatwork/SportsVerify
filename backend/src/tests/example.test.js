import assert from 'assert';
import { config } from '../config/env.js';

describe('environment config', () => {
  it('should have config object', () => {
    assert.ok(config);
  });
});
