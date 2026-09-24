import axios from "axios";

import config from "../config/config.js";
import { pool, logTransactionEvent } from "../db/db.js";

import {
  generateReferenceId,
  generateIdempotencyHash,
  getPagination,
  getOffset,
  sanitizeTransfer,
} from "../utils/helpers.js";

const getSourceAccount = async (accountId, authToken) => {
  try {
    const response = await axios.get(
      `${config.services.account.url}/api/accounts/${accountId}`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        timeout: 5000,
      },
    );
    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(
        error.response.data?.message || "Unable to fetch source account",
      );
    }
    throw new Error("Account Service is unavailable");
  }
};

const getDestinationAccount = async (accountNumber) => {
  try {
    const response = await axios.get(
      `${config.services.account.url}/internal/accounts/number/${accountNumber}`,
      {
        headers: {
          "X-Internal-Token": config.internalServiceToken,
        },
        timeout: 5000,
      },
    );

    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(
        error.response.data?.message || "Destination account not found",
      );
    }
    throw new Error("Account Service is unavailable");
  }
};

const debitAccount = async (
  accountId,
  amount,
  description,
  referenceId,
  authToken,
) => {
  try {
    const response = await axios.post(
      `${config.services.account.url}/api/accounts/${accountId}/withdraw`,
      {
        amount,
        description,
        referenceId,
      },
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        timeout: 10000,
      },
    );

    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(
        error.response.data?.message || "Unable to debit source account",
      );
    }

    throw new Error("Account Service is unavailable");
  }
};

const creditAccount = async (accountId, amount, description, referenceId) => {
  try {
    const response = await axios.post(
      `${config.services.account.url}/internal/accounts/${accountId}/credit`,
      {
        amount,
        description,
        referenceId,
      },
      {
        headers: {
          "X-Internal-Token": config.internalServiceToken,
        },
        timeout: 10000,
      },
    );

    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(
        error.response.data?.message || "Unable to credit destination account",
      );
    }

    throw new Error("Account Service is unavailable");
  }
};

const getIdempotencyRecord = async (client, idempotencyKey, userId) => {
  if (!idempotencyKey) {
    return null;
  }
  const result = await client.query(
    `
      SELECT *
      FROM idempotency_keys
      WHERE idempotency_key = $1
        AND user_id = $2
        AND expires_at > CURRENT_TIMESTAMP
    `,
    [idempotencyKey, userId],
  );

  return result.rows[0] || null;
};

const saveIdempotencyRecord = async (
  client,
  idempotencyKey,
  userId,
  requestHash,
  responseBody,
  statusCode,
) => {
  if (!idempotencyKey) {
    return;
  }
  await client.query(
    `
      INSERT INTO idempotency_keys (
        idempotency_key,
        user_id,
        request_hash,
        response_body,
        status_code,
        expires_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        CURRENT_TIMESTAMP + INTERVAL '24 hours'
      )
      ON CONFLICT (idempotency_key)
      DO NOTHING
    `,
    [
      idempotencyKey,
      userId,
      requestHash,
      JSON.stringify(responseBody),
      statusCode,
    ],
  );
};

const checkDailyLimit = async (client, userId, accountId, amount) => {
  const result = await client.query(
    `
      SELECT *
      FROM daily_transfer_limits
      WHERE user_id = $1
        AND account_id = $2
        AND transfer_date = CURRENT_DATE
      FOR UPDATE
    `,
    [userId, accountId],
  );
  let limitRecord = result.rows[0];
  if (!limitRecord) {
    const insertResult = await client.query(
      `
        INSERT INTO daily_transfer_limits (
          user_id,
          account_id,
          transfer_date,
          total_transferred,
          transfer_count,
          daily_limit
        )
        VALUES (
          $1,
          $2,
          CURRENT_DATE,
          0,
          0,
          $3
        )
        RETURNING *
      `,
      [userId, accountId, config.transfer.defaultDailyLimit],
    );

    limitRecord = insertResult.rows[0];
  }

  const currentTotal = parseFloat(limitRecord.total_transferred);
  const dailyLimit = parseFloat(limitRecord.daily_limit);
  if (currentTotal + amount > dailyLimit) {
    return {
      allowed: false,
      currentTotal,
      dailyLimit,
      remaining: Math.max(0, dailyLimit - currentTotal),
    };
  }
  return {
    allowed: true,
    currentTotal,
    dailyLimit,
    remaining: dailyLimit - currentTotal - amount,
  };
};

