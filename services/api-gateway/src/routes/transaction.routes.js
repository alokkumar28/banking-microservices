import { Router } from "express";
import { createServiceProxy } from "../utils/proxyFactory.js";
import { verifyToken } from "../middleware/auth.js";
import { transactionLimiter } from "../middleware/rate-limit.js";
import config from "../config/config.js";

const router = Router();
router.use(verifyToken);
router.use("/transfer", transactionLimiter);
router.use(
  "/",
  createServiceProxy(config.services.transaction, "transaction-service", {
    pathRewrite: {
      "^/": "/api/transactions/",
    },
  }),
);

export default router;
