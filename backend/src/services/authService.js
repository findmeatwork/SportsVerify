// src/services/authService.js
import crypto from 'crypto';
import { ethers } from 'ethers';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { AuthNonce } from '../models/AuthNonce.js';
import { AppError } from '../utils/errors.js';

/**
 * Generate a random 16‑byte hex nonce and store it with a TTL.
 * Returns the message that the wallet must sign.
 */
export async function generateNonce(address) {
  if (!ethers.isAddress(address)) {
    throw new AppError(400, 'INVALID_ADDRESS', 'Provided address is not a valid Ethereum address');
  }
  const nonce = crypto.randomBytes(16).toString('hex');
  const ttlSeconds = parseInt(config.NONCE_TTL_SECONDS, 10) || 300;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  // Upsert the nonce document for this address
  await AuthNonce.findOneAndUpdate(
    { address: address.toLowerCase() },
    { nonce, expiresAt },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  const message = `Sign this message to authenticate with SportsVerify. Nonce: ${nonce}`;
  return { address: address.toLowerCase(), nonce, message, expiresAt };
}

/**
 * Verify a signature for the stored nonce, issue a JWT and delete the nonce.
 */
export async function verifySignature(address, signature) {
  if (!ethers.isAddress(address)) {
    throw new AppError(400, 'INVALID_ADDRESS', 'Provided address is not a valid Ethereum address');
  }
  const doc = await AuthNonce.findOne({ address: address.toLowerCase() });
  if (!doc) {
    throw new AppError(400, 'NONCE_NOT_FOUND', 'No authentication nonce found for this address');
  }
  if (doc.expiresAt.getTime() < Date.now()) {
    await AuthNonce.deleteOne({ _id: doc._id });
    throw new AppError(400, 'NONCE_EXPIRED', 'Authentication nonce has expired');
  }
  const recovered = ethers.verifyMessage(doc.message, signature);
  if (recovered.toLowerCase() !== address.toLowerCase()) {
    throw new AppError(401, 'INVALID_SIGNATURE', 'Signature does not match the provided address');
  }
  // Delete nonce after successful verification
  await AuthNonce.deleteOne({ _id: doc._id });

  const token = jwt.sign(
    { sub: address.toLowerCase(), type: 'auth' },
    config.JWT_SECRET,
    { expiresIn: `${config.SESSION_TTL_HOURS}h` }
  );
  const expiresAt = new Date(Date.now() + Number(config.SESSION_TTL_HOURS) * 3600 * 1000);
  return { token, address: address.toLowerCase(), expiresAt };
}
