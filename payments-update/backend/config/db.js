import mongoose from "mongoose";
import { env } from "./env.js";
import Booking from "../models/Booking.js";

// Upgrades databases created before payments existed: marks old confirmed bookings
// as slot holders and drops the old status-based unique index so the new one can be built.
async function prepareBookings() {
  await Booking.collection.updateMany({ holdsSlot: { $exists: false } }, [
    { $set: { holdsSlot: { $eq: ["$status", "confirmed"] } } },
  ]);
  try {
    await Booking.collection.dropIndex("resource_1_startTime_1");
  } catch (err) {
    if (!["IndexNotFound", "NamespaceNotFound"].includes(err.codeName)) throw err;
  }
}

export async function connectDB(uri = env.MONGO_URI) {
  await mongoose.connect(uri);
  await prepareBookings();
  // Make sure indexes (especially the unique booking index) exist before serving traffic.
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  console.log("MongoDB connected");
}
