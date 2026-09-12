import { Router } from "express";
import {
  createAccount,
  getAccounts,
  getAccountById,
  updateAccount,
  closeAccount,
  deposit,
  withdraw,
  getTransactions,
} from "../controllers/account.controller.js";
import { authenticate } from "../middleware/jwt.js";

const router = Router();

router.use(authenticate);

// Account CRUD
router.post("/", createAccount);
router.get("/", getAccounts);
router.get("/:id", getAccountById);
router.put("/:id", updateAccount);
router.delete("/:id", closeAccount);

// Transactions
router.post("/:id/deposit", deposit);
router.post("/:id/withdraw", withdraw);
router.get("/:id/transactions", getTransactions);

export default router;