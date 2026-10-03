import { Router } from "express";
import { createServiceProxy } from "../utils/proxyFactory.js";
import { verifyToken } from "../middleware/auth.js";
import config from "../config/config.js";

const router = Router();
router.use(verifyToken);

router.use(
  "/",
  createServiceProxy(config.services.account, "account-service", {
    pathRewrite: {
      "^/": "/api/accounts/",
    },
  }),
);

export default router;
