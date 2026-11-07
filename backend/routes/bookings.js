import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  createBooking, myBookings, cancelBooking, providerBookings, createBookingSchema,
} from "../controllers/bookingController.js";

const router = Router();

router.use(requireAuth);
router.post("/", requireRole("user"), validate(createBookingSchema), createBooking);
router.get("/mine", requireRole("user"), myBookings);
router.patch("/:id/cancel", requireRole("user"), cancelBooking);
router.get("/provider", requireRole("provider"), providerBookings);

export default router;
