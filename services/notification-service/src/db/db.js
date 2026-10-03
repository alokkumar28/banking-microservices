import pg from "pg";
import config from "../config/config.js";

const { Pool } = pg;

const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  max: config.db.max,
  idleTimeoutMillis: config.db.idleTimeoutMillis,
  connectionTimeoutMillis: config.db.connectionTimeoutMillis,
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error);
});

const query = (text, params) => {
  return pool.query(text, params);
};

const getClient = () => {
  return pool.connect();
};

const initDatabase = async () => {
  const client = await pool.connect();

  try {
    console.log("Initializing notification database...");
    await client.query(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
    `);

    // notifications
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        recipient VARCHAR(255) NOT NULL,
        channel VARCHAR(20) NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        subject VARCHAR(255),
        content TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        priority VARCHAR(10) NOT NULL DEFAULT 'NORMAL',
        metadata JSONB,
        provider_response JSONB,
        retry_count INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        sent_at TIMESTAMP,
        delivered_at TIMESTAMP,
        read_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT valid_notification_channel
          CHECK (
            channel IN (
              'EMAIL',
              'SMS',
              'PUSH'
            )
          ),

        CONSTRAINT valid_notification_status
          CHECK (
            status IN (
              'PENDING',
              'SENT',
              'FAILED',
              'DELIVERED',
              'READ'
            )
          ),

        CONSTRAINT valid_notification_priority
          CHECK (
            priority IN (
              'LOW',
              'NORMAL',
              'HIGH',
              'URGENT'
            )
          )
      );
    `);

    // notification templates
    await client.query(`
      CREATE TABLE IF NOT EXISTS notification_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        template_key VARCHAR(100) UNIQUE NOT NULL,
        channel VARCHAR(20) NOT NULL,
        subject VARCHAR(255),
        body TEXT NOT NULL,
        variables JSONB DEFAULT '[]',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT valid_template_channel
          CHECK (
            channel IN (
              'EMAIL',
              'SMS',
              'PUSH'
            )
          )
      );
    `);

    // notification preferences
    await client.query(`
      CREATE TABLE IF NOT EXISTS notification_preferences (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID UNIQUE NOT NULL,
        email_enabled BOOLEAN DEFAULT TRUE,
        sms_enabled BOOLEAN DEFAULT FALSE,
        push_enabled BOOLEAN DEFAULT TRUE,
        marketing_emails BOOLEAN DEFAULT FALSE,
        transaction_alerts BOOLEAN DEFAULT TRUE,
        security_alerts BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // processed Kafka events
    await client.query(`
      CREATE TABLE IF NOT EXISTS processed_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id VARCHAR(255) UNIQUE NOT NULL,
        event_type VARCHAR(100) NOT NULL,
        topic VARCHAR(100) NOT NULL,
        processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS
      idx_notifications_user_id
      ON notifications(user_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS
      idx_notifications_status
      ON notifications(status);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS
      idx_notifications_channel
      ON notifications(channel);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS
      idx_notifications_event_type
      ON notifications(event_type);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS
      idx_notifications_created_at
      ON notifications(created_at DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS
      idx_processed_events_event_id
      ON processed_events(event_id);
    `);

    // updated_at function
    await client.query(`
      CREATE OR REPLACE FUNCTION
      update_notification_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // notifications trigger
    await client.query(`
      DROP TRIGGER IF EXISTS
      update_notifications_updated_at
      ON notifications;
    `);

    await client.query(`
      CREATE TRIGGER
      update_notifications_updated_at
      BEFORE UPDATE
      ON notifications
      FOR EACH ROW
      EXECUTE FUNCTION
      update_notification_updated_at();
    `);

    // preferences trigger
    await client.query(`
      DROP TRIGGER IF EXISTS
      update_preferences_updated_at
      ON notification_preferences;
    `);

    await client.query(`
      CREATE TRIGGER
      update_preferences_updated_at
      BEFORE UPDATE
      ON notification_preferences
      FOR EACH ROW
      EXECUTE FUNCTION
      update_notification_updated_at();
    `);

    // templates
    await client.query(`
      INSERT INTO notification_templates
      (
        template_key,
        channel,
        subject,
        body,
        variables
      )

      VALUES
      (
        'USER_REGISTERED_EMAIL',
        'EMAIL',
        'Welcome to Banking App!',
        '<h1>Welcome {{fullName}}!</h1>
         <p>Your banking account has been registered successfully.</p>
         <p>Email: {{email}}</p>',
        '["fullName", "email"]'::jsonb
      ),
      (
        'LOGIN_ALERT_EMAIL',
        'EMAIL',
        'New Login Detected',
        '<h1>New Login Detected</h1>
         <p>Hello {{fullName}},</p>
         <p>A successful login was detected.</p>
         <p>Time: {{time}}</p>
         <p>IP Address: {{ip}}</p>',
        '["fullName", "time", "ip"]'::jsonb
      ),
      (
        'PASSWORD_CHANGED_EMAIL',
        'EMAIL',
        'Password Changed',
        '<h1>Password Changed</h1>
         <p>Hello {{fullName}},</p>
         <p>Your password was changed successfully.</p>
         <p>Time: {{time}}</p>',
        '["fullName", "time"]'::jsonb
      ),
      (
        'PROFILE_CREATED_EMAIL',
        'EMAIL',
        'Profile Created',
        '<h1>Profile Created</h1>
         <p>Hello {{fullName}},</p>
         <p>Your customer profile has been created successfully.</p>',
        '["fullName"]'::jsonb
      ),
      (
        'PROFILE_UPDATED_EMAIL',
        'EMAIL',
        'Profile Updated',
        '<h1>Profile Updated</h1>
         <p>Hello {{fullName}},</p>
         <p>Your profile information was updated successfully.</p>',
        '["fullName"]'::jsonb
      ),
      (
        'ACCOUNT_CREATED_EMAIL',
        'EMAIL',
        'Bank Account Created',
        '<h1>Account Created</h1>
         <p>Hello {{fullName}},</p>
         <p>Your {{accountType}} account has been created.</p>
         <p>Account Number: {{accountNumber}}</p>',
        '["fullName", "accountType", "accountNumber"]'::jsonb
      ),
      (
        'ACCOUNT_CLOSED_EMAIL',
        'EMAIL',
        'Bank Account Closed',
        '<h1>Account Closed</h1>
         <p>Hello {{fullName}},</p>
         <p>Your account {{accountNumber}} has been closed.</p>',
        '["fullName", "accountNumber"]'::jsonb
      ),
      (
        'DEPOSIT_EMAIL',
        'EMAIL',
        'Deposit Successful',
        '<h1>Deposit Successful</h1>
         <p>Hello {{fullName}},</p>
         <p>Amount: {{amount}} {{currency}}</p>
         <p>Account: {{accountNumber}}</p>',
        '["fullName", "amount", "currency", "accountNumber"]'::jsonb
      ),
      (
        'WITHDRAWAL_EMAIL',
        'EMAIL',
        'Withdrawal Successful',
        '<h1>Withdrawal Successful</h1>
         <p>Hello {{fullName}},</p>
         <p>Amount: {{amount}} {{currency}}</p>
         <p>Account: {{accountNumber}}</p>',
        '["fullName", "amount", "currency", "accountNumber"]'::jsonb
      ),
      (
        'TRANSFER_COMPLETED_EMAIL',
        'EMAIL',
        'Transfer Successful',
        '<h1>Transfer Successful</h1>
         <p>Hello {{fullName}},</p>
         <p>Amount: {{amount}} {{currency}}</p>
         <p>To Account: {{toAccountNumber}}</p>
         <p>Reference: {{referenceId}}</p>',
        '["fullName", "amount", "currency", "toAccountNumber", "referenceId"]'::jsonb
      ),
      (
        'TRANSFER_FAILED_EMAIL',
        'EMAIL',
        'Transfer Failed',
        '<h1>Transfer Failed</h1>
         <p>Hello {{fullName}},</p>
         <p>Amount: {{amount}} {{currency}}</p>
         <p>Reason: {{reason}}</p>
         <p>Reference: {{referenceId}}</p>',
        '["fullName", "amount", "currency", "reason", "referenceId"]'::jsonb
      )
      ON CONFLICT (template_key)
      DO NOTHING;
    `);

    console.log("Notification database initialized successfully.");
  } catch (error) {
    console.error("Notification database initialization failed:", error);

    throw error;
  } finally {
    client.release();
  }
};

export { pool, query, getClient, initDatabase };

export default {
  pool,
  query,
  getClient,
  initDatabase,
};
