import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  changePasswordSchema,
} from "../middleware/validations.js";
import { hashPassword, comparePassword } from "../utils/password.js";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../middleware/jwt.js";
import { pool, logSecurityEvent } from "../db/db.js";
import config from "../config/config.js";

// REGISTER
const register = async (req, res) => {
  const client = await pool.connect();
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      await logSecurityEvent(
        "REGISTER_FAILED",
        req.body.email,
        false,
        req.ip,
        req.headers["user-agent"],
      );
      return res.status(400).json({
        error: "Validation failed",
        details: error.details.map((d) => d.message),
      });
    }
    const { email, password, fullName } = value;
    const existingUser = await client.query(
      "SELECT id FROM users WHERE email = $1",
      [email],
    );
    if (existingUser.rows.length > 0) {
      await logSecurityEvent(
        "REGISTER_FAILED",
        email,
        false,
        req.ip,
        req.headers["user-agent"],
      );
      return res.status(409).json({
        error: "User already exists",
        message: "An account with this email already exists",
      });
    }
    const hashedPassword = await hashPassword(password);
    const result = await client.query(
      `INSERT INTO users (
        email,
        password_hash,
        full_name
      )
      VALUES ($1, $2, $3)
      RETURNING id, email, full_name, is_verified, created_at`,
      [email, hashedPassword, fullName],
    );
    const newUser = result.rows[0];
    await logSecurityEvent(
      "REGISTER_SUCCESS",
      email,
      true,
      req.ip,
      req.headers["user-agent"],
      newUser.id,
    );
    const accessToken = generateAccessToken(newUser.id, newUser.email);
    const refreshToken = generateRefreshToken(newUser.id, newUser.email);
    await client.query(
      `INSERT INTO refresh_tokens (
        user_id,
        token,
        expires_at
      )
      VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [newUser.id, refreshToken],
    );
    res.status(201).json({
      message: "User registered successfully",
      user: {
        id: newUser.id,
        email: newUser.email,
        fullName: newUser.full_name,
        isVerified: newUser.is_verified,
        createdAt: newUser.created_at,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: config.jwt.accessExpiry,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({
      error: "Registration failed",
      message: "Internal server error",
    });
  } finally {
    client.release();
  }
};

// LOGIN
const login = async (req, res) => {
  const client = await pool.connect();
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      await logSecurityEvent(
        "LOGIN_FAILED",
        req.body.email,
        false,
        req.ip,
        req.headers["user-agent"],
      );
      return res.status(400).json({
        error: "Validation failed",
        details: error.details.map((d) => d.message),
      });
    }
    const { email, password } = value;
    const result = await client.query(
      `SELECT
        id,
        email,
        password_hash,
        full_name,
        is_active,
        is_verified
       FROM users
       WHERE email = $1`,
      [email],
    );
    if (result.rows.length === 0) {
      await logSecurityEvent(
        "LOGIN_FAILED",
        email,
        false,
        req.ip,
        req.headers["user-agent"],
      );
      return res.status(401).json({
        error: "Authentication failed",
        message: "Invalid email or password",
      });
    }
    const user = result.rows[0];
    if (!user.is_active) {
      await logSecurityEvent(
        "LOGIN_FAILED",
        email,
        false,
        req.ip,
        req.headers["user-agent"],
        user.id,
      );
      return res.status(403).json({
        error: "Account disabled",
        message: "Your account has been disabled. Please contact support.",
      });
    }
    const isValidPassword = await comparePassword(password, user.password_hash);
    if (!isValidPassword) {
      await logSecurityEvent(
        "LOGIN_FAILED",
        email,
        false,
        req.ip,
        req.headers["user-agent"],
        user.id,
      );
      return res.status(401).json({
        error: "Authentication failed",
        message: "Invalid email or password",
      });
    }
    await client.query(
      `UPDATE users
       SET last_login_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [user.id],
    );
    await logSecurityEvent(
      "LOGIN_SUCCESS",
      email,
      true,
      req.ip,
      req.headers["user-agent"],
      user.id,
    );
    const accessToken = generateAccessToken(user.id, user.email);
    const refreshToken = generateRefreshToken(user.id, user.email);
    await client.query(
      `INSERT INTO refresh_tokens (
        user_id,
        token,
        expires_at
      )
      VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [user.id, refreshToken],
    );
    res.json({
      message: "Login successful",
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        isVerified: user.is_verified,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: config.jwt.accessExpiry,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      error: "Login failed",
      message: "Internal server error",
    });
  } finally {
    client.release();
  }
};

// REFRESH TOKEN
const refreshToken = async (req, res) => {
  const client = await pool.connect();
  try {
    const { error, value } = refreshTokenSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.details.map((d) => d.message),
      });
    }
    const { refreshToken } = value;
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch (error) {
      return res.status(401).json({
        error: "Invalid refresh token",
        message: error.message,
      });
    }
    const tokenResult = await client.query(
      `SELECT *
       FROM refresh_tokens
       WHERE token = $1
       AND revoked = FALSE
       AND expires_at > NOW()`,
      [refreshToken],
    );
    if (tokenResult.rows.length === 0) {
      return res.status(401).json({
        error: "Invalid refresh token",
        message: "Token has been revoked or expired",
      });
    }
    const userResult = await client.query(
      `SELECT id, email
       FROM users
       WHERE id = $1
       AND is_active = TRUE`,
      [decoded.userId],
    );
    if (userResult.rows.length === 0) {
      return res.status(401).json({
        error: "Invalid refresh token",
        message: "User not found or inactive",
      });
    }

    const user = userResult.rows[0];
    const newAccessToken = generateAccessToken(user.id, user.email);
    const newRefreshToken = generateRefreshToken(user.id, user.email);
    await client.query(
      `UPDATE refresh_tokens
       SET revoked = TRUE
       WHERE token = $1`,
      [refreshToken],
    );
    await client.query(
      `INSERT INTO refresh_tokens (
        user_id,
        token,
        expires_at
      )
      VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [user.id, newRefreshToken],
    );
    await logSecurityEvent(
      "REFRESH_TOKEN",
      user.email,
      true,
      req.ip,
      req.headers["user-agent"],
      user.id,
    );
    res.json({
      tokens: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: config.jwt.accessExpiry,
      },
    });
  } catch (error) {
    console.error("Refresh token error:", error);
    res.status(500).json({
      error: "Refresh failed",
      message: "Internal server error",
    });
  } finally {
    client.release();
  }
};

