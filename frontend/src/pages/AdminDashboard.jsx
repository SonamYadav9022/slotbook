import { useCallback, useEffect, useState } from "react";
import api, { errorMessage } from "../api.js";
import { money } from "../format.js";

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [pending, setPending] = useState([]);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api.get("/admin/stats").then((r) => setStats(r.data)).catch((e) => setError(errorMessage(e)));
    api.get("/admin/providers/pending").then((r) => setPending(r.data.items)).catch(() => {});
  }, []);
  useEffect(load, [load]);

  const approve = async (id) => {
    await api.patch(`/admin/providers/${id}/approve`);
    load();
  };

  if (error) return <p className="error pad" role="alert">{error}</p>;
  if (!stats) return <p className="muted pad">Loading…</p>;

  const peak = Math.max(1, ...stats.bookingsPerDay.map((d) => d.count));

  return (
    <div className="wrap">
      <h1>Overview</h1>
      <dl className="figures">
        <div><dt>Confirmed bookings</dt><dd>{stats.bookings}</dd></div>
        <div><dt>Booked revenue</dt><dd>{money(stats.revenue)}</dd></div>
        <div><dt>Active listings</dt><dd>{stats.resources}</dd></div>
        <div><dt>Players</dt><dd>{stats.users}</dd></div>
        <div><dt>Approved providers</dt><dd>{stats.providers}</dd></div>
      </dl>

      <div className="two">
        <section>
          <h2>Bookings made, last 7 days</h2>
          {stats.bookingsPerDay.length === 0 && <p className="empty">No bookings in the last week.</p>}
          <ul className="bars">
            {stats.bookingsPerDay.map((d) => (
              <li key={d.date}>
                <span className="muted">{d.date.slice(5)}</span>
                <span className="bar" style={{ width: `${(d.count / peak) * 100}%` }} />
                <span>{d.count}</span>
              </li>
            ))}
          </ul>

          <h2>Most booked</h2>
          {stats.topResources.length === 0 && <p className="empty">Nothing booked yet.</p>}
          <ul className="rows">
            {stats.topResources.map((r) => (
              <li className="row" key={r.resourceId}>
                <strong>{r.name}</strong>
                <span>{r.bookings} bookings, {money(r.revenue)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2>Providers waiting for approval</h2>
          {pending.length === 0 && <p className="empty">No one is waiting.</p>}
          <ul className="rows">
            {pending.map((p) => (
              <li className="row" key={p._id}>
                <div><strong>{p.name}</strong><p className="muted">{p.email}</p></div>
                <button className="btn primary small" onClick={() => approve(p._id)}>Approve</button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
