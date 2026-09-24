import pg from "pg";
import config from "../config/config.js";
const { Pool } = pg;

const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error);
});

const initDatabase = async () => {
  const client = await pool.connect();

  try {
    console.log("Initializing Transaction Service database...");

    await client.query(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
    `);

    // Transfers
    await client.query(`
      CREATE TABLE IF NOT EXISTS transfers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

        reference_id VARCHAR(100) UNIQUE NOT NULL,

        from_account_id UUID NOT NULL,
        from_user_id UUID NOT NULL,

        to_account_id UUID NOT NULL,
        to_user_id UUID NOT NULL,

        amount NUMERIC(15, 2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'INR',

        fee NUMERIC(15, 2) DEFAULT 0.00,

        status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
          CHECK (
            status IN (
              'PENDING',
              'PROCESSING',
              'COMPLETED',
              'FAILED',
              'REVERSED'
            )
          ),

        transfer_type VARCHAR(20) NOT NULL DEFAULT 'P2P'
          CHECK (transfer_type IN ('P2P')),

        description TEXT,
        failure_reason TEXT,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,

        CONSTRAINT positive_transfer_amount
          CHECK (amount > 0),

        CONSTRAINT no_self_transfer
          CHECK (from_account_id <> to_account_id)
      );
    `);

    // Ledger
    await client.query(`
      CREATE TABLE IF NOT EXISTS transaction_ledger (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

        transfer_id UUID NOT NULL
          REFERENCES transfers(id),

        account_id UUID NOT NULL,

        entry_type VARCHAR(10) NOT NULL
          CHECK (entry_type IN ('DEBIT', 'CREDIT')),

        amount NUMERIC(15, 2) NOT NULL,

        balance_before NUMERIC(15, 2) NOT NULL,
        balance_after NUMERIC(15, 2) NOT NULL,

        reference_id VARCHAR(100) NOT NULL,

        description TEXT,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT positive_ledger_amount
          CHECK (amount > 0)
      );
    `);

    // Daily transfer limits
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_transfer_limits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

        user_id UUID NOT NULL,
        account_id UUID NOT NULL,

        transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,

        total_transferred NUMERIC(15, 2) DEFAULT 0.00,
        transfer_count INTEGER DEFAULT 0,

        daily_limit NUMERIC(15, 2) NOT NULL,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        UNIQUE(account_id, transfer_date)
      );
    `);

    // Idempotency
    await client.query(`
      CREATE TABLE IF NOT EXISTS idempotency_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

        idempotency_key VARCHAR(255) UNIQUE NOT NULL,

        user_id UUID NOT NULL,

        request_hash VARCHAR(64) NOT NULL,

        response_body JSONB,
        status_code INTEGER,

        expires_at TIMESTAMP NOT NULL,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Audit logs
    await client.query(`
      CREATE TABLE IF NOT EXISTS transaction_audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

        transfer_id UUID,

        user_id UUID,

        event_type VARCHAR(50) NOT NULL,

        ip_address VARCHAR(45),

        user_agent TEXT,

        success BOOLEAN NOT NULL,

        metadata JSONB,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_transfers_from_user
      ON transfers(from_user_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_transfers_to_user
      ON transfers(to_user_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_transfers_from_account
      ON transfers(from_account_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_transfers_to_account
      ON transfers(to_account_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_transfers_status
      ON transfers(status);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_transfers_created_at
      ON transfers(created_at);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ledger_account
      ON transaction_ledger(account_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ledger_transfer
      ON transaction_ledger(transfer_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_daily_limit_user
      ON daily_transfer_limits(user_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_transfer
      ON transaction_audit_logs(transfer_id);
    `);

    // Updated-at trigger function
    await client.query(`
      CREATE OR REPLACE FUNCTION update_transaction_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS transfers_updated_at
      ON transfers;
    `);

    await client.query(`
      CREATE TRIGGER transfers_updated_at
      BEFORE UPDATE ON transfers
      FOR EACH ROW
      EXECUTE FUNCTION update_transaction_updated_at();
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS daily_limits_updated_at
      ON daily_transfer_limits;
    `);

    await client.query(`
      CREATE TRIGGER daily_limits_updated_at
      BEFORE UPDATE ON daily_transfer_limits
      FOR EACH ROW
      EXECUTE FUNCTION update_transaction_updated_at();
    `);

    console.log("Transaction Service database initialized successfully.");
  } catch (error) {
    console.error("Database initialization error:", error);
    throw error;
  } finally {
    client.release();
  }
};

const logTransactionEvent = async ({
  transferId = null,
  userId = null,
  eventType,
  ipAddress = null,
  userAgent = null,
  success,
  metadata = null,
}) => {
  try {
    await pool.query(
      `
        INSERT INTO transaction_audit_logs (
          transfer_id,
          user_id,
          event_type,
          ip_address,
          user_agent,
          success,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        transferId,
        userId,
        eventType,
        ipAddress,
        userAgent,
        success,
        metadata ? JSON.stringify(metadata) : null,
      ],
    );
  } catch (error) {
    console.error("Failed to write transaction audit log:", error.message);
  }
};

export { pool, initDatabase, logTransactionEvent };
