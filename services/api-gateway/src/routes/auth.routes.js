import { Router } from "express";

import { createServiceProxy } from "../utils/proxyFactory.js";

import { authLimiter, registerLimiter } from "../middleware/rate-limit.js";

import config from "../config/config.js";
const router = Router();

router.use("/register", registerLimiter);
router.use("/login", authLimiter);
router.use("/", createServiceProxy(config.services.auth, "auth-service"));

export default router;
