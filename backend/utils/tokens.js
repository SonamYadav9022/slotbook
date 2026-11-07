import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const signAccess = (user) =>
  jwt.sign({ sub: String(user._id), role: user.role }, env.JWT_ACCESS_SECRET, { expiresIn: "15m" });

export const signRefresh = (user) =>
  jwt.sign({ sub: String(user._id) }, env.JWT_REFRESH_SECRET, { expiresIn: "7d" });

export const verifyAccess = (token) => jwt.verify(token, env.JWT_ACCESS_SECRET);
export const verifyRefresh = (token) => jwt.verify(token, env.JWT_REFRESH_SECRET);

// The refresh token lives in an httpOnly cookie scoped to the auth routes,
// so JavaScript on the page can never read it.
export const REFRESH_COOKIE = "refreshToken";
export const refreshCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: env.isProd,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/api/auth",
};
