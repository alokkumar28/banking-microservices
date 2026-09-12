import { pool, logAccountEvent } from "../db/db.js";
import {
  createAccountSchema,
  updateAccountSchema,
  transactionSchema,
  transferSchema,
  accountIdSchema,
  accountQuerySchema,
} from "../middleware/validations.js";
import {
  generateAccountNumber,
  generateReferenceId,
  getPagination,
  getOffset,
} from "../utils/helpers.js";

// CREATE ACCOUNT
const createAccount = async (req, res) => {
  const client = await pool.connect();
  try {
    const { error, value } = createAccountSchema.validate(req.body, {
      abortEarly: false,
    });
    if (error) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.details.map((detail) => detail.message),
      });
    }
    const userId = req.user.userId;
    const { accountType, currency, branchName, ifscCode } = value;
    const accountCount = await client.query(
      `SELECT COUNT(*) FROM accounts 
       WHERE user_id = $1 AND status != 'CLOSED'`,
      [userId],
    );
    if (parseInt(accountCount.rows[0].count) >= 5) {
      return res.status(409).json({
        error: "Account limit reached",
        message: "Maximum 5 active accounts allowed per user",
      });
    }
    let accountNumber;
    let isUnique = false;
    while (!isUnique) {
      accountNumber = generateAccountNumber();
      const check = await client.query(
        "SELECT id FROM accounts WHERE account_number = $1",
        [accountNumber],
      );
      if (check.rows.length === 0) isUnique = true;
    }
    const result = await client.query(
      `INSERT INTO accounts (
        user_id, account_number, account_type, currency,
        branch_name, ifsc_code
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING 
        id, user_id, account_number, account_type, currency,
        balance, available_balance, status, ifsc_code,
        branch_name, daily_transfer_limit, created_at, updated_at`,
      [
        userId,
        accountNumber,
        accountType,
        currency || "INR",
        branchName || null,
        ifscCode || null,
      ],
    );
    const account = result.rows[0];
    await logAccountEvent(
      "ACCOUNT_CREATED",
      userId,
      account.id,
      true,
      req.ip,
      req.headers["user-agent"],
      { accountType, accountNumber },
    );
    return res.status(201).json({
      message: "Account created successfully",
      account,
    });
  } catch (error) {
    console.error("Create account error:", error);
    return res.status(500).json({
      error: "Failed to create account",
      message: "Internal server error",
    });
  } finally {
    client.release();
  }
};

// GET ALL ACCOUNTS (Current User)
const getAccounts = async (req, res) => {
  const client = await pool.connect();
  try {
    const { error, value } = accountQuerySchema.validate(req.query, {
      abortEarly: false,
    });
    if (error) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.details.map((detail) => detail.message),
      });
    }
    const userId = req.user.userId;
    const { page, limit, status, accountType } = value;
    const offset = getOffset(page, limit);
    const conditions = ["user_id = $1"];
    const params = [userId];
    let paramIndex = 2;
    if (status) {
      conditions.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }
    if (accountType) {
      conditions.push(`account_type = $${paramIndex}`);
      params.push(accountType);
      paramIndex++;
    }
    const whereClause = `WHERE ${conditions.join(" AND ")}`;
    const countResult = await client.query(
      `SELECT COUNT(*) FROM accounts ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count);
    const result = await client.query(
      `SELECT 
        id, user_id, account_number, account_type, currency,
        balance, available_balance, status, ifsc_code,
        branch_name, daily_transfer_limit, created_at, updated_at
       FROM accounts
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset],
    );
    return res.status(200).json({
      accounts: result.rows,
      pagination: getPagination(page, limit, total),
    });
  } catch (error) {
    console.error("Get accounts error:", error);
    return res.status(500).json({
      error: "Failed to get accounts",
      message: "Internal server error",
    });
  } finally {
    client.release();
  }
};

