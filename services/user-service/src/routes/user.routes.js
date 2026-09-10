import express from "express";
import {
  createProfile,
  getProfile,
  updateProfile,
  deleteProfile,
} from "../controllers/user.controller.js";
import { authenticate } from "../middleware/jwt.js";

const router = express.Router();

router.post(
  "/profile",
  authenticate,
  createProfile
);

router.get(
  "/me",
  authenticate,
  getProfile
);

router.put(
  "/me",
  authenticate,
  updateProfile
);

router.delete(
  "/me",
  authenticate,
  deleteProfile
);

export default router;