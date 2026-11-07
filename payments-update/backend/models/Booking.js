import mongoose from "mongoose";

/**
 * Booking lifecycle:
 *   pending   -> slot is held while the player pays (expires after HOLD_MINUTES)
 *   confirmed -> payment verified (or the listing is free)
 *   cancelled -> cancelled by the player; paid bookings are refunded
 *   expired   -> hold ran out before payment; slot released
 */
const bookingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    resource: { type: mongoose.Schema.Types.ObjectId, ref: "Resource", required: true },
    provider: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    price: { type: Number, required: true },
    status: { type: String, enum: ["pending", "confirmed", "cancelled", "expired"], default: "pending" },
    // true while the booking occupies its slot (pending or confirmed). The unique index keys off this.
    holdsSlot: { type: Boolean, default: true },
    expiresAt: Date, // only set while pending
    orderId: String, // Razorpay order
    paymentId: String, // Razorpay payment
    paidAt: Date,
    refundId: String,
    refundStatus: String,
    refundedAt: Date,
    cancelledAt: Date,
    reminderSent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

/**
 * The core guarantee of the app: one live booking per resource per start time.
 * The database enforces it, so two simultaneous requests can never both succeed.
 * Pending bookings hold the slot too, so nobody can grab it while a payment is in progress.
 * Cancelled and expired bookings set holdsSlot=false, which frees the slot.
 */
bookingSchema.index(
  { resource: 1, startTime: 1 },
  { name: "one_live_booking_per_slot", unique: true, partialFilterExpression: { holdsSlot: true } }
);
bookingSchema.index({ status: 1, expiresAt: 1 });
bookingSchema.index({ orderId: 1 }, { sparse: true });

export default mongoose.model("Booking", bookingSchema);
