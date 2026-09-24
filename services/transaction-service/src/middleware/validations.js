import Joi from "joi";
import config from "../config/config.js";

const transferSchema = Joi.object({
  fromAccountId: Joi.string().uuid().required(),

  toAccountNumber: Joi.string()
    .pattern(/^\d{10,20}$/)
    .required(),

  amount: Joi.number()
    .positive()
    .min(config.transfer.minAmount)
    .max(config.transfer.maxAmount)
    .precision(2)
    .required(),

  description: Joi.string().max(255).allow("").optional(),

  idempotencyKey: Joi.string().max(255).optional(),
});

const transferIdSchema = Joi.object({
  id: Joi.string().uuid().required(),
});

const referenceIdSchema = Joi.object({
  referenceId: Joi.string().max(100).required(),
});

const transferQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(config.pagination.defaultPage),

  limit: Joi.number()
    .integer()
    .min(1)
    .max(config.pagination.maxLimit)
    .default(config.pagination.defaultLimit),

  status: Joi.string()
    .valid("PENDING", "PROCESSING", "COMPLETED", "FAILED", "REVERSED")
    .optional(),

  type: Joi.string().valid("P2P").optional(),

  fromDate: Joi.date().iso().optional(),

  toDate: Joi.date().iso().optional(),

  sortBy: Joi.string()
    .valid("created_at", "amount", "status")
    .default("created_at"),

  sortOrder: Joi.string().valid("ASC", "DESC").default("DESC"),
});

const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: error.details.map((detail) => detail.message),
      });
    }

    req.body = value;
    next();
  };
};

const validateParams = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        error: "Invalid parameters",
        details: error.details.map((detail) => detail.message),
      });
    }

    req.params = value;
    next();
  };
};

const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      convert: true,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        error: "Invalid query parameters",
        details: error.details.map((detail) => detail.message),
      });
    }

    req.query = value;
    next();
  };
};

export {
  transferSchema,
  transferIdSchema,
  referenceIdSchema,
  transferQuerySchema,
  validate,
  validateParams,
  validateQuery,
};
