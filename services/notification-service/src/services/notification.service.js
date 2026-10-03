import { query, getClient } from "../db/db.js";

import emailService from "./email.service.js";
import smsService from "./sms.service.js";
import pushService from "./push.service.js";

import config from "../config/config.js";

import {
  getOffset,
  getPagination,
  renderTemplate,
  sleep,
} from "../utils/helpers.js";

class NotificationService {
  // EVENT IDEMPOTENCY
  async isEventProcessed(eventId) {
    const result = await query(
      `
        SELECT id
        FROM processed_events
        WHERE event_id = $1
        `,
      [eventId],
    );
    return result.rows.length > 0;
  }

  async markEventProcessed(eventId, eventType, topic) {
    await query(
      `
      INSERT INTO processed_events
      (
        event_id,
        event_type,
        topic
      )
      VALUES ($1, $2, $3)
      ON CONFLICT (event_id)
      DO NOTHING
      `,
      [eventId, eventType, topic],
    );
  }

  // TEMPLATES
  async getTemplate(templateKey) {
    const result = await query(
      `
        SELECT *
        FROM notification_templates
        WHERE template_key = $1
        AND is_active = TRUE
        `,
      [templateKey],
    );
    return result.rows[0] || null;
  }


  // CREATE NOTIFICATION
  async createNotification(data) {
    const {
      userId,
      recipient,
      channel,
      eventType,
      subject,
      content,
      priority = "NORMAL",
      metadata = null,
    } = data;
    const result = await query(
      `
        INSERT INTO notifications
        (
          user_id,
          recipient,
          channel,
          event_type,
          subject,
          content,
          priority,
          metadata
        )
        VALUES
        (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8
        )
        RETURNING *
        `,
      [
        userId || null,
        recipient,
        channel,
        eventType,
        subject || null,
        content,
        priority,
        metadata,
      ],
    );
    return result.rows[0];
  }

  // USER PREFERENCES
  async getUserPreferences(userId) {
    const result = await query(
      `
        SELECT *
        FROM notification_preferences
        WHERE user_id = $1
        `,
      [userId],
    );
    if (result.rows.length > 0) {
      return result.rows[0];
    }
    const newPreferences = await query(
      `
        INSERT INTO notification_preferences
        (
          user_id
        )
        VALUES ($1)
        ON CONFLICT (user_id)
        DO NOTHING
        RETURNING *
        `,
      [userId],
    );

    if (newPreferences.rows.length > 0) {
      return newPreferences.rows[0];
    }

    const retry = await query(
      `
        SELECT *
        FROM notification_preferences
        WHERE user_id = $1
        `,
      [userId],
    );

    return retry.rows[0];
  }

  async updateUserPreferences(userId, updates) {
    const fieldMap = {
      emailEnabled: "email_enabled",
      smsEnabled: "sms_enabled",
      pushEnabled: "push_enabled",
      marketingEmails: "marketing_emails",
      transactionAlerts: "transaction_alerts",
      securityAlerts: "security_alerts",
    };

    const fields = Object.entries(updates).filter(
      ([key, value]) => fieldMap[key] !== undefined && value !== undefined,
    );

    if (fields.length === 0) {
      throw new Error("No valid preference fields supplied");
    }

    const columns = ["user_id"];
    const values = [userId];
    const placeholders = ["$1"];
    let parameterIndex = 2;
    for (const [key, value] of fields) {
      columns.push(fieldMap[key]);
      values.push(value);
      placeholders.push(`$${parameterIndex}`);
      parameterIndex++;
    }

    const updateFields = fields.map(
      ([key]) => `${fieldMap[key]} = EXCLUDED.${fieldMap[key]}`,
    );

    const result = await query(
      `
        INSERT INTO notification_preferences
        (
          ${columns.join(", ")}
        )
        VALUES
        (
          ${placeholders.join(", ")}
        )
        ON CONFLICT (user_id)
        DO UPDATE SET
          ${updateFields.join(", ")}
        RETURNING *
        `,
      values,
    );
    return result.rows[0];
  }

