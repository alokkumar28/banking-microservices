import jwt from "jsonwebtoken";
import config from "../config/config.js";
import logger from "../utils/logger.js";

const verifyToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Authorization header missing",
      });
    }
    const parts = authHeader.split(" ");

    if (parts.length !== 2 || parts[0] !== "Bearer") {
      return res.status(401).json({
        success: false,
        message: "Invalid authorization format. Use: Bearer <token>",
      });
    }

    const token = parts[1];
    const decoded = jwt.verify(token, config.jwt.accessSecret);

    if (decoded.type && decoded.type !== "access") {
      return res.status(401).json({
        success: false,
        message: "Invalid token type",
      });
    }

    req.user = {
      userId: decoded.userId,

      email: decoded.email,
    };

    req.headers["x-user-id"] = decoded.userId;
    req.headers["x-user-email"] = decoded.email;
    logger.debug(`Token verified for user: ${decoded.email}`);

    next();
  } catch (error) {
    logger.warn(`Token verification failed: ${error.message}`);
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expired",
        code: "TOKEN_EXPIRED",
      });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
        code: "INVALID_TOKEN",
      });
    }

    return res.status(401).json({
      success: false,
      message: "Authentication failed",
    });
  }
};

const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return next();
  }
  try {
    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      return next();
    }
    const token = parts[1];
    const decoded = jwt.verify(token, config.jwt.accessSecret);
    if (decoded.type && decoded.type !== "access") {
      return next();
    }
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
    };
    req.headers["x-user-id"] = decoded.userId;
    req.headers["x-user-email"] = decoded.email;
  } catch {
    // Optional authentication.
    // Invalid token does not block request.
  }
  next();
};

const verifyInternalService = (req, res, next) => {
  const token = req.headers["x-internal-token"];
  if (token !== config.internalServiceToken) {
    return res.status(403).json({
      success: false,
      message: "Invalid internal token",
    });
  }
  next();
};

export { verifyToken, optionalAuth, verifyInternalService };
export default {
  verifyToken,
  optionalAuth,
  verifyInternalService,
};
