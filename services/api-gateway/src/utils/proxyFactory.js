import { createProxyMiddleware } from "http-proxy-middleware";
import config from "../config/config.js";
import logger from "./logger.js";

const createServiceProxy = (target, serviceName, options = {}) => {
  return createProxyMiddleware({
    target,

    changeOrigin: true,
    timeout: config.proxyTimeout,
    proxyTimeout: config.proxyTimeout,
    pathRewrite: options.pathRewrite || {},
    onProxyReq: (proxyReq, req) => {
      logger.debug(
        `Proxying to ${serviceName}: ${req.method} ${req.originalUrl}`,
      );

      // Forward authenticated user information
      if (req.user) {
        proxyReq.setHeader("x-user-id", req.user.userId);
        proxyReq.setHeader("x-user-email", req.user.email);
      }
      // Request tracing
      if (req.requestId) {
        proxyReq.setHeader("x-request-id", req.requestId);
      }

      /*
       * Re-stream body because Express
       * parses JSON before the proxy.
       */
      if (req.body && ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
        const bodyData = JSON.stringify(req.body);
        proxyReq.setHeader("Content-Type", "application/json");
        proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyData));
        proxyReq.write(bodyData);
      }
    },

    onProxyRes: (proxyRes) => {
      logger.debug(`Response from ${serviceName}: ${proxyRes.statusCode}`);
      proxyRes.headers["x-served-by"] = serviceName;
    },

    onError: (error, req, res) => {
      logger.error(`Proxy error to ${serviceName}`, {
        error: error.message,
        path: req.originalUrl,
        method: req.method,
      });

      if (res.headersSent) {
        return;
      }

      if (
        error.code === "ECONNREFUSED" ||
        error.code === "ETIMEDOUT" ||
        error.code === "ECONNRESET"
      ) {
        return res.status(503).json({
          success: false,
          message: `${serviceName} is unavailable`,
          code: "SERVICE_UNAVAILABLE",
        });
      }

      return res.status(502).json({
        success: false,
        message: "Bad gateway",
        code: "BAD_GATEWAY",
      });
    },
  });
};

export default createServiceProxy;

export { createServiceProxy };
