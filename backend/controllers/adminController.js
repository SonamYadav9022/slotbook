import User from "../models/User.js";
import Resource from "../models/Resource.js";
import Booking from "../models/Booking.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { env } from "../config/env.js";

export const stats = asyncHandler(async (req, res) => {
  const since = new Date(Date.now() - 7 * 86400000);

  const [users, providers, pendingProviders, resources, totals, perDay, topResources] = await Promise.all([
    User.countDocuments({ role: "user" }),
    User.countDocuments({ role: "provider", approved: true }),
    User.countDocuments({ role: "provider", approved: false }),
    Resource.countDocuments({ isActive: true }),
    Booking.aggregate([
      { $match: { status: "confirmed" } },
      { $group: { _id: null, bookings: { $sum: 1 }, revenue: { $sum: "$price" } } },
    ]),
    Booking.aggregate([
      { $match: { status: "confirmed", createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: env.TZ_OFFSET } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Booking.aggregate([
      { $match: { status: "confirmed" } },
      { $group: { _id: "$resource", bookings: { $sum: 1 }, revenue: { $sum: "$price" } } },
      { $sort: { bookings: -1 } },
      { $limit: 5 },
      { $lookup: { from: "resources", localField: "_id", foreignField: "_id", as: "resource" } },
      { $unwind: "$resource" },
      { $project: { _id: 0, resourceId: "$_id", name: "$resource.name", bookings: 1, revenue: 1 } },
    ]),
  ]);

  res.json({
    users,
    providers,
    pendingProviders,
    resources,
    bookings: totals[0]?.bookings ?? 0,
    revenue: totals[0]?.revenue ?? 0,
    bookingsPerDay: perDay.map((d) => ({ date: d._id, count: d.count })),
    topResources,
  });
});

export const pendingProviders = asyncHandler(async (req, res) => {
  const items = await User.find({ role: "provider", approved: false }).sort({ createdAt: 1 });
  res.json({ items });
});

export const approveProvider = asyncHandler(async (req, res) => {
  const user = await User.findOneAndUpdate(
    { _id: req.params.id, role: "provider" },
    { approved: true },
    { returnDocument: "after" }
  );
  if (!user) throw new ApiError(404, "Provider not found");
  res.json({ user });
});
