import { ApiError } from "../utils/ApiError.js";
import { verifyAccess } from "../utils/tokens.js";
import User from "../models/User.js";

export const requireAuth = (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next(new ApiError(401, "Please log in to continue"));
  try {
    const payload = verifyAccess(token);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(new ApiError(401, "Your session expired. Please log in again"));
  }
};

export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : next(new ApiError(403, "You don't have access to this"));

// Providers are blocked from listing until an admin approves them.
export const requireApprovedProvider = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || user.role !== "provider") return next(new ApiError(403, "Providers only"));
    if (!user.approved) return next(new ApiError(403, "Your provider account is awaiting admin approval"));
    next();
  } catch (err) {
    next(err);
  }
};
