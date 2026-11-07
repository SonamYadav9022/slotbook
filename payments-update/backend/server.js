import app from "./app.js";
import { env } from "./config/env.js";
import { connectDB } from "./config/db.js";
import { startReminderJob } from "./jobs/reminders.js";
import { startHoldExpiryJob } from "./jobs/holds.js";

try {
  await connectDB();
  startReminderJob();
  startHoldExpiryJob();
  app.listen(env.PORT, () => console.log(`SlotBook API on http://localhost:${env.PORT} (${env.NODE_ENV})`));
} catch (err) {
  console.error("Failed to start:", err);
  process.exit(1);
}
