import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { requireAuth, requireRole, requireApprovedProvider } from "../middleware/auth.js";
import {
  listResources, getResource, getSlots, createResource, myResources, updateResource, deactivateResource,
  resourceSchema, listQuerySchema, slotsQuerySchema,
} from "../controllers/resourceController.js";

const router = Router();

router.get("/", validate(listQuerySchema, "query"), listResources);

// "/mine" must be declared before "/:id" or Express treats "mine" as an id.
router.get("/mine", requireAuth, requireRole("provider"), myResources);

router.get("/:id", getResource);
router.get("/:id/slots", validate(slotsQuerySchema, "query"), getSlots);

router.post("/", requireAuth, requireApprovedProvider, validate(resourceSchema), createResource);
router.put("/:id", requireAuth, requireApprovedProvider, validate(resourceSchema), updateResource);
router.delete("/:id", requireAuth, requireApprovedProvider, deactivateResource);

export default router;
