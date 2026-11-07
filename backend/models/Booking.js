import mongoose from "mongoose";

const bookingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    resource: { type: mongoose.Schema.Types.ObjectId, ref: "Resource", required: true },
    provider: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    price: { type: Number, required: true },
    status: { type: String, enum: ["confirmed", "cancelled"], default: "confirmed" },
    cancelledAt: Date,
    reminderSent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

/**
 * The core guarantee of the app: one *confirmed* booking per resource per start time.
 * The database enforces it, so two simultaneous requests can never both succeed.
 * The partial filter lets a cancelled slot be booked again.
 */
bookingSchema.index(
  { resource: 1, startTime: 1 },
  { unique: true, partialFilterExpression: { status: "confirmed" } }
);

export default mongoose.model("Booking", bookingSchema);