  // CHECK WHETHER EVENT TYPE IS ALLOWED
  async isNotificationAllowed({ userId, channel, eventType }) {
    if (!userId) {
      return true;
    }
    const preferences = await this.getUserPreferences(userId);
    // Security events
    const securityEvents = [
      "USER_REGISTERED",
      "LOGIN_SUCCESS",
      "PASSWORD_CHANGED",
    ];
    // Transaction events
    const transactionEvents = [
      "TRANSFER_COMPLETED",
      "TRANSFER_FAILED",
      "DEPOSIT",
      "WITHDRAWAL",
    ];

    if (securityEvents.includes(eventType) && !preferences.security_alerts) {
      return false;
    }
    if (
      transactionEvents.includes(eventType) &&
      !preferences.transaction_alerts
    ) {
      return false;
    }
    if (channel === "EMAIL" && !preferences.email_enabled) {
      return false;
    }
    if (channel === "SMS" && !preferences.sms_enabled) {
      return false;
    }
    if (channel === "PUSH" && !preferences.push_enabled) {
      return false;
    }

    return true;
  }

  // DISPATCH
  async dispatch(notification) {
    const { id, channel, recipient, subject, content, metadata } = notification;
    let result;
    try {
      switch (channel) {
        case "EMAIL":
          result = await emailService.sendEmail({
            to: recipient,
            subject: subject || "Banking App Notification",
            html: content,
          });
          break;
        case "SMS":
          result = await smsService.sendSms({
            to: recipient,
            message: content,
          });
          break;
        case "PUSH":
          result = await pushService.sendPush({
            token: recipient,
            title: subject || "Banking App",
            body: content,
            data: metadata,
          });
          break;
        default:
          throw new Error(`Unsupported notification channel: ${channel}`);
      }
      if (!result.success) {
        throw new Error(result.error || "Notification provider failed");
      }
      await query(
        `
        UPDATE notifications
        SET
          status = 'SENT',
          sent_at = CURRENT_TIMESTAMP,
          provider_response = $1
        WHERE id = $2
        `,
        [JSON.stringify(result), id],
      );
      return {
        success: true,
        notificationId: id,
        provider: result,
      };
    } catch (error) {
      await query(
        `
        UPDATE notifications
        SET
          status = 'FAILED',
          retry_count = retry_count + 1,
          error_message = $1
        WHERE id = $2
        `,
        [error.message, id],
      );
      console.error(`Notification ${id} failed:`, error.message);
      return {
        success: false,
        notificationId: id,
        error: error.message,
      };
    }
  }

  // DISPATCH WITH RETRIES
  async dispatchWithRetry(notification) {
    let result;
    for (let attempt = 1; attempt <= config.retry.maxAttempts; attempt++) {
      result = await this.dispatch(notification);
      if (result.success) {
        return result;
      }
      if (attempt < config.retry.maxAttempts) {
        await sleep(config.retry.delayMs);
      }
    }
    return result;
  }

