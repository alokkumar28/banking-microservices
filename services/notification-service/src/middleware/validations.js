import Joi from "joi";

const sendNotificationSchema = Joi.object({
  userId: Joi.string().uuid().optional(),
  recipient: Joi.string().trim().required(),
  channel: Joi.string().valid("EMAIL", "SMS", "PUSH").required(),
  eventType: Joi.string().trim().max(100).required(),
  subject: Joi.string().trim().max(255).optional(),
  content: Joi.string().required(),
  priority: Joi.string()
    .valid("LOW", "NORMAL", "HIGH", "URGENT")
    .default("NORMAL"),

  metadata: Joi.object().optional(),
});

const notificationIdSchema = Joi.object({
  id: Joi.string().uuid().required(),
});

const notificationQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  channel: Joi.string().valid("EMAIL", "SMS", "PUSH").optional(),
  status: Joi.string()
    .valid("PENDING", "SENT", "FAILED", "DELIVERED", "READ")
    .optional(),

  eventType: Joi.string().max(100).optional(),
  userId: Joi.string().uuid().optional(),

  sortBy: Joi.string()
    .valid("created_at", "sent_at", "status")
    .default("created_at"),

  sortOrder: Joi.string().valid("ASC", "DESC").default("DESC"),
});

const updatePreferencesSchema = Joi.object({
  emailEnabled: Joi.boolean(),
  smsEnabled: Joi.boolean(),
  pushEnabled: Joi.boolean(),
  marketingEmails: Joi.boolean(),
  transactionAlerts: Joi.boolean(),
  securityAlerts: Joi.boolean(),
}).min(1);

export {
  sendNotificationSchema,
  notificationIdSchema,
  notificationQuerySchema,
  updatePreferencesSchema,
};

export default {
  sendNotificationSchema,
  notificationIdSchema,
  notificationQuerySchema,
  updatePreferencesSchema,
};