// GET ACCOUNT BY ID
const getAccountById = async (req, res) => {
  const client = await pool.connect();
  try {
    const { error, value } = accountIdSchema.validate(
      { accountId: req.params.id },
      { abortEarly: false },
    );
    if (error) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.details.map((detail) => detail.message),
      });
    }
    const userId = req.user.userId;
    const result = await client.query(
      `SELECT 
        id, user_id, account_number, account_type, currency,
        balance, available_balance, status, ifsc_code,
        branch_name, daily_transfer_limit, created_at, updated_at
       FROM accounts
       WHERE id = $1 AND user_id = $2`,
      [value.accountId, userId],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Account not found",
        message: "Account does not exist or does not belong to you",
      });
    }
    return res.status(200).json({
      account: result.rows[0],
    });
  } catch (error) {
    console.error("Get account error:", error);
    return res.status(500).json({
      error: "Failed to get account",
      message: "Internal server error",
    });
  } finally {
    client.release();
  }
};

// UPDATE ACCOUNT
const updateAccount = async (req, res) => {
  const client = await pool.connect();
  try {
    const { error: idError, value: idValue } = accountIdSchema.validate(
      { accountId: req.params.id },
      { abortEarly: false },
    );
    if (idError) {
      return res.status(400).json({
        error: "Validation failed",
        details: idError.details.map((detail) => detail.message),
      });
    }
    const { error, value } = updateAccountSchema.validate(req.body, {
      abortEarly: false,
    });
    if (error) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.details.map((detail) => detail.message),
      });
    }
    const userId = req.user.userId;
  
    const existing = await client.query(
      `SELECT id, status FROM accounts 
       WHERE id = $1 AND user_id = $2`,
      [idValue.accountId, userId],
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({
        error: "Account not found",
      });
    }
    if (existing.rows[0].status === "CLOSED") {
      return res.status(400).json({
        error: "Cannot update closed account",
      });
    }
    const fields = [];
    const values = [];
    let paramIndex = 1;
    if (value.branchName !== undefined) {
      fields.push(`branch_name = $${paramIndex}`);
      values.push(value.branchName);
      paramIndex++;
    }
    if (value.dailyTransferLimit !== undefined) {
      fields.push(`daily_transfer_limit = $${paramIndex}`);
      values.push(value.dailyTransferLimit);
      paramIndex++;
    }
    if (fields.length === 0) {
      return res.status(400).json({
        error: "No fields to update",
      });
    }
    values.push(idValue.accountId);
    values.push(userId);
    const result = await client.query(
      `UPDATE accounts
       SET ${fields.join(", ")}
       WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
       RETURNING 
         id, user_id, account_number, account_type, currency,
         balance, available_balance, status, ifsc_code,
         branch_name, daily_transfer_limit, created_at, updated_at`,
      values,
    );
    await logAccountEvent(
      "ACCOUNT_UPDATED",
      userId,
      idValue.accountId,
      true,
      req.ip,
      req.headers["user-agent"],
      { updatedFields: Object.keys(value) },
    );
    return res.status(200).json({
      message: "Account updated successfully",
      account: result.rows[0],
    });
  } catch (error) {
    console.error("Update account error:", error);
    return res.status(500).json({
      error: "Failed to update account",
      message: "Internal server error",
    });
  } finally {
    client.release();
  }
};

