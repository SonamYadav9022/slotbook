import dotenv from "dotenv";

dotenv.config({ quiet: true });

const isProd = process.env.NODE_ENV === "production";

function secret(name, fallback) {
  const value = process.env[name];
  if (value) return value;
  if (isProd) throw new Error(`Missing required env var: ${name}`);
  return fallback;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT) || 5000,
  MONGO_URI: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/slotbook",
  JWT_ACCESS_SECRET: secret("JWT_ACCESS_SECRET", "dev-access-secret"),
  JWT_REFRESH_SECRET: secret("JWT_REFRESH_SECRET", "dev-refresh-secret"),
  CLIENT_URL: process.env.CLIENT_URL || "http://localhost:5173",
  TZ_OFFSET: process.env.TZ_OFFSET || "+05:30",
  CANCEL_WINDOW_HOURS: Number(process.env.CANCEL_WINDOW_HOURS ?? 2),
  // How long an unpaid booking keeps its slot before it is released.
  HOLD_MINUTES: Number(process.env.HOLD_MINUTES ?? 10),
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || "",
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || "",
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || "",
  RAZORPAY_API_BASE: process.env.RAZORPAY_API_BASE || "https://api.razorpay.com/v1",
  isProd,
};
