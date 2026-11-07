import Booking from "../models/Booking.js";
import {
  startDb, stopDb, clearDb, signup, auth, createResource, futureDate, app, request,
} from "./helpers.js";

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

async function setup() {
  const provider = await signup("provider");
  const resource = await createResource(provider.token);
  const date = futureDate();
  const { body } = await request(app).get(`/api/resources/${resource._id}/slots`).query({ date });
  return { provider, resource, date, slots: body.slots };
}

const book = (token, resourceId, startTime) =>
  request(app).post("/api/bookings").set(auth(token)).send({ resourceId, startTime });

describe("slots", () => {
  it("generates slots from opening hours", async () => {
    const { slots } = await setup();
    expect(slots).toHaveLength(16); // 06:00-22:00, 60-minute slots
    expect(slots.every((s) => s.status === "free")).toBe(true);
  });

  it("returns no slots on a closed weekday", async () => {
    const provider = await signup("provider");
    const resource = await createResource(provider.token, { daysOpen: [1] }); // Mondays only
    let d = new Date(`${futureDate(3)}T00:00:00Z`);
    while (d.getUTCDay() === 1) d = new Date(d.getTime() + 86400000);
    const res = await request(app)
      .get(`/api/resources/${resource._id}/slots`)
      .query({ date: d.toISOString().slice(0, 10) });
    expect(res.body.slots).toHaveLength(0);
  });

  it("rejects a malformed date", async () => {
    const { resource } = await setup();
    const res = await request(app).get(`/api/resources/${resource._id}/slots`).query({ date: "tomorrow" });
    expect(res.status).toBe(400);
  });
});

describe("booking", () => {
  it("books a slot and shows it as booked", async () => {
    const { resource, date, slots } = await setup();
    const user = await signup("user");
    const res = await book(user.token, resource._id, slots[0].startTime);
    expect(res.status).toBe(201);
    expect(res.body.booking.price).toBe(1000);

    const after = await request(app).get(`/api/resources/${resource._id}/slots`).query({ date });
    expect(after.body.slots[0].status).toBe("booked");
  });

  it("lets exactly one of many simultaneous requests win the same slot", async () => {
    const { resource, slots } = await setup();
    const users = await Promise.all(Array.from({ length: 8 }, () => signup("user")));

    const results = await Promise.all(users.map((u) => book(u.token, resource._id, slots[2].startTime)));
    const statuses = results.map((r) => r.status).sort();

    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(7);
    expect(await Booking.countDocuments({ status: "confirmed" })).toBe(1);
  });

  it("rejects a time that is not a real slot", async () => {
    const { resource, slots } = await setup();
    const user = await signup("user");
    const offGrid = new Date(new Date(slots[0].startTime).getTime() + 15 * 60000).toISOString();
    expect((await book(user.token, resource._id, offGrid)).status).toBe(400);
  });

  it("rejects a slot in the past", async () => {
    const { resource } = await setup();
    const user = await signup("user");
    const past = new Date(Date.now() - 3600000).toISOString();
    expect((await book(user.token, resource._id, past)).status).toBe(400);
  });

  it("only lets the 'user' role book", async () => {
    const { provider, resource, slots } = await setup();
    expect((await book(provider.token, resource._id, slots[0].startTime)).status).toBe(403);
  });

  it("frees the slot on cancel so it can be booked again", async () => {
    const { resource, slots } = await setup();
    const a = await signup("user");
    const b = await signup("user");
    const first = await book(a.token, resource._id, slots[1].startTime);

    const cancel = await request(app).patch(`/api/bookings/${first.body.booking._id}/cancel`).set(auth(a.token));
    expect(cancel.status).toBe(200);

    expect((await book(b.token, resource._id, slots[1].startTime)).status).toBe(201);
  });

  it("refuses late cancellations", async () => {
    const { resource, provider } = await setup();
    const user = await signup("user");
    const soon = await Booking.create({
      user: user.user._id,
      resource: resource._id,
      provider: provider.user._id,
      startTime: new Date(Date.now() + 3600000),
      endTime: new Date(Date.now() + 7200000),
      price: 1000,
    });
    const res = await request(app).patch(`/api/bookings/${soon._id}/cancel`).set(auth(user.token));
    expect(res.status).toBe(400);
  });

  it("hides other people's bookings from cancellation", async () => {
    const { resource, slots } = await setup();
    const a = await signup("user");
    const b = await signup("user");
    const booking = await book(a.token, resource._id, slots[0].startTime);
    const res = await request(app).patch(`/api/bookings/${booking.body.booking._id}/cancel`).set(auth(b.token));
    expect(res.status).toBe(404);
  });

  it("lists a user's bookings and the provider's incoming bookings", async () => {
    const { provider, resource, slots } = await setup();
    const user = await signup("user");
    await book(user.token, resource._id, slots[0].startTime);

    const mine = await request(app).get("/api/bookings/mine").set(auth(user.token));
    expect(mine.body.items).toHaveLength(1);
    const incoming = await request(app).get("/api/bookings/provider").set(auth(provider.token));
    expect(incoming.body.items).toHaveLength(1);
  });
});