const updateDailyLimit = async (client, userId, accountId, amount) => {
  await client.query(
    `
      UPDATE daily_transfer_limits
      SET
        total_transferred =
          total_transferred + $1,
        transfer_count =
          transfer_count + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $2
        AND account_id = $3
        AND transfer_date = CURRENT_DATE
    `,
    [amount, userId, accountId],
  );
};

const initiateTransfer = async (req, res) => {
  const client = await pool.connect();
  const userId = req.user.userId;
  const authToken = req.authToken;
  const {
    fromAccountId,
    toAccountNumber,
    amount,
    description,
    idempotencyKey,
  } = req.body;
  const requestHash = generateIdempotencyHash({
    fromAccountId,
    toAccountNumber,
    amount,
    description,
  });

  try {
    await client.query("BEGIN");
    if (idempotencyKey) {
      const existingRecord = await getIdempotencyRecord(
        client,
        idempotencyKey,
        userId,
      );

      if (existingRecord) {
        if (existingRecord.request_hash !== requestHash) {
          await client.query("ROLLBACK");

          return res.status(409).json({
            success: false,
            error: "Idempotency key already used",
            message:
              "The same idempotency key was used with different request data.",
          });
        }

        await client.query("COMMIT");

        return res
          .status(existingRecord.status_code || 200)
          .json(existingRecord.response_body);
      }
    }
    const sourceResponse = await getSourceAccount(fromAccountId, authToken);
    const sourceAccount =
      sourceResponse.data || sourceResponse.account || sourceResponse;
    if (!sourceAccount) {
      throw new Error("Source account not found");
    }
    if (sourceAccount.userId !== userId && sourceAccount.user_id !== userId) {
      await client.query("ROLLBACK");

      return res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "You do not own the source account.",
      });
    }

    const sourceStatus = sourceAccount.status;

    if (sourceStatus !== "ACTIVE") {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: "Invalid account",
        message: "Source account is not active.",
      });
    }

    const destinationResponse = await getDestinationAccount(toAccountNumber);
    const destinationAccount =
      destinationResponse.data ||
      destinationResponse.account ||
      destinationResponse;
    if (!destinationAccount) {
      throw new Error("Destination account not found");
    }

    const destinationAccountId = destinationAccount.id;
    const destinationUserId =
      destinationAccount.userId || destinationAccount.user_id;
    if (destinationAccountId === fromAccountId) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: "Invalid transfer",
        message: "Cannot transfer money to the same account.",
      });
    }

    if (destinationAccount.status !== "ACTIVE") {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        error: "Invalid account",
        message: "Destination account is not active.",
      });
    }

    const limitCheck = await checkDailyLimit(
      client,
      userId,
      fromAccountId,
      amount,
    );

    if (!limitCheck.allowed) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: "Daily transfer limit exceeded",
        message: "This transfer would exceed your daily transfer limit.",
        dailyLimit: limitCheck.dailyLimit,
        alreadyTransferred: limitCheck.currentTotal,
        remaining: limitCheck.remaining,
        requestedAmount: amount,
      });
    }


    const referenceId = generateReferenceId();
    const transferResult = await client.query(
      `
          INSERT INTO transfers (
            reference_id,
            from_account_id,
            from_user_id,
            to_account_id,
            to_user_id,
            amount,
            currency,
            fee,
            status,
            transfer_type,
            description
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            'INR',
            0,
            'PROCESSING',
            'P2P',
            $7
          )
          RETURNING *
        `,
      [
        referenceId,
        fromAccountId,
        userId,
        destinationAccountId,
        destinationUserId,
        amount,
        description || null,
      ],
    );

    const transfer = transferResult.rows[0];

    let debitResponse;
    try {
      debitResponse = await debitAccount(
        fromAccountId,
        amount,
        description || `P2P transfer to ${toAccountNumber}`,
        referenceId,
        authToken,
      );
    } catch (error) {
      await client.query(
        `
          UPDATE transfers
          SET
            status = 'FAILED',
            failure_reason = $1
          WHERE id = $2
        `,
        [error.message, transfer.id],
      );

      await client.query("COMMIT");

      await logTransactionEvent({
        transferId: transfer.id,
        userId,
        eventType: "TRANSFER_FAILED",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        success: false,
        metadata: {
          stage: "DEBIT",
          error: error.message,
        },
      });

      return res.status(400).json({
        success: false,
        error: "Transfer failed",
        message: "Unable to debit source account.",
        reason: error.message,
      });
    }


    const debitData = debitResponse.data || debitResponse;
    const balanceBefore =
      debitData.balanceBefore ??
      debitData.balance_before ??
      parseFloat(sourceAccount.balance);

    const balanceAfter =
      debitData.balanceAfter ??
      debitData.balance_after ??
      balanceBefore - amount;

    await client.query(
      `
        INSERT INTO transaction_ledger (
          transfer_id,
          account_id,
          entry_type,
          amount,
          balance_before,
          balance_after,
          reference_id,
          description
        )
        VALUES (
          $1,
          $2,
          'DEBIT',
          $3,
          $4,
          $5,
          $6,
          $7
        )
      `,
      [
        transfer.id,
        fromAccountId,
        amount,
        balanceBefore,
        balanceAfter,
        referenceId,
        description || "P2P transfer debit",
      ],
    );

    let creditResponse;
    try {
      creditResponse = await creditAccount(
        destinationAccountId,
        amount,
        description ||
          `P2P transfer from ${sourceAccount.accountNumber || fromAccountId}`,
        referenceId,
      );
    } catch (error) {

      try {
        await creditAccount(
          fromAccountId,
          amount,
          `Transfer reversal ${referenceId}`,
          `REV-${referenceId}`,
        );

        await client.query(
          `
            UPDATE transfers
            SET
              status = 'REVERSED',
              failure_reason = $1
            WHERE id = $2
          `,
          [`Destination credit failed: ${error.message}`, transfer.id],
        );

        await client.query(
          `
            UPDATE daily_transfer_limits
            SET
              total_transferred =
                GREATEST(
                  0,
                  total_transferred - $1
                ),
              updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $2
              AND account_id = $3
              AND transfer_date = CURRENT_DATE
          `,
          [amount, userId, fromAccountId],
        );

        await client.query("COMMIT");

        await logTransactionEvent({
          transferId: transfer.id,
          userId,
          eventType: "TRANSFER_REVERSED",
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
          success: false,
          metadata: {
            reason: error.message,
          },
        });

        return res.status(502).json({
          success: false,
          error: "Transfer reversed",
          message:
            "Destination account could not be credited. The source debit has been reversed.",
          referenceId,
        });
      } catch (reversalError) {
        await client.query("ROLLBACK");

        await logTransactionEvent({
          transferId: transfer.id,
          userId,
          eventType: "TRANSFER_REVERSAL_FAILED",
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
          success: false,
          metadata: {
            creditError: error.message,
            reversalError: reversalError.message,
          },
        });

        return res.status(500).json({
          success: false,
          error: "Critical transfer failure",
          message:
            "Destination credit and automatic reversal both failed. Manual reconciliation is required.",
          referenceId,
        });
      }
    }

    const creditData = creditResponse.data || creditResponse;

    const destinationBalanceBefore =
      creditData.balanceBefore ??
      creditData.balance_before ??
      parseFloat(destinationAccount.balance || 0);

    const destinationBalanceAfter =
      creditData.balanceAfter ??
      creditData.balance_after ??
      destinationBalanceBefore + amount;

    await client.query(
      `
        INSERT INTO transaction_ledger (
          transfer_id,
          account_id,
          entry_type,
          amount,
          balance_before,
          balance_after,
          reference_id,
          description
        )
        VALUES (
          $1,
          $2,
          'CREDIT',
          $3,
          $4,
          $5,
          $6,
          $7
        )
      `,
      [
        transfer.id,
        destinationAccountId,
        amount,
        destinationBalanceBefore,
        destinationBalanceAfter,
        referenceId,
        description || "P2P transfer credit",
      ],
    );

    const completedResult = await client.query(
      `
          UPDATE transfers
          SET
            status = 'COMPLETED',
            completed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING *
        `,
      [transfer.id],
    );

    await updateDailyLimit(client, userId, fromAccountId, amount);

    await client.query("COMMIT");

    const completedTransfer = completedResult.rows[0];

    const responseBody = {
      success: true,
      message: "Transfer completed successfully",
      data: sanitizeTransfer(completedTransfer),
    };

    if (idempotencyKey) {
      const idempotencyClient = await pool.connect();
      try {
        await saveIdempotencyRecord(
          idempotencyClient,
          idempotencyKey,
          userId,
          requestHash,
          responseBody,
          201,
        );
      } finally {
        idempotencyClient.release();
      }
    }

    await logTransactionEvent({
      transferId: transfer.id,
      userId,
      eventType: "TRANSFER_COMPLETED",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      success: true,
      metadata: {
        amount,
        fromAccountId,
        toAccountId: destinationAccountId,
        referenceId,
      },
    });

    return res.status(201).json(responseBody);
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Rollback failed:", rollbackError.message);
    }
    console.error("Transfer error:", error);

    return res.status(500).json({
      success: false,
      error: "Transfer failed",
      message:
        config.nodeEnv === "development"
          ? error.message
          : "Unable to process transfer.",
    });
  } finally {
    client.release();
  }
};

