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

export { app, request };
