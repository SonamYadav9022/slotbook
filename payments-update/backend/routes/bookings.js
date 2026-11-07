import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  createBooking, myBookings, cancelBooking, providerBookings, getCheckout, verifyPayment,
  createBookingSchema, verifySchema,
} from "../controllers/bookingController.js";

const router = Router();

router.use(requireAuth);
router.post("/", requireRole("user"), validate(createBookingSchema), createBooking);
router.get("/mine", requireRole("user"), myBookings);
router.get("/provider", requireRole("provider"), providerBookings);
router.get("/:id/checkout", requireRole("user"), getCheckout);
router.post("/:id/verify", requireRole("user"), validate(verifySchema), verifyPayment);
router.patch("/:id/cancel", requireRole("user"), cancelBooking);

export default router;
