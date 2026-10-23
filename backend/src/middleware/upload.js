// src/middleware/upload.js
import multer from 'multer';
import { AppError } from '../utils/errors.js';
import { config } from '../config/env.js';

// Memory storage – files are kept in RAM until we encrypt & store them.
const storage = multer.memoryStorage();

/**
 * Create a Multer upload handler for a single field.
 * @param {string} fieldName – the name of the multipart field (e.g. "faceImage").
 * @param {number} maxCount – maximum number of files allowed for that field.
 * @returns {function} Express middleware (Multer).
 */
export function uploadSingle(fieldName, maxCount = 1) {
  const upload = multer({
    storage,
    limits: {
      fileSize: Number(config.MAX_UPLOAD_MB) * 1024 * 1024,
    },
    fileFilter: (req, file, cb) => {
      const allowed = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowed.includes(file.mimetype)) {
        return cb(new AppError(400, 'VALIDATION_ERROR', `Unsupported mime type ${file.mimetype}`));
      }
      cb(null, true);
    },
  }).array(fieldName, maxCount);

  // Wrap multer to forward AppError to next()
  return (req, res, next) => {
    upload(req, res, (err) => {
      if (err) {
        // Multer throws plain Error; convert to AppError if needed
        if (!(err instanceof AppError)) {
          return next(new AppError(400, 'VALIDATION_ERROR', err.message));
        }
        return next(err);
      }
      next();
    });
  };
}

/**
 * Verify magic bytes of the uploaded buffers to ensure they match their claimed mime type.
 * Throws AppError(400, 'VALIDATION_ERROR', …) on mismatch.
 */
export function validateImageMagic(req) {
  if (!req.files) return;
  for (const file of req.files) {
    const magic = file.buffer.slice(0, 12);
    const hex = magic.toString('hex');
    const type = file.mimetype;
    const isJpeg = type === 'image/jpeg' && hex.startsWith('ffd8ff');
    const isPng = type === 'image/png' && hex.startsWith('89504e470d0a1a0a');
    const isWebp = type === 'image/webp' && hex.startsWith('52494646') && hex.slice(16, 24) === '574542505650'; // RIFF....WEBPVP8
    if (!(isJpeg || isPng || isWebp)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Uploaded file does not match its mime type');
    }
  }
}

