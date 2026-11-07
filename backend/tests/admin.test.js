import Booking from "../models/Booking.js";
import { sendDueReminders } from "../jobs/reminders.js";
import {
  startDb, stopDb, clearDb, signup, makeAdmin, auth, createResource, futureDate, app, request,
} from "./helpers.js";

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

describe("admin", () => {
  it("keeps admin routes away from non-admins", async () => {
    const { token } = await signup("user");
    expect((await request(app).get("/api/admin/stats").set(auth(token))).status).toBe(403);
  });

  it("approves a pending provider, who can then create listings", async () => {
    const admin = await makeAdmin();
    const provider = await signup("provider", { approve: false });

    const pending = await request(app).get("/api/admin/providers/pending").set(auth(admin.token));
    expect(pending.body.items).toHaveLength(1);

    const approve = await request(app)
      .patch(`/api/admin/providers/${provider.user._id}/approve`)
      .set(auth(admin.token));
    expect(approve.status).toBe(200);

    expect(await createResource(provider.token)).toBeTruthy();
  });

  it("reports booking stats", async () => {
    const admin = await makeAdmin();
    const provider = await signup("provider");
    const resource = await createResource(provider.token);
    const { body } = await request(app)
      .get(`/api/resources/${resource._id}/slots`)
      .query({ date: futureDate() });
    const user = await signup("user");
    await request(app)
      .post("/api/bookings")
      .set(auth(user.token))
      .send({ resourceId: resource._id, startTime: body.slots[0].startTime });

    const res = await request(app).get("/api/admin/stats").set(auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.bookings).toBe(1);
    expect(res.body.revenue).toBe(1000);
    expect(res.body.topResources[0].name).toBe("Test Turf");
    expect(res.body.bookingsPerDay).toHaveLength(1);
  });
});

describe("reminder job", () => {
  it("reminds once for bookings starting within 24h", async () => {
    const provider = await signup("provider");
    const user = await signup("user");
    const resource = await createResource(provider.token);
    await Booking.create({
      user: user.user._id,
      resource: resource._id,
      provider: provider.user._id,
      startTime: new Date(Date.now() + 5 * 3600000),
      endTime: new Date(Date.now() + 6 * 3600000),
      price: 1000,
    });
    expect(await sendDueReminders()).toBe(1);
    expect(await sendDueReminders()).toBe(0); // idempotent
  });
});
