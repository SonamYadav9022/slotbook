import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDB } from "./config/db.js";
import User from "./models/User.js";
import Resource from "./models/Resource.js";

await connectDB();

async function ensureUser({ name, email, password, role }) {
  const existing = await User.findOne({ email });
  if (existing) return existing;
  return User.create({ name, email, role, approved: true, passwordHash: await bcrypt.hash(password, 10) });
}

await ensureUser({ name: "Admin", email: "admin@slotbook.dev", password: "Admin@123", role: "admin" });
await ensureUser({ name: "Demo User", email: "user@slotbook.dev", password: "User@12345", role: "user" });
const provider = await ensureUser({ name: "Demo Provider", email: "provider@slotbook.dev", password: "Provider@123", role: "provider" });

if ((await Resource.countDocuments()) === 0) {
  const base = { provider: provider._id, city: "Pune" };
  await Resource.insertMany([
    { ...base, name: "Baner Turf 5v5", category: "football", address: "Baner Road", pricePerSlot: 1200, openHour: 6, closeHour: 23, description: "Floodlit 5-a-side turf with changing rooms." },
    { ...base, name: "Kothrud Cricket Nets", category: "cricket", address: "Karve Road", pricePerSlot: 700, openHour: 6, closeHour: 21, description: "Three bowling-machine lanes." },
    { ...base, name: "Aundh Badminton Hall", category: "badminton", address: "ITI Road, Aundh", pricePerSlot: 400, openHour: 6, closeHour: 22, description: "Four wooden courts, shuttles on sale." },
    { ...base, name: "Viman Nagar Tennis Club", category: "tennis", address: "Viman Nagar", pricePerSlot: 600, openHour: 6, closeHour: 20, slotMinutes: 60, description: "Hard courts with evening lights." },
    { ...base, name: "Hinjewadi Pickleball Arena", category: "pickleball", address: "Phase 1, Hinjewadi", pricePerSlot: 500, openHour: 7, closeHour: 22, slotMinutes: 60, description: "Two indoor courts." },
    { ...base, name: "Wakad Hoops", category: "basketball", address: "Wakad", pricePerSlot: 800, openHour: 8, closeHour: 22, slotMinutes: 90, description: "Full court, 90-minute games." },
  ]);
}

console.log("Seeded. Logins:\n  admin@slotbook.dev / Admin@123\n  provider@slotbook.dev / Provider@123\n  user@slotbook.dev / User@12345");
await mongoose.disconnect();
