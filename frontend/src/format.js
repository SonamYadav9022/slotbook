// Slots are shown in the venue's timezone, whatever the visitor's laptop says.
const TZ = "Asia/Kolkata";

export const money = (n) => `₹${Number(n).toLocaleString("en-IN")}`;

export const timeOf = (iso) =>
  new Date(iso).toLocaleTimeString("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });

export const dayOf = (iso) =>
  new Date(iso).toLocaleDateString("en-IN", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });

export const todayISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

export const addDays = (dateStr, n) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const CATEGORIES = ["football", "cricket", "badminton", "tennis", "pickleball", "basketball"];
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
