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

pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
});

// Initialize database tables
const initDatabase = async () => {
  const client = await pool.connect();
  try {
    // Accounts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        account_number VARCHAR(20) UNIQUE NOT NULL,
        account_type VARCHAR(20) NOT NULL,
        currency VARCHAR(3) DEFAULT 'INR',
        balance NUMERIC(15, 2) DEFAULT 0.00,
        available_balance NUMERIC(15, 2) DEFAULT 0.00,
        status VARCHAR(20) DEFAULT 'ACTIVE',
        ifsc_code VARCHAR(11),
        branch_name VARCHAR(255),
        daily_transfer_limit NUMERIC(15, 2) DEFAULT 100000.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        closed_at TIMESTAMP
      )
    `);

    // Indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
      CREATE INDEX IF NOT EXISTS idx_accounts_account_number ON accounts(account_number);
      CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status);
    `);

    // Transactions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id UUID NOT NULL REFERENCES accounts(id),
        transaction_type VARCHAR(20) NOT NULL,
        amount NUMERIC(15, 2) NOT NULL,
        balance_before NUMERIC(15, 2) NOT NULL,
        balance_after NUMERIC(15, 2) NOT NULL,
        description TEXT,
        reference_id VARCHAR(100),
        status VARCHAR(20) DEFAULT 'COMPLETED',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
      CREATE INDEX IF NOT EXISTS idx_transactions_reference_id ON transactions(reference_id);
    `);

    // Audit log
    await client.query(`
      CREATE TABLE IF NOT EXISTS account_audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        account_id UUID,
        event_type VARCHAR(50) NOT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        success BOOLEAN NOT NULL,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Trigger for updated_at
    await client.query(`
      CREATE OR REPLACE FUNCTION update_accounts_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS trigger_update_accounts_updated_at ON accounts;
      CREATE TRIGGER trigger_update_accounts_updated_at
        BEFORE UPDATE ON accounts
        FOR EACH ROW
        EXECUTE FUNCTION update_accounts_updated_at();
    `);

    console.log("✅ Account database initialized successfully");
  } catch (error) {
    console.error("❌ Failed to initialize database:", error);
    throw error;
  } finally {
    client.release();
  }
};

// Log account events
const logAccountEvent = async (
  eventType,
  userId,
  accountId,
  success,
  ip,
  userAgent,
  metadata = null,
) => {
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO account_audit_logs 
       (user_id, account_id, event_type, ip_address, user_agent, success, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, accountId, eventType, ip, userAgent, success, metadata],
    );
  } catch (error) {
    console.error("Failed to log account event:", error);
  } finally {
    client.release();
  }
};

export { pool, initDatabase, logAccountEvent };