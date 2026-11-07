import cron from "node-cron";
import { expireStaleHolds } from "../services/bookingService.js";

// Every minute, free the slots of bookings that were never paid for.
export function startHoldExpiryJob() {
  cron.schedule("* * * * *", async () => {
    try {
      const { modifiedCount } = await expireStaleHolds();
      if (modifiedCount) console.log(`[cron] released ${modifiedCount} unpaid hold(s)`);
    } catch (err) {
      console.error("[cron] hold expiry failed:", err);
    }
  });
}
