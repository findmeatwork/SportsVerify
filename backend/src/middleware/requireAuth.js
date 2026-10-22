// src/middleware/requireAuth.js
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { AppError } from '../utils/errors.js';

/**
 * Express middleware that validates a Bearer JWT.
 * Expected payload: { sub: <wallet address>, type: 'auth' }
 */
export default function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError(401, 'NO_AUTH_HEADER', 'Missing or malformed Authorization header');
    }
    const token = authHeader.slice(7).trim();
    const payload = jwt.verify(token, config.JWT_SECRET);
    if (!payload || payload.type !== 'auth' || !payload.sub) {
      throw new AppError(401, 'INVALID_TOKEN', 'Token payload is invalid');
    }
    req.wallet = payload.sub.toLowerCase();
    next();
  } catch (err) {
    // Convert any JWT errors to AppError for consistency
    if (err instanceof AppError) {
      return next(err);
    }
    const message = err.name === 'TokenExpiredError' ? 'Token has expired' : 'Invalid authentication token';
    return next(new AppError(401, 'INVALID_TOKEN', message));
  }
}