const getTransferById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const result = await pool.query(
      `
        SELECT *
        FROM transfers
        WHERE id = $1
          AND (
            from_user_id = $2
            OR to_user_id = $2
          )
      `,
      [id, userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Transfer not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: sanitizeTransfer(result.rows[0]),
    });
  } catch (error) {
    console.error("Get transfer error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch transfer",
    });
  }
};

const getTransferByReference = async (req, res) => {
  try {
    const { referenceId } = req.params;
    const userId = req.user.userId;
    const result = await pool.query(
      `
        SELECT *
        FROM transfers
        WHERE reference_id = $1
          AND (
            from_user_id = $2
            OR to_user_id = $2
          )
      `,
      [referenceId, userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Transfer not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: sanitizeTransfer(result.rows[0]),
    });
  } catch (error) {
    console.error("Get transfer by reference error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch transfer",
    });
  }
};

const listTransfers = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { page, limit, status, type, fromDate, toDate, sortBy, sortOrder } =
      req.query;

    const conditions = [`(from_user_id = $1 OR to_user_id = $1)`];
    const values = [userId];
    let parameterIndex = 2;
    if (status) {
      conditions.push(`status = $${parameterIndex}`);
      values.push(status);
      parameterIndex++;
    }

    if (type) {
      conditions.push(`transfer_type = $${parameterIndex}`);

      values.push(type);
      parameterIndex++;
    }

    if (fromDate) {
      conditions.push(`created_at >= $${parameterIndex}`);

      values.push(fromDate);
      parameterIndex++;
    }

    if (toDate) {
      conditions.push(`created_at <= $${parameterIndex}`);

      values.push(toDate);
      parameterIndex++;
    }

    const whereClause = conditions.join(" AND ");

    const countResult = await pool.query(
      `
          SELECT COUNT(*)::INTEGER AS total
          FROM transfers
          WHERE ${whereClause}
        `,
      values,
    );

    const total = countResult.rows[0].total;

    const offset = getOffset(page, limit);

    const dataResult = await pool.query(
      `
          SELECT *
          FROM transfers
          WHERE ${whereClause}
          ORDER BY ${sortBy} ${sortOrder}
          LIMIT $${parameterIndex}
          OFFSET $${parameterIndex + 1}
        `,
      [...values, limit, offset],
    );

    return res.status(200).json({
      success: true,
      data: dataResult.rows.map(sanitizeTransfer),
      pagination: getPagination(page, limit, total),
    });
  } catch (error) {
    console.error("List transfers error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch transfers",
    });
  }
};

const getLedger = async (req, res) => {
  try {
    const { accountId } = req.params;

    const userId = req.user.userId;
    const authToken = req.authToken;

    const accountResponse = await getSourceAccount(accountId, authToken);
    const account =
      accountResponse.data || accountResponse.account || accountResponse;

    if (!account) {
      return res.status(404).json({
        success: false,
        error: "Account not found",
      });
    }

    const accountOwner = account.userId || account.user_id;

    if (accountOwner !== userId) {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "You do not own this account.",
      });
    }

    const result = await pool.query(
      `
        SELECT
          id,
          transfer_id,
          account_id,
          entry_type,
          amount,
          balance_before,
          balance_after,
          reference_id,
          description,
          created_at
        FROM transaction_ledger
        WHERE account_id = $1
        ORDER BY created_at DESC
      `,
      [accountId],
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("Get ledger error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch ledger",
      message: config.nodeEnv === "development" ? error.message : undefined,
    });
  }
};

export {
  initiateTransfer,
  getTransferById,
  getTransferByReference,
  listTransfers,
  getLedger,
};
