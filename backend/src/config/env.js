// Load environment variables from .env if present
import dotenv from "dotenv";
dotenv.config(); // Load from backend .env

/**
 * Validate required environment variables for the backend.
 * Throws an Error with a clear message if any variable is missing or invalid.
 */
function validateEnv() {
  const required = ["CORS_ORIGIN", "RPC_URL", "CHAIN_ID", "CONTRACT_JSON"];
  const missing = required.filter((key) => !(key in process.env));
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  // Basic format checks
  try {
    // CORS_ORIGIN should be a valid URL (allow any protocol)
    new URL(process.env.CORS_ORIGIN);
  } catch (_) {
    throw new Error("CORS_ORIGIN must be a valid URL");
  }

  if (isNaN(Number(process.env.CHAIN_ID))) {
    throw new Error("CHAIN_ID must be a numeric value");
  }

  // CONTRACT_JSON should point to an existing file (relative or absolute)
  // We'll defer existence check to runtime when reading the file.
}

validateEnv();

export const config = Object.freeze({
  CORS_ORIGIN: process.env.CORS_ORIGIN,
  RPC_URL: process.env.RPC_URL,
  CHAIN_ID: Number(process.env.CHAIN_ID),
  CONTRACT_JSON: process.env.CONTRACT_JSON,
  PORT: process.env.PORT ? Number(process.env.PORT) : 3001,
});