  // BUILD EVENT NOTIFICATION
  buildNotification(eventType, payload) {
    const fullName = payload.fullName || "Customer";
    const email = payload.email;
    const userId = payload.userId;
    switch (eventType) {
      case "USER_REGISTERED":
        return {
          userId,
          recipient: email,
          channel: "EMAIL",
          eventType,
          templateKey: "USER_REGISTERED_EMAIL",
          variables: {
            fullName,
            email,
          },
        };
      case "LOGIN_SUCCESS":
        return {
          userId,
          recipient: email,
          channel: "EMAIL",
          eventType,
          templateKey: "LOGIN_ALERT_EMAIL",
          variables: {
            fullName,
            time: payload.time || new Date().toLocaleString("en-IN"),
            ip: payload.ip || "Unknown",
          },
        };

      case "PASSWORD_CHANGED":
        return {
          userId,
          recipient: email,
          channel: "EMAIL",
          eventType,
          templateKey: "PASSWORD_CHANGED_EMAIL",
          variables: {
            fullName,
            time: payload.time || new Date().toLocaleString("en-IN"),
          },
        };

      case "PROFILE_CREATED":
        return {
          userId,
          recipient: email,
          channel: "EMAIL",
          eventType,
          templateKey: "PROFILE_CREATED_EMAIL",
          variables: {
            fullName,
          },
        };

      case "PROFILE_UPDATED":
        return {
          userId,
          recipient: email,
          channel: "EMAIL",
          eventType,
          templateKey: "PROFILE_UPDATED_EMAIL",
          variables: {
            fullName,
          },
        };

      case "ACCOUNT_CREATED":
        return {
          userId,
          recipient: email,
          channel: "EMAIL",
          eventType,
          templateKey: "ACCOUNT_CREATED_EMAIL",
          variables: {
            fullName,
            accountType: payload.accountType,
            accountNumber: payload.accountNumber,
          },
        };

      case "ACCOUNT_CLOSED":
        return {
          userId,
          recipient: email,
          channel: "EMAIL",
          eventType,
          templateKey: "ACCOUNT_CLOSED_EMAIL",
          variables: {
            fullName,
            accountNumber: payload.accountNumber,
          },
        };

      case "DEPOSIT":
        return {
          userId,
          recipient: email,
          channel: "EMAIL",
          eventType,
          templateKey: "DEPOSIT_EMAIL",
          variables: {
            fullName,
            amount: payload.amount,
            currency: payload.currency || "INR",
            accountNumber: payload.accountNumber,
          },
        };

      case "WITHDRAWAL":
        return {
          userId,
          recipient: email,
          channel: "EMAIL",
          eventType,
          templateKey: "WITHDRAWAL_EMAIL",
          variables: {
            fullName,
            amount: payload.amount,
            currency: payload.currency || "INR",
            accountNumber: payload.accountNumber,
          },
        };

      case "TRANSFER_COMPLETED":
        return {
          userId,
          recipient: email,
          channel: "EMAIL",
          eventType,
          templateKey: "TRANSFER_COMPLETED_EMAIL",
          variables: {
            fullName,
            amount: payload.amount,
            currency: payload.currency || "INR",
            toAccountNumber: payload.toAccountNumber,
            referenceId: payload.referenceId,
          },
        };

      case "TRANSFER_FAILED":
        return {
          userId,
          recipient: email,
          channel: "EMAIL",
          eventType,
          templateKey: "TRANSFER_FAILED_EMAIL",
          variables: {
            fullName,
            amount: payload.amount,
            currency: payload.currency || "INR",
            reason: payload.reason || "Unknown error",
            referenceId: payload.referenceId || "N/A",
          },
        };
      default:
        return null;
    }
  }

