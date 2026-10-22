import express from "express";
import cors from "cors";
import { config } from "./config/env.js";

const app = express();

// CORS limited to the allowed origin
app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));

// JSON body parsing
app.use(express.json({ limit: "1mb" }));

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
});

// Generic error handler
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  const code = err.code || "INTERNAL_ERROR";
  res.status(status).json({ error: { code, message: err.message } });
});

export default app;

