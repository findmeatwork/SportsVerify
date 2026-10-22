import mongoose from "mongoose";
import { config } from "../config/env.js";

/**
 * Connect to MongoDB using the MONGO_URI environment variable.
 * Logs success or failure (without printing credentials).
 * Exits the process with a non‑zero code if the connection cannot be established.
 */
export async function connectDB() {
  const uri = config.MONGO_URI;
  if (!uri) {
    console.error("MongoDB connection URI (MONGO_URI) is not set");
    process.exit(1);
  }
  try {
    await mongoose.connect(uri, {
      // Modern options – they are defaults in Mongoose 8 but kept for clarity
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.error("❌ Failed to connect to MongoDB:", err.message);
    process.exit(1);
  }
}