  // PROCESS KAFKA EVENT
  async processEvent(eventType, payload, topic, eventId) {
    if (!eventId) {
      throw new Error("Kafka event is missing eventId");
    }
    if (!eventType) {
      throw new Error("Kafka event is missing eventType");
    }
    // Idempotency
    if (await this.isEventProcessed(eventId)) {
      console.log(`Event already processed: ${eventId}`);
      return {
        skipped: true,
        reason: "Event already processed",
      };
    }

    try {
      const notification = this.buildNotification(eventType, payload);
      // Unknown event
      if (!notification) {
        console.log(`No notification handler for ${eventType}`);
        await this.markEventProcessed(eventId, eventType, topic);
        return {
          skipped: true,
          reason: "No notification handler",
        };
      }

      // Validate recipient
      if (!notification.recipient) {
        throw new Error(`No recipient available for event ${eventType}`);
      }

      // Check preferences
      const allowed = await this.isNotificationAllowed({
        userId: notification.userId,
        channel: notification.channel,
        eventType,
      });
      if (!allowed) {
        console.log(`Notification blocked by user preferences: ${eventType}`);
        await this.markEventProcessed(eventId, eventType, topic);
        return {
          skipped: true,
          reason: "Blocked by notification preferences",
        };
      }

      // Template
      const template = await this.getTemplate(notification.templateKey);
      if (!template) {
        throw new Error(`Template not found: ${notification.templateKey}`);
      }
      const content = renderTemplate(template.body, notification.variables);
      const subject = renderTemplate(
        template.subject || "Banking App Notification",
        notification.variables,
      );

      // Store notification
      const created = await this.createNotification({
        userId: notification.userId,
        recipient: notification.recipient,
        channel: notification.channel,
        eventType,
        subject,
        content,
        metadata: {
          eventId,
          topic,
          variables: notification.variables,
        },
      });
      // Send
      const result = await this.dispatchWithRetry(created);
      // Mark Kafka event processed
      await this.markEventProcessed(eventId, eventType, topic);
      return {
        success: result.success,
        notificationId: created.id,
        eventId,
      };
    } catch (error) {
      console.error(`Failed to process event ${eventId}:`, error.message);
      throw error;
    }
  }


  // CUSTOM INTERNAL NOTIFICATION
  async sendCustomNotification(data) {
    const notification = await this.createNotification(data);
    const result = await this.dispatchWithRetry(notification);
    return {
      notification,
      dispatchResult: result,
    };
  }

  // GET NOTIFICATION
  async getNotificationById(id) {
    const result = await query(
      `
        SELECT *
        FROM notifications
        WHERE id = $1
        `,
      [id],
    );
    if (result.rows.length === 0) {
      throw new Error("Notification not found");
    }
    return result.rows[0];
  }

  // GET USER NOTIFICATION
  async getUserNotificationById(id, userId) {
    const result = await query(
      `
        SELECT *
        FROM notifications
        WHERE id = $1
        AND user_id = $2
        `,
      [id, userId],
    );
    if (result.rows.length === 0) {
      throw new Error("Notification not found");
    }
    return result.rows[0];
  }

  // LIST NOTIFICATIONS
  async listNotifications(params) {
    const {
      page = 1,
      limit = 10,
      channel,
      status,
      eventType,
      userId,
      sortBy = "created_at",
      sortOrder = "DESC",
    } = params;

    const conditions = [];
    const queryParams = [];
    let index = 1;
    if (channel) {
      conditions.push(`channel = $${index}`);
      queryParams.push(channel);
      index++;
    }
    if (status) {
      conditions.push(`status = $${index}`);
      queryParams.push(status);
      index++;
    }
    if (eventType) {
      conditions.push(`event_type = $${index}`);
      queryParams.push(eventType);
      index++;
    }
    if (userId) {
      conditions.push(`user_id = $${index}`);
      queryParams.push(userId);
      index++;
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const countResult = await query(
      `
        SELECT COUNT(*) AS count
        FROM notifications
        ${where}
        `,
      queryParams,
    );
    const total = parseInt(countResult.rows[0].count, 10);
    const offset = getOffset(page, limit);
    const result = await query(
      `
        SELECT *
        FROM notifications
        ${where}
        ORDER BY
          ${sortBy}
          ${sortOrder}
        LIMIT $${index}
        OFFSET $${index + 1}
        `,
      [...queryParams, limit, offset],
    );
    return {
      notifications: result.rows,
      pagination: getPagination(page, limit, total),
    };
  }

  // MARK AS READ
  async markAsRead(id, userId) {
    const result = await query(
      `
        UPDATE notifications
        SET
          status = 'READ',
          read_at = CURRENT_TIMESTAMP
        WHERE id = $1
        AND user_id = $2
        RETURNING *
        `,
      [id, userId],
    );
    if (result.rows.length === 0) {
      throw new Error("Notification not found");
    }
    return result.rows[0];
  }
}

export default new NotificationService();
