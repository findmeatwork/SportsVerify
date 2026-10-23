// test/setup.js
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll } from 'node:test';

// Start an in‑memory MongoDB server
const mongod = await MongoMemoryServer.create();
const uri = mongod.getUri();

// Override env for any code that reads it
process.env.MONGO_URI = uri;

// Connect Mongoose
await mongoose.connect(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Ensure clean shutdown after all tests
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

