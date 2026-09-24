import crypto from "crypto";

const generateReferenceId = () => {
  const timestamp = Date.now()
    .toString(36)
    .toUpperCase();
  const random = crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase();
  return `TXN${timestamp}${random}`;
};

const generateIdempotencyHash = (data) => {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(data))
    .digest("hex");
};

const getPagination = (page, limit, total) => {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
};

const getOffset = (page, limit) => {
  return (page - 1) * limit;
};

const formatAmount = (amount) => {
  return parseFloat(
    parseFloat(amount).toFixed(2)
  );
};

const maskAccountNumber = (accountNumber) => {
  if (!accountNumber || accountNumber.length < 4) {
    return accountNumber;
  }

  return `****${accountNumber.slice(-4)}`;
};

const sanitizeTransfer = (transfer) => {
  if (!transfer) {
    return null;
  }

  return {
    id: transfer.id,
    referenceId: transfer.reference_id,

    fromAccountId: transfer.from_account_id,
    fromUserId: transfer.from_user_id,

    toAccountId: transfer.to_account_id,
    toUserId: transfer.to_user_id,

    amount: formatAmount(transfer.amount),
    currency: transfer.currency,

    fee: formatAmount(transfer.fee),

    status: transfer.status,
    transferType: transfer.transfer_type,

    description: transfer.description,
    failureReason: transfer.failure_reason,

    createdAt: transfer.created_at,
    updatedAt: transfer.updated_at,
    completedAt: transfer.completed_at,
  };
};

export {
  generateReferenceId,
  generateIdempotencyHash,
  getPagination,
  getOffset,
  formatAmount,
  maskAccountNumber,
  sanitizeTransfer,
};