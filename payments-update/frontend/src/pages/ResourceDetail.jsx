import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api, { errorMessage } from "../api.js";
import { useAuth } from "../AuthContext.jsx";
import { payForBooking } from "../razorpay.js";
import { addDays, dayOf, money, timeOf, todayISO, WEEKDAYS } from "../format.js";

const STATUS_LABEL = { free: "Open", booked: "Booked", past: "Passed" };

export default function ResourceDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const today = todayISO();

  const [resource, setResource] = useState(null);
  const [date, setDate] = useState(today);
  const [slots, setSlots] = useState(null);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    api.get(`/resources/${id}`).then((r) => setResource(r.data.resource)).catch((e) => setError(errorMessage(e)));
  }, [id]);

  const loadSlots = useCallback(() => {
    return api
      .get(`/resources/${id}/slots`, { params: { date } })
      .then((r) => setSlots(r.data.slots))
      .catch((e) => setError(errorMessage(e)));
  }, [id, date]);

  useEffect(() => {
    setSlots(null);
    setSelected(null);
    loadSlots();
  }, [loadSlots]);

  const book = async () => {
    if (!user) return navigate("/login", { state: { from: `/resources/${id}` } });
    const slot = selected;
    const label = `${resource.name}, ${dayOf(slot.startTime)}, ${timeOf(slot.startTime)}`;
    setBusy(true);
    setError("");
    setNotice("");
    setHeld(false);
    try {
      // The server holds the slot first, so nobody else can take it while you pay.
      const { data } = await api.post("/bookings", { resourceId: id, startTime: slot.startTime });
      if (data.checkout) await payForBooking(data, user, label);
      setNotice(`Booked ${timeOf(slot.startTime)} on ${dayOf(slot.startTime)}.`);
    } catch (e) {
      if (e.dismissed) setHeld(true); // closed the payment window
      else setError(e.message && !e.response ? e.message : errorMessage(e)); // e.g. someone else took the slot
    } finally {
      setSelected(null);
      setBusy(false);
      loadSlots();
    }
  };

  if (error && !resource) return <p className="error pad" role="alert">{error}</p>;
  if (!resource) return <p className="muted pad">Loading…</p>;

  const canBook = !user || user.role === "user";

  return (
    <div className="wrap detail">
      <Link to="/" className="back">Back to listings</Link>
      <header>
        <span className="tag">{resource.category}</span>
        <h1>{resource.name}</h1>
        <p className="muted">{resource.address}, {resource.city}</p>
        {resource.description && <p>{resource.description}</p>}
        <p className="muted">
          Open {resource.openHour}:00 to {resource.closeHour === 24 ? "midnight" : `${resource.closeHour}:00`} on{" "}
          {resource.daysOpen.length === 7 ? "all days" : resource.daysOpen.map((d) => WEEKDAYS[d]).join(", ")}.
        </p>
      </header>

      <section aria-labelledby="slots-h">
        <div className="datebar">
          <h2 id="slots-h">{dayOf(`${date}T12:00:00+05:30`)}</h2>
          <div>
            <button className="btn ghost small" disabled={date <= today} onClick={() => setDate(addDays(date, -1))}>Previous day</button>
            <input type="date" aria-label="Pick a date" min={today} max={addDays(today, 60)} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
            <button className="btn ghost small" disabled={date >= addDays(today, 60)} onClick={() => setDate(addDays(date, 1))}>Next day</button>
          </div>
        </div>

        {notice && <p className="success" role="status">{notice} <Link to="/bookings">See my bookings</Link></p>}
        {held && (
          <p className="note" role="status">
            Payment wasn't completed. We're holding your slot for 10 minutes. <Link to="/bookings">Finish paying in My bookings</Link>
          </p>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        {!canBook && <p className="note">Log in with a customer account to book. Provider and admin accounts can only view listings.</p>}

        {!slots && <p className="muted">Loading slots…</p>}
        {slots && slots.length === 0 && <p className="empty">Closed on this day. Try another date.</p>}
        {slots && slots.length > 0 && (
          <ul className="board">
            {slots.map((s) => {
              const open = s.status === "free" && canBook;
              const on = selected?.startTime === s.startTime;
              return (
                <li key={s.startTime}>
                  <button
                    className={`slot ${s.status} ${on ? "on" : ""}`}
                    disabled={!open}
                    aria-pressed={on}
                    onClick={() => setSelected(on ? null : s)}
                  >
                    <span className="time">{timeOf(s.startTime)} to {timeOf(s.endTime)}</span>
                    <span className="state">{STATUS_LABEL[s.status]}</span>
                    <span className="cost">{s.status === "free" ? money(resource.pricePerSlot) : ""}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {selected && (
        <div className="confirm" role="region" aria-label="Confirm booking">
          <p>
            <strong>{timeOf(selected.startTime)} to {timeOf(selected.endTime)}</strong>, {dayOf(selected.startTime)}, {money(resource.pricePerSlot)}
            {resource.pricePerSlot > 0 && <small className="hold-note">Held for 10 minutes while you pay</small>}
          </p>
          <button className="btn primary" disabled={busy} onClick={book}>
            {busy ? "Working…" : !user ? "Log in to book" : resource.pricePerSlot > 0 ? `Pay ${money(resource.pricePerSlot)} and book` : "Confirm booking"}
          </button>
        </div>
      )}
    </div>
  );
}
