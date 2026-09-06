import jwt from 'jsonwebtoken';
import config from '../config/config.js';
// Generate access token
const generateAccessToken = (userId, email) => {
  return jwt.sign(
    {
      userId,
      email,
      type: 'access'
    },
    config.jwt.accessSecret,
    {
      expiresIn: config.jwt.accessExpiry
    }
  );
};
// Generate refresh token
const generateRefreshToken = (userId, email) => {
  return jwt.sign(
    {
      userId,
      email,
      type: 'refresh'
    },
    config.jwt.refreshSecret,
    {
      expiresIn: config.jwt.refreshExpiry
    }
  );
};
// Verify access token
const verifyAccessToken = (token) => {
  try {
    return jwt.verify(
      token,
      config.jwt.accessSecret
    );
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Access token expired');
    }
    throw new Error('Invalid access token');
  }
};
// Verify refresh token
const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(
      token,
      config.jwt.refreshSecret
    );
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Refresh token expired');
    }
    throw new Error('Invalid refresh token');
  }
};
// Extract token from Authorization header
const extractToken = (authHeader) => {
  if (!authHeader) {
    throw new Error('Authorization header missing');
  }
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    throw new Error(
      'Invalid authorization format. Use: Bearer <token>'
    );
  }
  return parts[1];
};
// Middleware to authenticate requests
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
      error: 'Authentication failed',
      message: error.message
    });
  }
};

export {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  extractToken,
  authenticate
};