import { useCallback, useEffect, useState } from "react";
import api, { errorMessage } from "../api.js";
import { useAuth } from "../AuthContext.jsx";
import { CATEGORIES, WEEKDAYS, dayOf, money, timeOf } from "../format.js";

const blank = {
  name: "", category: "football", city: "", address: "", description: "",
  pricePerSlot: 800, openHour: 6, closeHour: 22, slotMinutes: 60, daysOpen: [0, 1, 2, 3, 4, 5, 6],
};

export default function ProviderDashboard() {
  const { user } = useAuth();
  const [listings, setListings] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    api.get("/resources/mine").then((r) => setListings(r.data.items)).catch(() => {});
    api.get("/bookings/provider").then((r) => setBookings(r.data.items)).catch(() => {});
  }, []);
  useEffect(load, [load]);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const toggleDay = (d) =>
    setForm({ ...form, daysOpen: form.daysOpen.includes(d) ? form.daysOpen.filter((x) => x !== d) : [...form.daysOpen, d].sort() });

  const create = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");
    try {
      await api.post("/resources", form);
      setForm(blank);
      setNotice("Listing published. Players can book it now.");
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const deactivate = async (id) => {
    if (!window.confirm("Remove this listing? Existing bookings are kept.")) return;
    await api.delete(`/resources/${id}`);
    load();
  };

  if (!user.approved) {
    return (
      <div className="wrap narrow">
        <h1>My listings</h1>
        <p className="note">Your provider account is waiting for admin approval. You can add listings as soon as it's approved. Check back later.</p>
      </div>
    );
  }

  return (
    <div className="wrap two">
      <section>
        <h1>My listings</h1>
        {listings.length === 0 && <p className="empty">No listings yet. Add your first one using the form.</p>}
        <ul className="rows">
          {listings.map((l) => (
            <li key={l._id} className={`row ${l.isActive ? "" : "cancelled"}`}>
              <div>
                <strong>{l.name}</strong>
                <p className="muted">{l.category}, {l.city}, {money(l.pricePerSlot)} per {l.slotMinutes} min</p>
              </div>
              <div className="right">
                {l.isActive ? <button className="btn ghost small" onClick={() => deactivate(l._id)}>Remove</button> : <span className="pill">Removed</span>}
              </div>
            </li>
          ))}
        </ul>

        <h2>Incoming bookings</h2>
        {bookings.length === 0 && <p className="empty">No bookings yet.</p>}
        <ul className="rows">
          {bookings.map((b) => (
            <li key={b._id} className={`row ${b.status}`}>
              <div>
                <strong>{b.resource?.name}</strong>
                <p className="muted">{b.user?.name}, {dayOf(b.startTime)}, {timeOf(b.startTime)}</p>
              </div>
              <div className="right">
                <span>{money(b.price)}</span>
                {b.status === "cancelled" && <span className="pill">Cancelled</span>}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <form className="panel" onSubmit={create}>
        <h2>Add a listing</h2>
        <label>Name<input required value={form.name} onChange={set("name")} /></label>
        <label>Sport
          <select value={form.category} onChange={set("category")}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label>City<input required value={form.city} onChange={set("city")} /></label>
        <label>Address<input required value={form.address} onChange={set("address")} /></label>
        <label>About<textarea rows={3} value={form.description} onChange={set("description")} /></label>
        <div className="inline">
          <label>Price per slot (₹)<input type="number" min={0} required value={form.pricePerSlot} onChange={set("pricePerSlot")} /></label>
          <label>Slot length
            <select value={form.slotMinutes} onChange={set("slotMinutes")}>
              {[30, 60, 90, 120].map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
          </label>
        </div>
        <div className="inline">
          <label>Opens at (hour)<input type="number" min={0} max={23} required value={form.openHour} onChange={set("openHour")} /></label>
          <label>Closes at (hour)<input type="number" min={1} max={24} required value={form.closeHour} onChange={set("closeHour")} /></label>
        </div>
        <fieldset className="days">
          <legend>Open on</legend>
          {WEEKDAYS.map((w, d) => (
            <label key={w} className={form.daysOpen.includes(d) ? "on" : ""}>
              <input type="checkbox" checked={form.daysOpen.includes(d)} onChange={() => toggleDay(d)} />
              {w}
            </label>
          ))}
        </fieldset>
        {error && <p className="error" role="alert">{error}</p>}
        {notice && <p className="success" role="status">{notice}</p>}
        <button className="btn primary">Publish listing</button>
      </form>
    </div>
  );
}
