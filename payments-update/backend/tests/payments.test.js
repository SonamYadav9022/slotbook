import Booking from "../models/Booking.js";
import { expireStaleHolds } from "../services/bookingService.js";
import {
  startDb, stopDb, clearDb, signup, auth, createResource, futureDate, mockRazorpay, paymentProof,
  webhookRequest, startBooking, bookAndPay, app, request,
} from "./helpers.js";

let rzp;
beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  rzp = mockRazorpay();
});
afterEach(() => rzp.restore());

async function setup(over = {}) {
  const provider = await signup("provider");
  const resource = await createResource(provider.token, over);
  const { body } = await request(app).get(`/api/resources/${resource._id}/slots`).query({ date: futureDate() });
  const user = await signup("user");
  return { provider, resource, slots: body.slots, user };
}

const verify = (token, bookingId, proof) =>
  request(app).post(`/api/bookings/${bookingId}/verify`).set(auth(token)).send(proof);

const slotStatus = async (resourceId, index) => {
  const { body } = await request(app).get(`/api/resources/${resourceId}/slots`).query({ date: futureDate() });
  return body.slots[index].status;
};

describe("paying for a booking", () => {
  it("creates a pending hold with a Razorpay order, and the slot shows as booked", async () => {
    const { resource, slots, user } = await setup();
    const res = await startBooking(user.token, resource._id, slots[0].startTime);

    expect(res.status).toBe(201);
    expect(res.body.booking.status).toBe("pending");
    expect(res.body.checkout).toMatchObject({ orderId: "order_1", amount: 100000, currency: "INR", keyId: "rzp_test_abc" });
    expect(await slotStatus(resource._id, 0)).toBe("booked");
  });

  it("confirms the booking when the payment signature is valid", async () => {
    const { resource, slots, user } = await setup();
    const hold = await startBooking(user.token, resource._id, slots[0].startTime);
    const res = await verify(user.token, hold.body.booking._id, paymentProof(hold.body.checkout.orderId, "pay_1"));

    expect(res.status).toBe(200);
    expect(res.body.booking).toMatchObject({ status: "confirmed", paymentId: "pay_1" });
    expect(res.body.booking.expiresAt).toBeUndefined();
  });

  it("rejects a forged signature and leaves the booking pending", async () => {
    const { resource, slots, user } = await setup();
    const hold = await startBooking(user.token, resource._id, slots[0].startTime);
    const proof = { ...paymentProof(hold.body.checkout.orderId), razorpay_signature: "f".repeat(64) };
    const res = await verify(user.token, hold.body.booking._id, proof);

    expect(res.status).toBe(400);
    expect((await Booking.findById(hold.body.booking._id)).status).toBe("pending");
  });

  it("rejects a valid signature from a different order", async () => {
    const { resource, slots, user } = await setup();
    const hold = await startBooking(user.token, resource._id, slots[0].startTime);
    const res = await verify(user.token, hold.body.booking._id, paymentProof("order_other"));
    expect(res.status).toBe(400);
  });

  it("is idempotent when verify is called twice", async () => {
    const { resource, slots, user } = await setup();
    const hold = await startBooking(user.token, resource._id, slots[0].startTime);
    const proof = paymentProof(hold.body.checkout.orderId, "pay_1");
    expect((await verify(user.token, hold.body.booking._id, proof)).status).toBe(200);
    expect((await verify(user.token, hold.body.booking._id, proof)).status).toBe(200);
  });

  it("does not let another user verify someone else's booking", async () => {
    const { resource, slots, user } = await setup();
    const intruder = await signup("user");
    const hold = await startBooking(user.token, resource._id, slots[0].startTime);
    const res = await verify(intruder.token, hold.body.booking._id, paymentProof(hold.body.checkout.orderId));
    expect(res.status).toBe(404);
  });

  it("resumes the same order when the player taps book again", async () => {
    const { resource, slots, user } = await setup();
    const first = await startBooking(user.token, resource._id, slots[0].startTime);
    const again = await startBooking(user.token, resource._id, slots[0].startTime);

    expect(again.status).toBe(200);
    expect(again.body.checkout.orderId).toBe(first.body.checkout.orderId);
    expect(rzp.calls.orders).toHaveLength(1);
  });

  it("reopens payment from My bookings via the checkout endpoint", async () => {
    const { resource, slots, user } = await setup();
    const hold = await startBooking(user.token, resource._id, slots[0].startTime);
    const res = await request(app).get(`/api/bookings/${hold.body.booking._id}/checkout`).set(auth(user.token));
    expect(res.status).toBe(200);
    expect(res.body.checkout.orderId).toBe(hold.body.checkout.orderId);
  });

  it("confirms free listings immediately without a payment", async () => {
    const { resource, slots, user } = await setup({ pricePerSlot: 0 });
    const res = await startBooking(user.token, resource._id, slots[0].startTime);
    expect(res.status).toBe(201);
    expect(res.body.booking.status).toBe("confirmed");
    expect(rzp.calls.orders).toHaveLength(0);
  });

  it("releases the slot if the payment order can't be created", async () => {
    const { resource, slots, user } = await setup();
    rzp.state.failOrder = true;
    const res = await startBooking(user.token, resource._id, slots[0].startTime);
    expect(res.status).toBe(502);
    expect(await slotStatus(resource._id, 0)).toBe("free");
  });
});