// LOGOUT
const logout = async (req, res) => {
  const client = await pool.connect();
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await client.query(
        `UPDATE refresh_tokens
         SET revoked = TRUE
         WHERE token = $1`,
        [refreshToken],
      );
    }
    await logSecurityEvent(
      "LOGOUT",
      req.user.email,
      true,
      req.ip,
      req.headers["user-agent"],
      req.user.userId,
    );
    res.json({
      message: "Logout successful",
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({
      error: "Logout failed",
      message: "Internal server error",
    });
  } finally {
    client.release();
  }
};

// GET CURRENT USER
const getCurrentUser = async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT
        id,
        email,
        full_name,
        is_active,
        is_verified,
        last_login_at,
        created_at
       FROM users
       WHERE id = $1`,
      [req.user.userId],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "User not found",
      });
    }
    res.json({
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({
      error: "Failed to get user information",
    });
  } finally {
    client.release();
  }
};

// CHANGE PASSWORD
const changePassword = async (req, res) => {
  const client = await pool.connect();
  try {
    const { error, value } = changePasswordSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.details.map((d) => d.message),
      });
    }
    const { currentPassword, newPassword } = value;
    const result = await client.query(
      `SELECT password_hash
       FROM users
       WHERE id = $1`,
      [req.user.userId],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "User not found",
      });
    }
    const isValid = await comparePassword(
      currentPassword,
      result.rows[0].password_hash,
    );
    if (!isValid) {
      await logSecurityEvent(
        "CHANGE_PASSWORD_FAILED",
        req.user.email,
        false,
        req.ip,
        req.headers["user-agent"],
        req.user.userId,
      );
      return res.status(401).json({
        error: "Invalid current password",
      });
    }
    const hashedPassword = await hashPassword(newPassword);
    await client.query(
      `UPDATE users
       SET password_hash = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [hashedPassword, req.user.userId],
    );
    await logSecurityEvent(
      "CHANGE_PASSWORD_SUCCESS",
      req.user.email,
      true,
      req.ip,
      req.headers["user-agent"],
      req.user.userId,
    );
    res.json({
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({
      error: "Failed to change password",
    });
  } finally {
    client.release();
  }
};

export {
  register,
  login,
  refreshToken,
  logout,
  getCurrentUser,
  changePassword,
};
