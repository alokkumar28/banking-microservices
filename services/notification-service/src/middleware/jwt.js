import jwt from "jsonwebtoken";
import config from "../config/config.js";

const extractToken = (authorizationHeader) => {
  if (!authorizationHeader) {
    throw new Error("Authorization header missing");
  }
  const parts = authorizationHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    throw new Error("Invalid authorization format. Use: Bearer <token>");
  }

  return parts[1];
};

const verifyAccessToken = (token) => {
  try {
    const decoded = jwt.verify(token, config.jwt.accessSecret);
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

const authenticate = (req, res, next) => {
  try {
    const token = extractToken(req.headers.authorization);
    const decoded = verifyAccessToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: "Authentication failed",
      message: error.message,
    });
  }
};

const verifyInternalToken = (req, res, next) => {
  const token = req.headers["x-internal-token"];
  if (!token || token !== config.internalServiceToken) {
    return res.status(403).json({
      success: false,
      error: "Forbidden",
      message: "Invalid internal service token",
    });
  }
  next();
};

export { extractToken, verifyAccessToken, authenticate, verifyInternalToken };
