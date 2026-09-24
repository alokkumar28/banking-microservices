import { Router } from "express";
import {
  initiateTransfer,
  getTransferById,
  getTransferByReference,
  listTransfers,
  getLedger,
} from "../controllers/transaction.controller.js";
import { authenticate } from "../middleware/jwt.js";
import {
  transferSchema,
  transferIdSchema,
  referenceIdSchema,
  transferQuerySchema,
  validate,
  validateParams,
  validateQuery,
} from "../middleware/validations.js";

const router = Router();
router.use(authenticate);

router.post("/", validate(transferSchema), initiateTransfer);
router.get("/", validateQuery(transferQuerySchema), listTransfers);

router.get(
  "/reference/:referenceId",
  validateParams(referenceIdSchema),
  getTransferByReference,
);

router.get("/ledger/:accountId", getLedger);

router.get("/:id", validateParams(transferIdSchema), getTransferById);

export default router;
