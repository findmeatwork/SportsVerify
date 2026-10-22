// src/routes/auth.routes.js
import { Router } from 'express';
import { generateNonce, verifySignature } from '../services/authService.js';
import requireAuth from '../middleware/requireAuth.js';
import { AppError } from '../utils/errors.js';

const router = Router();

/**
 * POST /api/auth/nonce
 * Body: { address }
 */
router.post('/nonce', async (req, res, next) => {
  try {
    const { address } = req.body;
    if (!address) {
      throw new AppError(400, 'MISSING_ADDRESS', 'Address is required');
    }
    const result = await generateNonce(address);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/verify
 * Body: { address, signature }
 */
router.post('/verify', async (req, res, next) => {
  try {
    const { address, signature } = req.body;
    if (!address || !signature) {
      throw new AppError(400, 'MISSING_FIELDS', 'Both address and signature are required');
    }
    const result = await verifySignature(address, signature);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/me – protected route
 */
router.get('/me', requireAuth, (req, res) => {
  res.json({ address: req.wallet });
});

export default router;

