import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({
  path: join(__dirname, "../../.env"),
});

const config = {
  port: parseInt(process.env.PORT) || 8084,
  nodeEnv: process.env.NODE_ENV || "development",
  db: {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT) || 5404,
    user: process.env.DB_USER || "notifdb",
    password: process.env.DB_PASSWORD || "notifpass",
    database: process.env.DB_NAME || "notifdb",
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
  },

  kafka: {
    broker: process.env.KAFKA_BROKER || "localhost:9092",
    clientId: process.env.KAFKA_CLIENT_ID || "notification-service",
    groupId: process.env.KAFKA_GROUP_ID || "notification-service-group",
    topics: {
      authEvents: "auth-events",
      userEvents: "user-events",
      accountEvents: "account-events",
      transactionEvents: "transaction-events",
    },
  },

  services: {
    auth: {
      url: process.env.AUTH_SERVICE_URL || "http://localhost:8080",
    },

    user: {
      url: process.env.USER_SERVICE_URL || "http://localhost:8081",
    },

    account: {
      url: process.env.ACCOUNT_SERVICE_URL || "http://localhost:8082",
    },

    transaction: {
      url: process.env.TRANSACTION_SERVICE_URL || "http://localhost:8083",
    },
  },

  internalServiceToken: process.env.INTERNAL_SERVICE_TOKEN || "internal-service-secret-token",

  email: {
    host: process.env.SMTP_HOST || "localhost",
    port: parseInt(process.env.SMTP_PORT) || 1025,
    user: process.env.SMTP_USER || "",
    password: process.env.SMTP_PASSWORD || "",

    from: {
      email:
 process.env.SMTP_FROM_EMAIL ||
        "notifications@banking-app.com",

      name:
 process.env.SMTP_FROM_NAME ||
        "Banking App",
    },
  },

  sms: {
    provider:
      process.env.SMS_PROVIDER || "mock",
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID || "",
      authToken: process.env.TWILIO_AUTH_TOKEN || "",
      phoneNumber: process.env.TWILIO_PHONE_NUMBER || "",
    },
  },

  push: {
    provider: process.env.PUSH_PROVIDER || "mock",
  },

  retry: {
    maxAttempts: parseInt(process.env.MAX_RETRY_ATTEMPTS) || 3,
    delayMs: parseInt(process.env.RETRY_DELAY_MS) || 1000,
  },
};

if (!config.jwt.accessSecret) {
  console.warn(
    "WARNING: JWT_ACCESS_SECRET is not configured."
  );
}

export default config;