import mongoose from "mongoose";
import { env } from "./env.js";

export async function connectDB(uri = env.MONGO_URI) {
  await mongoose.connect(uri);
  // Make sure indexes (especially the unique booking index) exist before serving traffic.
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  console.log("MongoDB connected");
}
