import cron from "node-cron";
import Booking from "../models/Booking.js";
import { sendMail } from "../utils/mailer.js";

const fmt = (d) => d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

// Emails a reminder for every confirmed booking starting within 24 hours.
// `reminderSent` makes the job idempotent, so overlapping runs never double-send.
export async function sendDueReminders(now = new Date()) {
  const until = new Date(now.getTime() + 24 * 3600000);
  const due = await Booking.find({
    status: "confirmed",
    reminderSent: false,
    startTime: { $gt: now, $lte: until },
  })
    .populate("user", "name email")
    .populate("resource", "name");

  for (const b of due) {
    await sendMail({
      to: b.user.email,
      subject: `Reminder: ${b.resource.name} at ${fmt(b.startTime)}`,
      text: `Hi ${b.user.name}, your booking at ${b.resource.name} starts at ${fmt(b.startTime)}.`,
    });
    b.reminderSent = true;
    await b.save();
  }
  return due.length;
}

export function startReminderJob() {
  cron.schedule("0 * * * *", async () => {
    try {
      const sent = await sendDueReminders();
      if (sent) console.log(`[cron] sent ${sent} reminder(s)`);
    } catch (err) {
      console.error("[cron] reminder job failed:", err);
    }
  });
}
