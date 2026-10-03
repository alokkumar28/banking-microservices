import { Router } from "express";
import { createServiceProxy } from "../utils/proxyFactory.js";
import { verifyToken } from "../middleware/auth.js";
import config from "../config/config.js";

const router = Router();
router.use(verifyToken);

router.use(
  "/",
  createServiceProxy(config.services.user, "user-service", {
    pathRewrite: {
      "^/": "/api/users/",
    },
  }),
);

export default router;
