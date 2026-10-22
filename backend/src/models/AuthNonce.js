// src/models/AuthNonce.js
import mongoose from 'mongoose';
import { config } from '../config/env.js';

// Store a one‑time nonce per wallet address. The document expires automatically
// when `expiresAt` is reached (TTL index with expireAfterSeconds: 0).
const AuthNonceSchema = new mongoose.Schema({
  address: {
    type: String,
    required: true,
    lowercase: true,
    unique: true,
    index: true,
  },
  nonce: {
    type: String,
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    // The document is removed as soon as the date is in the past.
    index: { expireAfterSeconds: 0 },
  },
});

export const AuthNonce = mongoose.model('AuthNonce', AuthNonceSchema);

