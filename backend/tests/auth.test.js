import { startDb, stopDb, clearDb, signup, auth, validResource, app, request } from "./helpers.js";

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

describe("auth", () => {
  const body = { name: "Asha", email: "asha@test.dev", password: "Password1!" };

  it("registers a user and sets an httpOnly refresh cookie", async () => {
    const res = await request(app).post("/api/auth/register").send(body);
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.headers["set-cookie"][0]).toMatch(/refreshToken=.*HttpOnly/i);
  });

  it("rejects duplicate emails", async () => {
    await request(app).post("/api/auth/register").send(body);
    const res = await request(app).post("/api/auth/register").send(body);
    expect(res.status).toBe(409);
  });

  it("does not allow self-registering as admin", async () => {
    const res = await request(app).post("/api/auth/register").send({ ...body, role: "admin" });
    expect(res.status).toBe(400);
  });

  it("rejects weak passwords", async () => {
    const res = await request(app).post("/api/auth/register").send({ ...body, password: "short" });
    expect(res.status).toBe(400);
  });

  it("logs in and rejects a wrong password", async () => {
    await request(app).post("/api/auth/register").send(body);
    const ok = await request(app).post("/api/auth/login").send({ email: body.email, password: body.password });
    expect(ok.status).toBe(200);
    const bad = await request(app).post("/api/auth/login").send({ email: body.email, password: "nope-nope" });
    expect(bad.status).toBe(401);
  });

  it("protects /me and returns the user with a valid token", async () => {
    expect((await request(app).get("/api/auth/me")).status).toBe(401);
    const { token } = await signup("user");
    const res = await request(app).get("/api/auth/me").set(auth(token));
    expect(res.status).toBe(200);
  });

  it("issues a new access token from the refresh cookie", async () => {
    const { cookie } = await signup("user");
    const res = await request(app).post("/api/auth/refresh").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect((await request(app).post("/api/auth/refresh")).status).toBe(401);
  });

  it("blocks unapproved providers from creating listings", async () => {
    const { token } = await signup("provider", { approve: false });
    const res = await request(app).post("/api/resources").set(auth(token)).send(validResource());
    expect(res.status).toBe(403);
  });

  it("blocks regular users from provider routes", async () => {
    const { token } = await signup("user");
    const res = await request(app).get("/api/resources/mine").set(auth(token));
    expect(res.status).toBe(403);
  });
});
