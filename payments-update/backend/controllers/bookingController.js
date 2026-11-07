import { z } from "zod";
import Booking from "../models/Booking.js";
import Resource from "../models/Resource.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { generateSlots, localDateOf } from "../utils/slots.js";
import { env } from "../config/env.js";
import { createOrder, refundPayment, verifyPaymentSignature, toPaise } from "../utils/razorpay.js";
import { expireStaleHolds, settlePayment } from "../services/bookingService.js";

const MAX_DAYS_AHEAD = 60;

export const createBookingSchema = z.object({
  resourceId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid listing id"),
  startTime: z.iso.datetime({ offset: true, message: "startTime must be an ISO date-time" }),
});

export const verifySchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

// What the browser needs to open Razorpay Checkout.
const checkoutFor = (booking) => ({
  booking,
  checkout: {
    keyId: env.RAZORPAY_KEY_ID,
    orderId: booking.orderId,
    amount: toPaise(booking.price),
    currency: "INR",
    expiresAt: booking.expiresAt,
  },
});

export const createBooking = asyncHandler(async (req, res) => {
  const start = new Date(req.body.startTime);
  const now = Date.now();

  if (start.getTime() <= now) throw new ApiError(400, "That slot has already started");
  if (start.getTime() > now + MAX_DAYS_AHEAD * 86400000) {
    throw new ApiError(400, `You can book up to ${MAX_DAYS_AHEAD} days ahead`);
  }

  const resource = await Resource.findOne({ _id: req.body.resourceId, isActive: true });
  if (!resource) throw new ApiError(404, "Listing not found");

  // The client may only pick a slot the resource really offers.
  const match = generateSlots(resource, localDateOf(start)).find((s) => s.start.getTime() === start.getTime());
  if (!match) throw new ApiError(400, "That time isn't an available slot for this listing");

  // Someone's abandoned hold shouldn't block this slot.
  await expireStaleHolds({ resource: resource._id, startTime: match.start });

  // The player re-tapped "book" while still holding this slot: resume instead of failing.
  const mine = await Booking.findOne({
    resource: resource._id, startTime: match.start, user: req.user.id, status: "pending", orderId: { $exists: true },
  });
  if (mine) return res.status(200).json(checkoutFor(mine));

  const isFree = resource.pricePerSlot === 0;
  const booking = new Booking({
    user: req.user.id,
    resource: resource._id,
    provider: resource.provider,
    startTime: match.start,
    endTime: match.end,
    price: resource.pricePerSlot,
    status: isFree ? "confirmed" : "pending",
    expiresAt: isFree ? undefined : new Date(now + env.HOLD_MINUTES * 60000),
  });

  try {
    await booking.save(); // the unique index decides who gets the slot
  } catch (err) {
    if (err.code === 11000) throw new ApiError(409, "Someone just booked that slot. Pick another one");
    throw err;
  }
  if (isFree) return res.status(201).json({ booking });

  try {
    const order = await createOrder({
      amountPaise: toPaise(booking.price),
      receipt: String(booking._id),
      notes: { bookingId: String(booking._id), resourceId: String(resource._id) },
    });
    booking.orderId = order.id;
    await booking.save();
  } catch (err) {
    await Booking.deleteOne({ _id: booking._id }); // couldn't start a payment, so don't keep the slot
    throw err;
  }
  res.status(201).json(checkoutFor(booking));
});

// Re-open payment for a booking that is still waiting for it ("Pay now" in My bookings).
export const getCheckout = asyncHandler(async (req, res) => {
  const booking = await Booking.findOne({ _id: req.params.id, user: req.user.id });
  if (!booking) throw new ApiError(404, "Booking not found");
  if (booking.status !== "pending" || booking.expiresAt <= new Date()) {
    throw new ApiError(410, "This booking is no longer waiting for payment");
  }
  res.json(checkoutFor(booking));
});

export const verifyPayment = asyncHandler(async (req, res) => {
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;
  const booking = await Booking.findOne({ _id: req.params.id, user: req.user.id });
  if (!booking) throw new ApiError(404, "Booking not found");
  if (booking.orderId !== orderId) throw new ApiError(400, "That payment doesn't belong to this booking");

  // Never trust the browser's "payment succeeded": only a valid signature proves it.
  if (!verifyPaymentSignature({ orderId, paymentId, signature })) {
    throw new ApiError(400, "We couldn't verify that payment, so the booking wasn't confirmed");
  }

  const { booking: settled, outcome } = await settlePayment(booking, paymentId);
  if (outcome === "refunded") {
    throw new ApiError(409, "Your hold expired and someone else took the slot. Your payment has been refunded.");
  }
  res.json({ booking: settled });
});

export const myBookings = asyncHandler(async (req, res) => {
  await expireStaleHolds({ user: req.user.id });
  const items = await Booking.find({ user: req.user.id, status: { $ne: "expired" } })
    .sort({ startTime: -1 })
    .populate("resource", "name city category address");
  res.json({ items });
});

export const cancelBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findOne({ _id: req.params.id, user: req.user.id });
  if (!booking) throw new ApiError(404, "Booking not found");
  if (!["pending", "confirmed"].includes(booking.status)) {
    throw new ApiError(400, "This booking can't be cancelled");
  }

  const update = { status: "cancelled", holdsSlot: false, cancelledAt: new Date() };

  if (booking.status === "confirmed") {
    const hoursLeft = (booking.startTime.getTime() - Date.now()) / 3600000;
    if (hoursLeft < env.CANCEL_WINDOW_HOURS) {
      throw new ApiError(400, `Bookings can only be cancelled ${env.CANCEL_WINDOW_HOURS} hours or more before the start`);
    }
    // Refund first: if the provider rejects it, the booking stays confirmed and nothing is lost.
    if (booking.paymentId && booking.price > 0) {
      const refund = await refundPayment(booking.paymentId, toPaise(booking.price), { bookingId: String(booking._id) });
      Object.assign(update, { refundId: refund.id, refundStatus: refund.status, refundedAt: new Date() });
    }
  }

  const updated = await Booking.findByIdAndUpdate(booking._id, { $set: update, $unset: { expiresAt: 1 } }, { returnDocument: "after" });
  res.json({ booking: updated });
});

export const providerBookings = asyncHandler(async (req, res) => {
  const items = await Booking.find({ provider: req.user.id, status: { $in: ["confirmed", "cancelled"] } })
    .sort({ startTime: -1 })
    .limit(100)
    .populate("resource", "name")
    .populate("user", "name email");
  res.json({ items });
});
