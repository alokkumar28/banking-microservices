import pg from "pg";
import config from "../config/config.js";
const { Pool } = pg;
const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
});

const initDatabase = async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID UNIQUE NOT NULL,
        mobile_number VARCHAR(15) UNIQUE NOT NULL,
        date_of_birth DATE NOT NULL,
        gender VARCHAR(20) NOT NULL
          CHECK (gender IN ('MALE', 'FEMALE', 'OTHER')),
        occupation VARCHAR(30) NOT NULL
          CHECK (
            occupation IN (
              'STUDENT',
              'EMPLOYED',
              'SELF_EMPLOYED',
              'BUSINESS',
              'OTHER'
            )
          ),
        address VARCHAR(500) NOT NULL,
        city VARCHAR(100) NOT NULL,
        district VARCHAR(100) NOT NULL,
        state VARCHAR(100) NOT NULL,
        country VARCHAR(100) NOT NULL DEFAULT 'India',
        pincode VARCHAR(10) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("User database tables initialized successfully");
  } catch (error) {
    console.error("Failed to initialize user database:", error);
    throw error;
  } finally {
    client.release();
  }
};

export { pool, initDatabase };