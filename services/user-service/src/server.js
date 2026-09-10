import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import config from "./config/config.js";

import { initDatabase } from "./db/db.js";

import userRoutes from "./routes/user.routes.js";

const app = express();

// Security middleware
app.use(helmet());

// Enable CORS
app.use(cors());

// HTTP request logging
app.use(morgan("dev"));

// Parse JSON request bodies
app.use(express.json());

// Parse URL-encoded request bodies
app.use(
  express.urlencoded({
    extended: true,
  })
);

// Initialize database
initDatabase().catch((error) => {
  console.error("Database initialization failed:", error);
});

// User routes
app.use("/users", userRoutes);

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    service: "user-service",
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.stack);

  res.status(500).json({
    error: "Something went wrong!",
    message:
      config.nodeEnv === "development"
        ? err.message
        : undefined,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
  });
});

const PORT = config.port;

app.listen(PORT, () => {
  console.log("=================================");
  console.log("User Service Started");
  console.log(`Running on: http://localhost:${PORT}`);
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log("=================================");
});