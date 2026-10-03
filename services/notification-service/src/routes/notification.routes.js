import { Router } from "express";
import {
  sendNotification,
  getNotificationById,
  listNotifications,
  getMyNotifications,
  getMyNotificationById,
  markNotificationAsRead,
  getMyPreferences,
  updateMyPreferences,
} from "../controllers/notification.controller.js";

import { authenticate, verifyInternalToken } from "../middleware/jwt.js";
const router = Router();

// INTERNAL SERVICE APIs
router.post("/internal/send", verifyInternalToken, sendNotification);
router.get("/internal/list", verifyInternalToken, listNotifications);
router.get("/internal/:id", verifyInternalToken, getNotificationById);

// USER APIs
router.get("/my", authenticate, getMyNotifications);
router.get("/my/preferences", authenticate, getMyPreferences);
router.put("/my/preferences", authenticate, updateMyPreferences);
router.get("/my/:id", authenticate, getMyNotificationById);
router.patch("/my/:id/read", authenticate, markNotificationAsRead);

export default router;
