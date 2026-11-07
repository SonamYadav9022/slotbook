import Booking from "../models/Booking.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { env } from "../config/env.js";
import { verifyWebhookSignature } from "../utils/razorpay.js";
import { settlePayment } from "../services/bookingService.js";

/**
 * Razorpay calls this server-to-server when a payment succeeds. It covers the case where the
 * player pays and then closes the tab before the browser can call /verify.
 * `req.body` is the raw Buffer, because the signature is computed over the exact bytes sent.
 */
export const razorpayWebhook = asyncHandler(async (req, res) => {
  if (!env.RAZORPAY_WEBHOOK_SECRET) throw new ApiError(503, "Webhook is not configured");
  if (!verifyWebhookSignature(req.body, req.get("x-razorpay-signature"))) {
    throw new ApiError(401, "Invalid webhook signature");
  }

  const event = JSON.parse(req.body.toString("utf8"));
  if (["payment.captured", "order.paid"].includes(event.event)) {
    const payment = event.payload?.payment?.entity;
    if (payment?.order_id && payment?.id) {
      const booking = await Booking.findOne({ orderId: payment.order_id });
      if (booking) await settlePayment(booking, payment.id);
    }
  }
  res.json({ received: true });
});
