import mongoose from "mongoose";

export const CATEGORIES = ["football", "cricket", "badminton", "tennis", "pickleball", "basketball"];

const resourceSchema = new mongoose.Schema(
  {
    provider: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    category: { type: String, enum: CATEGORIES, required: true },
    description: { type: String, trim: true, maxlength: 600, default: "" },
    city: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    pricePerSlot: { type: Number, required: true, min: 0 },
    openHour: { type: Number, required: true, min: 0, max: 23 },
    closeHour: { type: Number, required: true, min: 1, max: 24 },
    slotMinutes: { type: Number, enum: [30, 60, 90, 120], default: 60 },
    daysOpen: { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] }, // 0 = Sunday
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

resourceSchema.index({ category: 1, city: 1 });

export default mongoose.model("Resource", resourceSchema);
