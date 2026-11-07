import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { errorMessage } from "../api.js";
import { useAuth } from "../AuthContext.jsx";
import { payForBooking } from "../razorpay.js";
import { dayOf, money, timeOf } from "../format.js";

function Row({ b, onCancel, onPay }) {
  const pending = b.status === "pending";
  const upcoming = (pending || b.status === "confirmed") && new Date(b.startTime) > new Date();
  const minsLeft = pending ? Math.max(1, Math.ceil((new Date(b.expiresAt) - Date.now()) / 60000)) : 0;

  return (
    <li className={`row ${b.status}`}>
      <div>
        <strong>{b.resource?.name}</strong>
        <p className="muted">{dayOf(b.startTime)}, {timeOf(b.startTime)} to {timeOf(b.endTime)}</p>
      </div>
      <div className="right">
        <span>{money(b.price)}</span>
        {pending && <span className="pill warn">Pay within {minsLeft} min</span>}
        {b.status === "cancelled" && <span className="pill">{b.refundId ? "Cancelled, refunded" : "Cancelled"}</span>}
        {pending && <button className="btn primary small" onClick={() => onPay(b)}>Pay now</button>}
        {upcoming && <button className="btn ghost small" onClick={() => onCancel(b)}>Cancel</button>}
      </div>
    </li>
  );
}

export default function MyBookings() {
  const { user } = useAuth();
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    api.get("/bookings/mine").then((r) => setItems(r.data.items)).catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(load, [load]);

  const cancel = async (b) => {
    const refundNote = b.status === "confirmed" && b.price > 0 ? ` You'll be refunded ${money(b.price)}.` : "";
    if (!window.confirm(`Cancel ${b.resource?.name} on ${dayOf(b.startTime)} at ${timeOf(b.startTime)}?${refundNote}`)) return;
    setError("");
    setNotice("");
    try {
      await api.patch(`/bookings/${b._id}/cancel`);
      if (refundNote) setNotice("Booking cancelled. Your refund is on its way.");
      load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const pay = async (b) => {
    setError("");
    setNotice("");
    try {
      const { data } = await api.get(`/bookings/${b._id}/checkout`);
      await payForBooking(data, user, `${b.resource?.name}, ${dayOf(b.startTime)}, ${timeOf(b.startTime)}`);
      setNotice("Payment received. Your booking is confirmed.");
    } catch (e) {
      if (!e.dismissed) setError(e.message && !e.response ? e.message : errorMessage(e));
    } finally {
      load();
    }
  };

  const now = new Date();
  const isUpcoming = (b) => (b.status === "confirmed" || b.status === "pending") && new Date(b.startTime) > now;
  const upcoming = items?.filter(isUpcoming).reverse() ?? [];
  const history = items?.filter((b) => !isUpcoming(b)) ?? [];

  return (
    <div className="wrap narrow">
      <h1>My bookings</h1>
      {notice && <p className="success" role="status">{notice}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {!items && <p className="muted">Loading…</p>}
      {items && items.length === 0 && (
        <p className="empty">You haven't booked anything yet. <Link to="/">Find a court</Link></p>
      )}
      {upcoming.length > 0 && (
        <>
          <h2>Upcoming</h2>
          <ul className="rows">{upcoming.map((b) => <Row key={b._id} b={b} onCancel={cancel} onPay={pay} />)}</ul>
        </>
      )}
      {history.length > 0 && (
        <>
          <h2>Past and cancelled</h2>
          <ul className="rows">{history.map((b) => <Row key={b._id} b={b} onCancel={cancel} onPay={pay} />)}</ul>
        </>
      )}
    </div>
  );
}
