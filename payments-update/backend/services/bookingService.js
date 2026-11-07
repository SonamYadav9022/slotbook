import Booking from "../models/Booking.js";
import { refundPayment, toPaise } from "../utils/razorpay.js";
import { ApiError } from "../utils/ApiError.js";

// Releases unpaid holds whose time ran out. `extra` narrows the filter (one slot, one day...).
export function expireStaleHolds(extra = {}, now = new Date()) {
  return Booking.updateMany(
    { status: "pending", expiresAt: { $lte: now }, ...extra },
    { $set: { status: "expired", holdsSlot: false }, $unset: { expiresAt: 1 } }
  );
}

/**
 * Turns a booking into a paid, confirmed one. Called from the verify endpoint and the webhook,
 * which can race each other, so every step is idempotent.
 *
 * Normal case: pending -> confirmed.
 * Late payment: the hold already expired, but money was taken. We try to re-take the slot;
 * if someone else booked it meanwhile, the unique index rejects us and we refund automatically.
 */
export async function settlePayment(booking, paymentId) {
  if (booking.status === "confirmed") return { booking, outcome: "already" };

  try {
    const updated = await Booking.findOneAndUpdate(
      { _id: booking._id, status: { $in: ["pending", "expired", "cancelled"] } },
      { $set: { status: "confirmed", holdsSlot: true, paymentId, paidAt: new Date() }, $unset: { expiresAt: 1 } },
      { returnDocument: "after" }
    );
    if (!updated) return { booking: await Booking.findById(booking._id), outcome: "already" };
    return { booking: updated, outcome: "confirmed" };
  } catch (err) {
    if (err.code !== 11000) throw err;
  }

  // The slot went to someone else while this payment was in flight: give the money back.
  try {
    const refund = await refundPayment(paymentId, toPaise(booking.price), { reason: "slot no longer available" });
    const refunded = await Booking.findByIdAndUpdate(
      booking._id,
      { $set: { status: "cancelled", holdsSlot: false, paymentId, refundId: refund.id, refundStatus: refund.status, refundedAt: new Date(), cancelledAt: new Date() } },
      { returnDocument: "after" }
    );
    return { booking: refunded, outcome: "refunded" };
  } catch (err) {
    await Booking.updateOne({ _id: booking._id }, { $set: { paymentId, refundStatus: "failed" } });
    throw new ApiError(502, "Your payment went through but the slot was taken, and the automatic refund failed. Please contact support with your payment id.");
  }
}
