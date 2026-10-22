import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as chain from '../services/chainService.js';

describe('Chain Service – basic sanity', () => {
  it('should init without errors', async () => {
    await chain.init();
    assert.ok(chain);
  });
});
