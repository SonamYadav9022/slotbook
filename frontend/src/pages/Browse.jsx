import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { errorMessage } from "../api.js";
import { CATEGORIES, money } from "../format.js";

export default function Browse() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setError("");
      api
        .get("/resources", { params: { q: q || undefined, category: category || undefined, page } })
        .then((res) => setData(res.data))
        .catch((err) => setError(errorMessage(err)));
    }, 250); // wait for the user to pause typing
    return () => clearTimeout(timer);
  }, [q, category, page]);

  return (
    <div className="wrap">
      <section className="intro">
        <h1>Book a court by the hour.</h1>
        <p className="muted">Pick a place, see which slots are free, and reserve one in a few taps.</p>
        <input
          className="search"
          type="search"
          placeholder="Search by name, area or city"
          aria-label="Search listings"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <div className="chips" role="group" aria-label="Filter by sport">
          {["", ...CATEGORIES].map((c) => (
            <button
              key={c || "all"}
              className={`chip ${category === c ? "on" : ""}`}
              aria-pressed={category === c}
              onClick={() => {
                setCategory(c);
                setPage(1);
              }}
            >
              {c || "all sports"}
            </button>
          ))}
        </div>
      </section>

      {error && <p className="error" role="alert">{error}</p>}
      {!data && !error && <p className="muted">Loading listings…</p>}

      {data && data.items.length === 0 && (
        <p className="empty">No listings match that search. Clear the filters or try another area.</p>
      )}

      {data && data.items.length > 0 && (
        <>
          <ul className="grid">
            {data.items.map((r) => (
              <li key={r._id}>
                <Link to={`/resources/${r._id}`} className="listing">
                  <span className="tag">{r.category}</span>
                  <h2>{r.name}</h2>
                  <p className="muted">{r.address}, {r.city}</p>
                  <p className="price">{money(r.pricePerSlot)} <span className="muted">per {r.slotMinutes} min</span></p>
                </Link>
              </li>
            ))}
          </ul>
          <div className="pager">
            <button className="btn ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <span className="muted">Page {data.page} of {data.pages}</span>
            <button className="btn ghost" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </>
      )}
    </div>
  );
}
