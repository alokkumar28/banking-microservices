import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import accountRoutes from "./routes/account.routes.js";
import config from "./config/config.js";
import { initDatabase } from "./db/db.js";
const app = express();
app.use(helmet());
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    service: "account-service",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/accounts", accountRoutes);

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

app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
  });
});

const PORT = config.port;
const startServer = async () => {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log("=================================");
      console.log("🏦 Account Service Started");
      console.log(`📍 Running on: http://localhost:${PORT}`);
      console.log(`🔧 Environment: ${config.nodeEnv}`);
      console.log(`🕐 Started at: ${new Date().toISOString()}`);
      console.log("=================================");
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();