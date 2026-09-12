import dotenv from "dotenv";
dotenv.config();
const config = {
  port: process.env.PORT || 8081,
  nodeEnv: process.env.NODE_ENV || "development",
  db: {
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT || 5051,
    user: process.env.DB_USER || "user_db",
    password: process.env.DB_PASSWORD || "user_password",
    database: process.env.DB_NAME || "user_db",
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
  },
};

export default config;