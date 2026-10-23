// src/tests/fileStorageService.test.js
import assert from 'node:assert';
import { test } from 'node:test';
import request from 'supertest';
import express from 'express';
import { uploadSingle, validateImageMagic } from '../middleware/upload.js';
import { saveEncrypted, readDecrypted } from '../services/fileStorageService.js';
import { config } from '../config/env.js';
import path from 'path';
import fs from 'fs';

// Helper: simple PNG buffer (minimal valid PNG – 1x1 transparent)
const pngHex = '89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
  '1f15c4890000000a4944415408d76360000000020001e5' +
  '2616e50000000049454e44ae426082';
const pngBuffer = Buffer.from(pngHex, 'hex');

test('saveEncrypted stores encrypted data and readDecrypted returns original', async () => {
  const { fileId, mimeType, size } = await saveEncrypted(pngBuffer, 'image/png');
  assert.ok(fileId);
  assert.strictEqual(mimeType, 'image/png');
  assert.ok(size > pngBuffer.length); // encrypted larger (IV+authTag)

  // Verify that the file on disk is not the plain PNG (magic bytes differ)
  const filePath = path.join(config.STORAGE_DIR || 'storage', fileId);
  const onDisk = await fs.promises.readFile(filePath);
  assert.notDeepStrictEqual(onDisk.slice(0, 8).toString('hex'), pngHex.slice(0, 8));

  const recovered = await readDecrypted(fileId);
  assert.deepStrictEqual(recovered, pngBuffer);
});

test('upload middleware validates mime type and magic bytes', async () => {
  const app = express();
  app.post('/upload', uploadSingle('file'), validateImageMagic, async (req, res, next) => {
    // save the first uploaded file
    const file = req.files[0];
    const saved = await saveEncrypted(file.buffer, file.mimetype);
    res.json({ fileId: saved.fileId });
  });

  await request(app)
    .post('/upload')
    .attach('file', pngBuffer, { filename: 'test.png', contentType: 'image/png' })
    .expect(200)
    .then((res) => {
      assert.ok(res.body.fileId);
    });
});

