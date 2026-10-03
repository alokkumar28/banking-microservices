import { Router } from "express";

import { createServiceProxy } from "../utils/proxyFactory.js";

import { verifyToken } from "../middleware/auth.js";

import config from "../config/config.js";

const router = Router();

router.use(verifyToken);

/*
 * Only user-facing notification APIs
 * are exposed through the gateway.
 *
 * Internal notification endpoints remain
 * accessible directly between trusted services.
 */
router.use(
  "/",
  createServiceProxy(config.services.notification, "notification-service", {
    pathRewrite: {
      "^/": "/api/notifications/",
    },
  }),
);

export default router;