// CLOSE ACCOUNT
const closeAccount = async (req, res) => {
  const client = await pool.connect();
  try {
    const { error, value } = accountIdSchema.validate(
      { accountId: req.params.id },
      { abortEarly: false },
    );
    if (error) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.details.map((detail) => detail.message),
      });
    }
    const userId = req.user.userId;
    const result = await client.query(
      `SELECT id, balance, status FROM accounts 
       WHERE id = $1 AND user_id = $2`,
      [value.accountId, userId],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Account not found",
      });
    }
    const account = result.rows[0];
    if (account.status === "CLOSED") {
      return res.status(400).json({
        error: "Account already closed",
      });
    }
    if (parseFloat(account.balance) > 0) {
      return res.status(400).json({
        error: "Cannot close account with balance",
        message: "Please withdraw or transfer all funds before closing",
      });
    }
    await client.query(
      `UPDATE accounts
       SET status = 'CLOSED', closed_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [value.accountId],
    );
    await logAccountEvent(
      "ACCOUNT_CLOSED",
      userId,
      value.accountId,
      true,
      req.ip,
      req.headers["user-agent"],
    );
    return res.status(200).json({
      message: "Account closed successfully",
    });
  } catch (error) {
    console.error("Close account error:", error);
    return res.status(500).json({
      error: "Failed to close account",
      message: "Internal server error",
    });
  } finally {
    client.release();
  }
};

// DEPOSIT
const deposit = async (req, res) => {
  const client = await pool.connect();
  try {
    const { error: idError, value: idValue } = accountIdSchema.validate(
      { accountId: req.params.id },
      { abortEarly: false },
    );
    if (idError) {
      return res.status(400).json({
        error: "Validation failed",
        details: idError.details.map((detail) => detail.message),
      });
    }
    const { error, value } = transactionSchema.validate(req.body, {
      abortEarly: false,
    });
    if (error) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.details.map((detail) => detail.message),
      });
    }
    const userId = req.user.userId;
    const { amount, description, referenceId } = value;
    await client.query("BEGIN");
    const accountResult = await client.query(
      `SELECT id, balance, status FROM accounts 
       WHERE id = $1 AND user_id = $2
       FOR UPDATE`,
      [idValue.accountId, userId],
    );
    if (accountResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        error: "Account not found",
      });
    }
    const account = accountResult.rows[0];
    if (account.status !== "ACTIVE") {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "Account is not active",
        message: `Account status is ${account.status}`,
      });
    }
    const balanceBefore = parseFloat(account.balance);
    const balanceAfter = balanceBefore + parseFloat(amount);
    await client.query(
      `UPDATE accounts
       SET balance = $1, available_balance = $1
       WHERE id = $2`,
      [balanceAfter, idValue.accountId],
    );
    const txnRef = referenceId || generateReferenceId();
    const txnResult = await client.query(
      `INSERT INTO transactions (
        account_id, transaction_type, amount, balance_before,
        balance_after, description, reference_id, status
      )
      VALUES ($1, 'DEPOSIT', $2, $3, $4, $5, $6, 'COMPLETED')
      RETURNING id, transaction_type, amount, balance_before,
                balance_after, description, reference_id, status, created_at`,
      [
        idValue.accountId,
        amount,
        balanceBefore,
        balanceAfter,
        description || "Deposit",
        txnRef,
      ],
    );
    await client.query("COMMIT");
    await logAccountEvent(
      "DEPOSIT_SUCCESS",
      userId,
      idValue.accountId,
      true,
      req.ip,
      req.headers["user-agent"],
      { amount, referenceId: txnRef },
    );
    return res.status(200).json({
      message: "Deposit successful",
      transaction: txnResult.rows[0],
      newBalance: balanceAfter,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Deposit error:", error);
    return res.status(500).json({
      error: "Deposit failed",
      message: "Internal server error",
    });
  } finally {
    client.release();
  }
};


// WITHDRAW
const withdraw = async (req, res) => {
  const client = await pool.connect();
  try {
    const { error: idError, value: idValue } = accountIdSchema.validate(
      { accountId: req.params.id },
      { abortEarly: false },
    );
    if (idError) {
      return res.status(400).json({
        error: "Validation failed",
        details: idError.details.map((detail) => detail.message),
      });
    }
    const { error, value } = transactionSchema.validate(req.body, {
      abortEarly: false,
    });
    if (error) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.details.map((detail) => detail.message),
      });
    }
    const userId = req.user.userId;
    const { amount, description, referenceId } = value;
    await client.query("BEGIN");
    const accountResult = await client.query(
      `SELECT id, balance, status FROM accounts 
       WHERE id = $1 AND user_id = $2
       FOR UPDATE`,
      [idValue.accountId, userId],
    );
    if (accountResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        error: "Account not found",
      });
    }
    const account = accountResult.rows[0];
    if (account.status !== "ACTIVE") {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "Account is not active",
        message: `Account status is ${account.status}`,
      });
    }
    const balanceBefore = parseFloat(account.balance);
    if (balanceBefore < parseFloat(amount)) {
      await client.query("ROLLBACK");
      await logAccountEvent(
        "WITHDRAW_FAILED",
        userId,
        idValue.accountId,
        false,
        req.ip,
        req.headers["user-agent"],
        { amount, reason: "Insufficient balance" },
      );
      return res.status(400).json({
        error: "Insufficient balance",
        message: `Available balance: ${balanceBefore}`,
      });
    }
    const balanceAfter = balanceBefore - parseFloat(amount);
    await client.query(
      `UPDATE accounts
       SET balance = $1, available_balance = $1
       WHERE id = $2`,
      [balanceAfter, idValue.accountId],
    );
    const txnRef = referenceId || generateReferenceId();
    const txnResult = await client.query(
      `INSERT INTO transactions (
        account_id, transaction_type, amount, balance_before,
        balance_after, description, reference_id, status
      )
      VALUES ($1, 'WITHDRAWAL', $2, $3, $4, $5, $6, 'COMPLETED')
      RETURNING id, transaction_type, amount, balance_before,
                balance_after, description, reference_id, status, created_at`,
      [
        idValue.accountId,
        amount,
        balanceBefore,
        balanceAfter,
        description || "Withdrawal",
        txnRef,
      ],
    );
    await client.query("COMMIT");
    await logAccountEvent(
      "WITHDRAW_SUCCESS",
      userId,
      idValue.accountId,
      true,
      req.ip,
      req.headers["user-agent"],
      { amount, referenceId: txnRef },
    );
    return res.status(200).json({
      message: "Withdrawal successful",
      transaction: txnResult.rows[0],
      newBalance: balanceAfter,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Withdraw error:", error);
    return res.status(500).json({
      error: "Withdrawal failed",
      message: "Internal server error",
    });
  } finally {
    client.release();
  }
};

// GET TRANSACTIONS
const getTransactions = async (req, res) => {
  const client = await pool.connect();
  try {
    const { error, value } = accountIdSchema.validate(
      { accountId: req.params.id },
      { abortEarly: false },
    );
    if (error) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.details.map((detail) => detail.message),
      });
    }
    const userId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const offset = getOffset(page, limit);
    const accountCheck = await client.query(
      "SELECT id FROM accounts WHERE id = $1 AND user_id = $2",
      [value.accountId, userId],
    );
    if (accountCheck.rows.length === 0) {
      return res.status(404).json({
        error: "Account not found",
      });
    }
    const countResult = await client.query(
      "SELECT COUNT(*) FROM transactions WHERE account_id = $1",
      [value.accountId],
    );
    const total = parseInt(countResult.rows[0].count);
    const result = await client.query(
      `SELECT 
        id, account_id, transaction_type, amount, balance_before,
        balance_after, description, reference_id, status, created_at
       FROM transactions
       WHERE account_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [value.accountId, limit, offset],
    );
    return res.status(200).json({
      transactions: result.rows,
      pagination: getPagination(page, limit, total),
    });
  } catch (error) {
    console.error("Get transactions error:", error);
    return res.status(500).json({
      error: "Failed to get transactions",
      message: "Internal server error",
    });
  } finally {
    client.release();
  }
};

export {
  createAccount,
  getAccounts,
  getAccountById,
  updateAccount,
  closeAccount,
  deposit,
  withdraw,
  getTransactions,
};
