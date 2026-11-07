import crypto from "crypto";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import app from "../app.js";
import User from "../models/User.js";

let mongod;

// Uses an in-memory MongoDB by default. Set TEST_MONGO_URI to use a real one instead.
export async function startDb() {
  const uri = process.env.TEST_MONGO_URI || (mongod = await MongoMemoryServer.create()).getUri();
  await mongoose.connect(uri);
  await Promise.all(Object.values(mongoose.models).map((m) => m.init())); // build unique indexes
}

export async function stopDb() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}

export async function clearDb() {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
}

let counter = 0;
export async function signup(role = "user", { approve = true } = {}) {
  counter += 1;
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name: `Test ${role} ${counter}`, email: `${role}${counter}@test.dev`, password: "Password1!", role });
  if (role === "provider" && approve) await User.updateOne({ _id: res.body.user._id }, { approved: true });
  return { token: res.body.accessToken, user: res.body.user, cookie: res.headers["set-cookie"] };
}

export async function makeAdmin() {
  const { user } = await signup("user");
  await User.updateOne({ _id: user._id }, { role: "admin" });
  const login = await request(app).post("/api/auth/login").send({ email: user.email, password: "Password1!" });
  return { token: login.body.accessToken, user };
}

export const auth = (token) => ({ Authorization: `Bearer ${token}` });

export const validResource = (over = {}) => ({
  name: "Test Turf",
  category: "football",
  city: "Pune",
  address: "Baner Road",
  pricePerSlot: 1000,
  openHour: 6,
  closeHour: 22,
  slotMinutes: 60,
  ...over,
});

// A calendar date (venue timezone) a few days ahead, so slots are always in the future.
export function futureDate(daysAhead = 3) {
  return new Date(Date.now() + daysAhead * 86400000 + 330 * 60000).toISOString().slice(0, 10);
}

export async function createResource(providerToken, over = {}) {
  const res = await request(app).post("/api/resources").set(auth(providerToken)).send(validResource(over));
  return res.body.resource;
}

// --- Razorpay test doubles --------------------------------------------------------------
const json = (status, data) => ({ ok: status < 300, status, json: async () => data });

// Replaces fetch for api.razorpay.com calls so tests never touch the network.
export function mockRazorpay() {
  const calls = { orders: [], refunds: [] };
  const state = { failOrder: false, failRefund: false };
  const original = globalThis.fetch;
  let n = 0;
  globalThis.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    if (url.endsWith("/orders")) {
      if (state.failOrder) return json(400, { error: { description: "Order failed" } });
      const order = { id: `order_${++n}`, ...body };
      calls.orders.push(order);
      return json(200, order);
    }
    const m = url.match(/payments\/(.+)\/refund$/);
    if (m) {
      if (state.failRefund) return json(400, { error: { description: "Refund failed" } });
      const refund = { id: `rfnd_${++n}`, status: "processed", payment_id: m[1], amount: body.amount };
      calls.refunds.push(refund);
      return json(200, refund);
    }
    return original(url, opts);
  };
  return { calls, state, restore: () => { globalThis.fetch = original; } };
}

const hmac = (secret, payload) => crypto.createHmac("sha256", secret).update(payload).digest("hex");

// What Razorpay Checkout hands the browser after a successful payment.
export function paymentProof(orderId, paymentId = `pay_${crypto.randomBytes(4).toString("hex")}`) {
  return {
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: hmac(process.env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`),
  };
}

export function webhookRequest(event) {
  const raw = JSON.stringify(event);
  return { raw, signature: hmac(process.env.RAZORPAY_WEBHOOK_SECRET, raw) };
}

export const startBooking = (token, resourceId, startTime) =>
  request(app).post("/api/bookings").set(auth(token)).send({ resourceId, startTime });

// Holds a slot, then pays for it: returns the confirmed booking.
export async function bookAndPay(token, resourceId, startTime) {
  const hold = await startBooking(token, resourceId, startTime);
  const res = await request(app)
    .post(`/api/bookings/${hold.body.booking._id}/verify`)
    .set(auth(token))
    .send(paymentProof(hold.body.checkout.orderId));
  return res.body.booking;
}

export { app, request };
