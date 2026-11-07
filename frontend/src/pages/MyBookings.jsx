import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { errorMessage } from "../api.js";
import { dayOf, money, timeOf } from "../format.js";

function Row({ b, onCancel }) {
  const upcoming = b.status === "confirmed" && new Date(b.startTime) > new Date();
  return (
    <li className={`row ${b.status}`}>
      <div>
        <strong>{b.resource?.name}</strong>
        <p className="muted">{dayOf(b.startTime)}, {timeOf(b.startTime)} to {timeOf(b.endTime)}</p>
      </div>
      <div className="right">
        <span>{money(b.price)}</span>
        {b.status === "cancelled" && <span className="pill">Cancelled</span>}
        {upcoming && <button className="btn ghost small" onClick={() => onCancel(b)}>Cancel</button>}
      </div>
    </li>
  );
}

export default function MyBookings() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api.get("/bookings/mine").then((r) => setItems(r.data.items)).catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(load, [load]);

  const cancel = async (b) => {
    if (!window.confirm(`Cancel ${b.resource?.name} on ${dayOf(b.startTime)} at ${timeOf(b.startTime)}?`)) return;
    setError("");
    try {
      await api.patch(`/bookings/${b._id}/cancel`);
      load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const now = new Date();
  const upcoming = items?.filter((b) => b.status === "confirmed" && new Date(b.startTime) > now).reverse() ?? [];
  const history = items?.filter((b) => !upcoming.includes(b)) ?? [];

  return (
    <div className="wrap narrow">
      <h1>My bookings</h1>
      {error && <p className="error" role="alert">{error}</p>}
      {!items && <p className="muted">Loading…</p>}
      {items && items.length === 0 && (
        <p className="empty">You haven't booked anything yet. <Link to="/">Find a court</Link></p>
      )}
      {upcoming.length > 0 && (
        <>
          <h2>Upcoming</h2>
          <ul className="rows">{upcoming.map((b) => <Row key={b._id} b={b} onCancel={cancel} />)}</ul>
        </>
      )}
      {history.length > 0 && (
        <>
          <h2>Past and cancelled</h2>
          <ul className="rows">{history.map((b) => <Row key={b._id} b={b} onCancel={cancel} />)}</ul>
        </>
      )}
    </div>
  );
}
