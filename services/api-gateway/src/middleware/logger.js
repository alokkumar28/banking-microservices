import logger from "../utils/logger.js";

const requestId = (req, res, next) => {
  const id =
    req.headers["x-request-id"] ||
    `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  req.requestId = id;
  req.headers["x-request-id"] = id;
  res.setHeader("x-request-id", id);
  next();
};

const requestLogger = (req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.originalUrl}`, {
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.headers["user-agent"]?.substring(0, 50),
      userId: req.user?.userId,
      requestId: req.requestId,
    });
  });
  next();
};

export { requestLogger, requestId };

export default {
  requestLogger,
  requestId,
};
