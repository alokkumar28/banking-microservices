import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import config from "./config/config.js";
import routes from "./routes/index.js";
import { generalLimiter } from "./middleware/rate-limit.js";
import { requestLogger, requestId } from "./middleware/logger.js";
import logger from "./utils/logger.js";

const app = express();

// BASIC CONFIGURATION
app.set("trust proxy", 1);

// SECURITY
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
  }),
);

// CORS
app.use(
  cors({
    origin: config.cors.origin,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Request-ID",
      "Idempotency-Key",
    ],
    exposedHeaders: ["X-Request-ID", "X-Served-By"],
  }),
);

// LOGGING
app.use(morgan("dev"));
app.use(requestId);
app.use(requestLogger);

// BODY PARSING
app.use(
  express.json({
    limit: "10mb",
  }),
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb",
  }),
);

// GENERAL RATE LIMIT
app.use(generalLimiter);

// HEALTH
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    service: "api-gateway",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// INFO
app.get("/info", (req, res) => {
  res.status(200).json({
    service: "Banking API Gateway",
    version: "1.0.0",
    routes: {
      auth: "/api/auth/*",
      users: "/api/users/*",
      accounts: "/api/accounts/*",
      transactions: "/api/transactions/*",
      notifications: "/api/notifications/*",
    },
  });
});

// API ROUTES
app.use("/api", routes);

// 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    path: req.originalUrl,
  });
});

// ERROR HANDLER
app.use((error, req, res, next) => {
  logger.error("Unhandled gateway error", {
    error: error.message,
    stack: error.stack,
    requestId: req.requestId,
  });
  if (res.headersSent) {
    return next(error);
  }
  res.status(500).json({
    success: false,
    message: "Internal server error",
    ...(config.nodeEnv === "development" && {
      error: error.message,
    }),
  });
});

// START SERVER
const server = app.listen(config.port, () => {
  logger.info("=================================");
  logger.info("API Gateway Started");
  logger.info(`Running on: http://localhost:${config.port}`);
  logger.info(`Environment: ${config.nodeEnv}`);
  logger.info(`Started at: ${new Date().toISOString()}`);
  logger.info("=================================");
  logger.info("Available Routes:");
  logger.info(`  /api/auth/*          -> ${config.services.auth}`);
  logger.info(`  /api/users/*         -> ${config.services.user}`);
  logger.info(`  /api/accounts/*      -> ${config.services.account}`);
  logger.info(`  /api/transactions/*  -> ${config.services.transaction}`);
  logger.info(`  /api/notifications/* -> ${config.services.notification}`);
  logger.info("=================================");
});

// GRACEFUL SHUTDOWN
const shutdown = (signal) => {
  logger.info(`${signal} received. Shutting down gracefully...`);
  server.close(() => {
    logger.info("HTTP server closed.");
    process.exit(0);
  });

  setTimeout(() => {
    logger.error("Forcing shutdown after 10 seconds.");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// PROCESS ERROR HANDLERS
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Promise Rejection", {
    reason: reason instanceof Error ? reason.message : reason,
  });
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception", {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

export default app;
