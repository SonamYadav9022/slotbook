import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { stats, pendingProviders, approveProvider } from "../controllers/adminController.js";

const router = Router();

router.use(requireAuth, requireRole("admin"));
router.get("/stats", stats);
router.get("/providers/pending", pendingProviders);
router.patch("/providers/:id/approve", approveProvider);

export default router;
