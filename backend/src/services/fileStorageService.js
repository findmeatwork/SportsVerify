// src/services/fileStorageService.js
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { encryptBuffer, decryptBuffer } from './cryptoService.js';
import { config } from '../config/env.js';
import { AppError } from '../utils/errors.js';

// Ensure storage directory exists at module load time
const storageDir = config.STORAGE_DIR || path.resolve('storage');
try {
  fs.mkdirSync(storageDir, { recursive: true });
} catch (e) {
  console.error('Failed to create storage directory', e);
}

/**
 * Validate that a string is a UUID v4 (simple regex, no hyphen restrictions beyond format).
 */
function assertValidUuid(fileId) {
  const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidV4.test(fileId)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid file identifier');
  }
}

/**
 * Save an uploaded buffer encrypted on disk.
 * @param {Buffer} buffer - raw file bytes (already read into memory).
 * @param {string} mimeType - MIME type of the original upload.
 * @returns {Promise<{fileId:string, mimeType:string, size:number}>}
 */
export async function saveEncrypted(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Input must be a Buffer');
  }
  const encrypted = encryptBuffer(buffer); // returns Buffer with IV+authTag+ciphertext
  const fileId = randomUUID();
  const filePath = path.join(storageDir, fileId);
  await fs.promises.writeFile(filePath, encrypted);
  return { fileId, mimeType, size: encrypted.length };
}

/**
 * Read and decrypt a stored file.
 * @param {string} fileId
 * @returns {Promise<Buffer>}
 */
export async function readDecrypted(fileId) {
  assertValidUuid(fileId);
  const filePath = path.join(storageDir, fileId);
  try {
    const enc = await fs.promises.readFile(filePath);
    return decryptBuffer(enc);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new AppError(404, 'NOT_FOUND', 'File not found');
    }
    throw err;
  }
}

/**
 * Stream a decrypted file to an Express response.
 * Sets proper headers and pipes the buffer.
 */
export async function sendImage(res, fileId, mimeType) {
  try {
    const buffer = await readDecrypted(fileId);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  } catch (err) {
    // Propagate AppError so Express error handler can format it
    throw err;
  }
}

