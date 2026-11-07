import { z } from "zod";
import Booking from "../models/Booking.js";
import Resource from "../models/Resource.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { generateSlots, localDateOf } from "../utils/slots.js";
import { env } from "../config/env.js";

const MAX_DAYS_AHEAD = 60;

export const createBookingSchema = z.object({
  resourceId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid listing id"),
  startTime: z.iso.datetime({ offset: true, message: "startTime must be an ISO date-time" }),
});

export const createBooking = asyncHandler(async (req, res) => {
  const start = new Date(req.body.startTime);
  const now = Date.now();

  if (start.getTime() <= now) throw new ApiError(400, "That slot has already started");
  if (start.getTime() > now + MAX_DAYS_AHEAD * 86400000) {
    throw new ApiError(400, `You can book up to ${MAX_DAYS_AHEAD} days ahead`);
  }

  const resource = await Resource.findOne({ _id: req.body.resourceId, isActive: true });
  if (!resource) throw new ApiError(404, "Listing not found");

  // The client may only pick a slot the resource really offers.
  const match = generateSlots(resource, localDateOf(start)).find((s) => s.start.getTime() === start.getTime());
  if (!match) throw new ApiError(400, "That time isn't an available slot for this listing");

  try {
    const booking = await Booking.create({
      user: req.user.id,
      resource: resource._id,
      provider: resource.provider,
      startTime: match.start,
      endTime: match.end,
      price: resource.pricePerSlot,
    });
    res.status(201).json({ booking });
  } catch (err) {
    // Lost the race: the unique index rejected the second writer.
    if (err.code === 11000) throw new ApiError(409, "Someone just booked that slot. Pick another one");
    throw err;
  }
});

export const myBookings = asyncHandler(async (req, res) => {
  const items = await Booking.find({ user: req.user.id })
    .sort({ startTime: -1 })
    .populate("resource", "name city category address");
  res.json({ items });
});

export const cancelBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findOne({ _id: req.params.id, user: req.user.id });
  if (!booking) throw new ApiError(404, "Booking not found");
  if (booking.status === "cancelled") throw new ApiError(400, "This booking is already cancelled");

  const hoursLeft = (booking.startTime.getTime() - Date.now()) / 3600000;
  if (hoursLeft < env.CANCEL_WINDOW_HOURS) {
    throw new ApiError(400, `Bookings can only be cancelled ${env.CANCEL_WINDOW_HOURS} hours or more before the start`);
  }

  booking.status = "cancelled";
  booking.cancelledAt = new Date();
  await booking.save();
  res.json({ booking });
});

export const providerBookings = asyncHandler(async (req, res) => {
  const items = await Booking.find({ provider: req.user.id })
    .sort({ startTime: -1 })
    .limit(100)
    .populate("resource", "name")
    .populate("user", "name email");
  res.json({ items });
});