describe("unpaid holds expire", () => {
  it("frees the slot after the hold runs out so someone else can book it", async () => {
    const { resource, slots, user } = await setup();
    const other = await signup("user");
    const hold = await startBooking(user.token, resource._id, slots[0].startTime);
    await Booking.updateOne({ _id: hold.body.booking._id }, { expiresAt: new Date(Date.now() - 1000) });

    expect(await slotStatus(resource._id, 0)).toBe("free");
    expect((await startBooking(other.token, resource._id, slots[0].startTime)).status).toBe(201);
    expect((await Booking.findById(hold.body.booking._id)).status).toBe("expired");
  });

  it("the sweep job expires only overdue pending bookings", async () => {
    const { resource, slots, user } = await setup();
    const a = await startBooking(user.token, resource._id, slots[0].startTime);
    const b = await startBooking(user.token, resource._id, slots[1].startTime);
    await Booking.updateOne({ _id: a.body.booking._id }, { expiresAt: new Date(Date.now() - 1000) });

    const { modifiedCount } = await expireStaleHolds();
    expect(modifiedCount).toBe(1);
    expect((await Booking.findById(b.body.booking._id)).status).toBe("pending");
  });

  it("refuses to reopen payment once the hold has expired", async () => {
    const { resource, slots, user } = await setup();
    const hold = await startBooking(user.token, resource._id, slots[0].startTime);
    await Booking.updateOne({ _id: hold.body.booking._id }, { expiresAt: new Date(Date.now() - 1000) });
    const res = await request(app).get(`/api/bookings/${hold.body.booking._id}/checkout`).set(auth(user.token));
    expect(res.status).toBe(410);
  });
});

describe("late payments", () => {
  it("re-takes the slot if it's still free", async () => {
    const { resource, slots, user } = await setup();
    const hold = await startBooking(user.token, resource._id, slots[0].startTime);
    await Booking.updateOne({ _id: hold.body.booking._id }, { expiresAt: new Date(Date.now() - 1000) });
    await expireStaleHolds();

    const res = await verify(user.token, hold.body.booking._id, paymentProof(hold.body.checkout.orderId));
    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe("confirmed");
  });

  it("refunds automatically if someone else took the slot in the meantime", async () => {
    const { resource, slots, user } = await setup();
    const other = await signup("user");
    const hold = await startBooking(user.token, resource._id, slots[0].startTime);
    await Booking.updateOne({ _id: hold.body.booking._id }, { expiresAt: new Date(Date.now() - 1000) });
    await bookAndPay(other.token, resource._id, slots[0].startTime); // slot now belongs to someone else

    const res = await verify(user.token, hold.body.booking._id, paymentProof(hold.body.checkout.orderId, "pay_late"));
    expect(res.status).toBe(409);
    expect(rzp.calls.refunds).toHaveLength(1);
    expect(rzp.calls.refunds[0].payment_id).toBe("pay_late");
    expect((await Booking.findById(hold.body.booking._id)).status).toBe("cancelled");
  });
});

describe("cancelling and refunds", () => {
  it("keeps the booking confirmed if the refund fails", async () => {
    const { resource, slots, user } = await setup();
    const booking = await bookAndPay(user.token, resource._id, slots[0].startTime);
    rzp.state.failRefund = true;

    const res = await request(app).patch(`/api/bookings/${booking._id}/cancel`).set(auth(user.token));
    expect(res.status).toBe(502);
    expect((await Booking.findById(booking._id)).status).toBe("confirmed");
  });

  it("cancelling an unpaid hold releases the slot without any refund", async () => {
    const { resource, slots, user } = await setup();
    const hold = await startBooking(user.token, resource._id, slots[0].startTime);
    const res = await request(app).patch(`/api/bookings/${hold.body.booking._id}/cancel`).set(auth(user.token));

    expect(res.status).toBe(200);
    expect(rzp.calls.refunds).toHaveLength(0);
    expect(await slotStatus(resource._id, 0)).toBe("free");
  });
});

describe("webhook", () => {
  const event = (orderId, paymentId) => ({
    event: "payment.captured",
    payload: { payment: { entity: { id: paymentId, order_id: orderId } } },
  });
  const send = ({ raw, signature }) =>
    request(app).post("/api/payments/webhook").set("Content-Type", "application/json").set("X-Razorpay-Signature", signature).send(raw);

  it("confirms a pending booking even if the browser never called verify", async () => {
    const { resource, slots, user } = await setup();
    const hold = await startBooking(user.token, resource._id, slots[0].startTime);

    const res = await send(webhookRequest(event(hold.body.checkout.orderId, "pay_wh")));
    expect(res.status).toBe(200);
    const booking = await Booking.findById(hold.body.booking._id);
    expect(booking).toMatchObject({ status: "confirmed", paymentId: "pay_wh" });
  });

  it("rejects a webhook with a bad signature", async () => {
    const { resource, slots, user } = await setup();
    const hold = await startBooking(user.token, resource._id, slots[0].startTime);
    const signed = webhookRequest(event(hold.body.checkout.orderId, "pay_wh"));

    const res = await send({ raw: signed.raw, signature: "0".repeat(64) });
    expect(res.status).toBe(401);
    expect((await Booking.findById(hold.body.booking._id)).status).toBe("pending");
  });

  it("is safe when it arrives after verify already confirmed the booking", async () => {
    const { resource, slots, user } = await setup();
    const hold = await startBooking(user.token, resource._id, slots[0].startTime);
    await verify(user.token, hold.body.booking._id, paymentProof(hold.body.checkout.orderId, "pay_1"));

    const res = await send(webhookRequest(event(hold.body.checkout.orderId, "pay_1")));
    expect(res.status).toBe(200);
    expect(await Booking.countDocuments({ status: "confirmed" })).toBe(1);
  });
});
