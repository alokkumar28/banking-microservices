import Joi from "joi";
// Create account validation
const createAccountSchema = Joi.object({
  accountType: Joi.string()
    .valid("SAVINGS", "CURRENT", "FIXED_DEPOSIT")
    .required()
    .messages({
      "any.only": "Account type must be SAVINGS, CURRENT, or FIXED_DEPOSIT",
      "any.required": "Account type is required",
    }),

  currency: Joi.string()
    .length(3)
    .uppercase()
    .default("INR")
    .messages({
      "string.length": "Currency must be a 3-letter code",
    }),

  branchName: Joi.string().max(255).optional(),

  ifscCode: Joi.string()
    .pattern(/^[A-Z]{4}0[A-Z0-9]{6}$/)
    .optional()
    .messages({
      "string.pattern.base": "Invalid IFSC code format",
    }),
});

// Update account validation
const updateAccountSchema = Joi.object({
  branchName: Joi.string().max(255).optional(),
  dailyTransferLimit: Joi.number().positive().optional(),
}).min(1);

// Deposit/Withdraw validation
const transactionSchema = Joi.object({
  amount: Joi.number()
    .positive()
    .precision(2)
    .required()
    .messages({
      "number.positive": "Amount must be positive",
      "any.required": "Amount is required",
    }),

  description: Joi.string().max(500).optional(),

  referenceId: Joi.string().max(100).optional(),
});

// Transfer validation
const transferSchema = Joi.object({
  fromAccountId: Joi.string().uuid().required(),
  toAccountNumber: Joi.string().min(10).max(20).required(),
  amount: Joi.number().positive().precision(2).required(),
  description: Joi.string().max(500).optional(),
});

// Account ID validation
const accountIdSchema = Joi.object({
  accountId: Joi.string().uuid().required().messages({
    "string.guid": "Invalid account ID format",
    "any.required": "Account ID is required",
  }),
});

// Query validation
const accountQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  status: Joi.string()
    .valid("ACTIVE", "INACTIVE", "FROZEN", "CLOSED")
    .optional(),
  accountType: Joi.string()
    .valid("SAVINGS", "CURRENT", "FIXED_DEPOSIT")
    .optional(),
});

export {
  createAccountSchema,
  updateAccountSchema,
  transactionSchema,
  transferSchema,
  accountIdSchema,
  accountQuerySchema,
};