import http from "http";
import app from "./app.js";
import { config } from "./config/env.js";
import { connectDB } from "./db/connect.js";

// Connect to MongoDB before starting the server
await connectDB();

const port = config.PORT || 3001;

const server = http.createServer(app);

server.listen(port, "0.0.0.0", () => {
  console.log(`Backend server listening on http://localhost:${port}`);
});

export default server;
