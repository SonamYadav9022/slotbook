import { env } from "../config/env.js";

const pad = (n) => String(n).padStart(2, "0");

// "+05:30" -> 330
export function offsetMinutes(offset = env.TZ_OFFSET) {
  const sign = offset.startsWith("-") ? -1 : 1;
  const [h, m] = offset.slice(1).split(":").map(Number);
  return sign * (h * 60 + m);
}

// The calendar date (YYYY-MM-DD) of an instant in the venue's timezone.
export function localDateOf(date, offset = env.TZ_OFFSET) {
  return new Date(date.getTime() + offsetMinutes(offset) * 60000).toISOString().slice(0, 10);
}

export function dayRange(dateStr, offset = env.TZ_OFFSET) {
  const start = new Date(`${dateStr}T00:00:00${offset}`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

/**
 * All slot start/end times a resource offers on a calendar date.
 * Slots are generated from the resource's opening hours, never stored,
 * so changing the schedule never leaves stale rows behind.
 */
export function generateSlots(resource, dateStr, offset = env.TZ_OFFSET) {
  const weekday = new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // weekday of a calendar date has no timezone
  if (!resource.daysOpen.includes(weekday)) return [];

  const slots = [];
  const closeMin = resource.closeHour * 60;
  for (let m = resource.openHour * 60; m + resource.slotMinutes <= closeMin; m += resource.slotMinutes) {
    const start = new Date(`${dateStr}T${pad(Math.floor(m / 60))}:${pad(m % 60)}:00${offset}`);
    slots.push({ start, end: new Date(start.getTime() + resource.slotMinutes * 60000) });
  }
  return slots;
}
