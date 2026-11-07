import bcrypt from "bcryptjs";
import { z } from "zod";
import User from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  signAccess,
  signRefresh,
  verifyRefresh,
  REFRESH_COOKIE,
  refreshCookieOptions,
} from "../utils/tokens.js";

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(60),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(100),
  // Admins can never be created through the public API.
  role: z.enum(["user", "provider"], "Role must be user or provider").default("user"),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

function startSession(res, user) {
  res.cookie(REFRESH_COOKIE, signRefresh(user), refreshCookieOptions);
  return { user, accessToken: signAccess(user) };
}

export const register = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;
  if (await User.exists({ email })) throw new ApiError(409, "An account with this email already exists");

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email, passwordHash, role, approved: role !== "provider" });
  res.status(201).json(startSession(res, user));
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select("+passwordHash");
  const ok = user && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) throw new ApiError(401, "Incorrect email or password");
  res.json(startSession(res, user));
});

export const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw new ApiError(401, "Not logged in");
  let payload;
  try {
    payload = verifyRefresh(token);
  } catch {
    throw new ApiError(401, "Session expired. Please log in again");
  }
  const user = await User.findById(payload.sub);
  if (!user) throw new ApiError(401, "Account no longer exists");
  res.json(startSession(res, user)); // rotates the refresh token
});

export const logout = (req, res) => {
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions, maxAge: undefined });
  res.json({ message: "Logged out" });
};

export const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw new ApiError(404, "User not found");
  res.json({ user });
});
