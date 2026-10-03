import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import config from "./config/config.js";
import { initDatabase } from "./db/db.js";
import emailService from "./services/email.service.js";
import notificationRoutes from "./routes/notification.routes.js";
import eventConsumer from "./consumers/event.consumer.js";
const app = express();

// MIDDLEWARE
app.use(helmet());
app.use(cors());
app.use(morgan("dev"));
app.use(
  express.json({
    limit: "5mb",
  }),
);

app.use(
  express.urlencoded({
    extended: true,
  }),
);

// HEALTH
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    service: "notification-service",
    timestamp: new Date().toISOString(),
  });
});

app.get("/ping", (req, res) => {
  res.status(200).json({
    message: "pong from notification-service",
  });
});

// ROUTES
app.use("/api/notifications", notificationRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found",
  });
});

// ERROR HANDLER
app.use((error, req, res, next) => {
  console.error("Unhandled error:", error);
  res.status(500).json({
    success: false,
    error: "Internal server error",
    message: config.nodeEnv === "development" ? error.message : undefined,
  });
});

// START SERVER
const startServer = async () => {
  try {
    await initDatabase();
    await emailService.verifyConnection();
    const server = app.listen(config.port, () => {
      console.log("=================================");
      console.log("Notification Service Started");
      console.log(`Running on: http://localhost:${config.port}`);
      console.log(`Environment: ${config.nodeEnv}`);
      console.log(`Started at: ${new Date().toISOString()}`);
      console.log("=================================");
    });

    // Kafka
    try {
      await eventConsumer.start();
    } catch (error) {
      console.error("Kafka consumer failed to start:", error.message);
      console.log("Notification Service will continue without Kafka.");
    }
    // Graceful shutdown
    const shutdown = async (signal) => {
      console.log(`${signal} received. Shutting down...`);
      try {
        await eventConsumer.stop();
      } catch (error) {
        console.error("Kafka shutdown error:", error);
      }
      server.close(() => {
        console.log("HTTP server closed.");

        process.exit(0);
      });
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    console.error("Failed to start notification service:", error);
    process.exit(1);
  }
};

startServer();
