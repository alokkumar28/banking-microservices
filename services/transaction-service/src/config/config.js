import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({
  path: join(__dirname, "../../.env"),
});

const config = {
  port: parseInt(process.env.PORT, 10) || 8083,

  nodeEnv: process.env.NODE_ENV || "development",

  db: {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT, 10) || 5053,
    user: process.env.DB_USER || "transaction_db",
    password: process.env.DB_PASSWORD || "transaction_password",
    database: process.env.DB_NAME || "transaction_db",
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
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
  },

  internalServiceToken: process.env.INTERNAL_SERVICE_TOKEN,

  transfer: {
    maxAmount: parseFloat(process.env.MAX_TRANSFER_AMOUNT) || 100000,
    minAmount: parseFloat(process.env.MIN_TRANSFER_AMOUNT) || 1,
    defaultDailyLimit:
      parseFloat(process.env.DEFAULT_DAILY_LIMIT) || 50000,
  },

  pagination: {
    defaultPage: parseInt(process.env.DEFAULT_PAGE, 10) || 1,
    defaultLimit: parseInt(process.env.DEFAULT_LIMIT, 10) || 10,
    maxLimit: parseInt(process.env.MAX_LIMIT, 10) || 100,
  },
};

export default config;