import jwt from "jsonwebtoken";

import config from "../config/config.js";

const extractToken = (authHeader) => {
  if (!authHeader) {
    throw new Error("Authorization header missing");
  }
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    throw new Error(
      "Invalid authorization format. Use: Bearer <token>"
    );
  }
  return parts[1];
};

// Verify access token
const verifyAccessToken = (token) => {
  try {
    const decoded = jwt.verify(
      token,
      config.jwt.accessSecret
    );
    if (decoded.type !== "access") {
      throw new Error("Invalid token type");
    }
    return decoded;
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw new Error("Access token expired");
    }
    if (error.message === "Invalid token type") {
      throw error;
    }
    throw new Error("Invalid access token");
  }
};

// Authentication middleware
const authenticate = (req, res, next) => {
  try {
    const token = extractToken(
      req.headers.authorization
    );
    const decoded = verifyAccessToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      error: "Authentication failed",
      message: error.message,
    });
  }
};

export {
  extractToken,
  verifyAccessToken,
  authenticate,
};