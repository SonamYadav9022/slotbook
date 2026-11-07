import { z } from "zod";
import Resource, { CATEGORIES } from "../models/Resource.js";
import Booking from "../models/Booking.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { generateSlots, dayRange } from "../utils/slots.js";

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const resourceSchema = z
  .object({
    name: z.string().trim().min(2, "Name is required").max(80),
    category: z.enum(CATEGORIES, "Pick a valid category"),
    description: z.string().trim().max(600).default(""),
    city: z.string().trim().min(2, "City is required"),
    address: z.string().trim().min(3, "Address is required"),
    pricePerSlot: z.coerce.number().min(0, "Price can't be negative"),
    openHour: z.coerce.number().int().min(0).max(23),
    closeHour: z.coerce.number().int().min(1).max(24),
    slotMinutes: z.coerce.number().refine((n) => [30, 60, 90, 120].includes(n), "Slot length must be 30, 60, 90 or 120 minutes").default(60),
    daysOpen: z.array(z.number().int().min(0).max(6)).min(1, "Open at least one day").default([0, 1, 2, 3, 4, 5, 6]),
  })
  .refine((r) => r.closeHour > r.openHour, { message: "Closing time must be after opening time", path: ["closeHour"] })
  .refine((r) => (r.closeHour - r.openHour) * 60 >= r.slotMinutes, {
    message: "Opening hours are shorter than one slot",
    path: ["slotMinutes"],
  });

export const listQuerySchema = z.object({
  category: z.enum(CATEGORIES).optional(),
  city: z.string().trim().optional(),
  q: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(9),
});

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must look like 2026-01-31")
  .refine((s) => !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime()), "That date doesn't exist");

export const slotsQuerySchema = z.object({ date: dateString });

export const listResources = asyncHandler(async (req, res) => {
  const { category, city, q, page, limit } = req.query;
  const filter = { isActive: true };
  if (category) filter.category = category;
  if (city) filter.city = new RegExp(`^${escapeRegex(city)}$`, "i");
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ name: rx }, { city: rx }, { address: rx }];
  }

  const [items, total] = await Promise.all([
    Resource.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("provider", "name"),
    Resource.countDocuments(filter),
  ]);
  res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
});

export const getResource = asyncHandler(async (req, res) => {
  const resource = await Resource.findOne({ _id: req.params.id, isActive: true }).populate("provider", "name");
  if (!resource) throw new ApiError(404, "Listing not found");
  res.json({ resource });
});

export const getSlots = asyncHandler(async (req, res) => {
  const resource = await Resource.findOne({ _id: req.params.id, isActive: true });
  if (!resource) throw new ApiError(404, "Listing not found");

  const { date } = req.query;
  const slots = generateSlots(resource, date);
  const { start, end } = dayRange(date);
  const booked = await Booking.find({
    resource: resource._id,
    status: "confirmed",
    startTime: { $gte: start, $lt: end },
  }).select("startTime");
  const bookedTimes = new Set(booked.map((b) => b.startTime.getTime()));
  const now = Date.now();

  res.json({
    date,
    price: resource.pricePerSlot,
    slots: slots.map((s) => ({
      startTime: s.start.toISOString(),
      endTime: s.end.toISOString(),
      status: s.start.getTime() <= now ? "past" : bookedTimes.has(s.start.getTime()) ? "booked" : "free",
    })),
  });
});

export const createResource = asyncHandler(async (req, res) => {
  const resource = await Resource.create({ ...req.body, provider: req.user.id });
  res.status(201).json({ resource });
});

export const myResources = asyncHandler(async (req, res) => {
  const items = await Resource.find({ provider: req.user.id }).sort({ createdAt: -1 });
  res.json({ items });
});

export const updateResource = asyncHandler(async (req, res) => {
  const resource = await Resource.findOneAndUpdate(
    { _id: req.params.id, provider: req.user.id },
    req.body,
    { returnDocument: "after", runValidators: true }
  );
  if (!resource) throw new ApiError(404, "Listing not found");
  res.json({ resource });
});

// Soft delete: past bookings keep pointing at a real document.
export const deactivateResource = asyncHandler(async (req, res) => {
  const resource = await Resource.findOneAndUpdate(
    { _id: req.params.id, provider: req.user.id },
    { isActive: false },
    { returnDocument: "after" }
  );
  if (!resource) throw new ApiError(404, "Listing not found");
  res.json({ resource });
});
