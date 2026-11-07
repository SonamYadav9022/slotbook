import crypto from "crypto";
import { env } from "../config/env.js";
import { ApiError } from "./ApiError.js";

export const paymentsConfigured = () => Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
export const toPaise = (rupees) => Math.round(rupees * 100);

async function post(path, body) {
  if (!paymentsConfigured()) throw new ApiError(503, "Online payments aren't set up yet. Please try again later.");
  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64");
  let res;
  try {
    res = await fetch(`${env.RAZORPAY_API_BASE}${path}`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new ApiError(502, "The payment provider can't be reached right now. Try again in a moment.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(502, data?.error?.description || "The payment provider rejected the request");
  return data;
}

export const createOrder = ({ amountPaise, receipt, notes }) =>
  post("/orders", { amount: amountPaise, currency: "INR", receipt, notes });

export const refundPayment = (paymentId, amountPaise, notes) =>
  post(`/payments/${paymentId}/refund`, { amount: amountPaise, speed: "normal", notes });

const hmac = (secret, payload) => crypto.createHmac("sha256", secret).update(payload).digest("hex");

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y); // constant-time compare
}

// Razorpay signs "order_id|payment_id" with your key secret. Only the server knows the secret,
// so a valid signature proves the payment really happened.
export function verifyPaymentSignature({ orderId, paymentId, signature }) {
  if (!env.RAZORPAY_KEY_SECRET || !signature) return false;
  return safeEqual(hmac(env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`), signature);
}

export function verifyWebhookSignature(rawBody, signature) {
  if (!env.RAZORPAY_WEBHOOK_SECRET || !signature) return false;
  return safeEqual(hmac(env.RAZORPAY_WEBHOOK_SECRET, rawBody), signature);
}
