import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);

const __dirname = dirname(__filename);

dotenv.config({
  path: join(__dirname, "../../.env"),
});

const config = {
  port: parseInt(process.env.PORT, 10) || 8000,
  nodeEnv: process.env.NODE_ENV || "development",
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
  },

  services: {
    auth: process.env.AUTH_SERVICE_URL || "http://localhost:8080",
    user: process.env.USER_SERVICE_URL || "http://localhost:8081",
    account: process.env.ACCOUNT_SERVICE_URL || "http://localhost:8082",
    transaction: process.env.TRANSACTION_SERVICE_URL || "http://localhost:8083",
    notification: process.env.NOTIFICATION_SERVICE_URL || "http://localhost:8084",
  },

  internalServiceToken: process.env.INTERNAL_SERVICE_TOKEN || "internal-service-secret-token",

  cors: {
    origin:
      process.env.CORS_ORIGIN === "*"
        ? "*"
        : process.env.CORS_ORIGIN?.split(",").map((origin) => origin.trim()) ||
          "*",
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
    authMax: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 10,
  },

  proxyTimeout: parseInt(process.env.PROXY_TIMEOUT, 10) || 30000,
};

if (!config.jwt.accessSecret) {
  console.warn("WARNING: JWT_ACCESS_SECRET is not configured.");
}

export default config;

export { config };
