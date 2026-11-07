# SlotBook

A MERN app for booking sports courts by the hour. Providers list courts and set opening hours, players pick a free slot and book it, and an admin approves providers and watches the numbers.

The main engineering point: **two people can never book the same slot**, even if their requests arrive in the same millisecond. A partial unique index in MongoDB enforces it, and a test fires 8 simultaneous requests at one slot and checks that exactly one wins.

## Features

- Register and log in as a player, provider or admin (role-based access)
- JWT auth: 15-minute access token (kept in memory) plus a 7-day refresh token in an httpOnly cookie, rotated on every refresh
- Providers create listings with opening hours, slot length and open days; slots are generated from those rules, never stored
- Search, sport filter and pagination on listings
- Slot board per date: open, booked or passed
- Book and cancel (cancelling is blocked inside the last 2 hours); a cancelled slot becomes bookable again
- Admin approval for new providers, and a stats page built from MongoDB aggregation pipelines
- Hourly cron job sends reminders for bookings starting within 24 hours (the mailer logs to the console; swap `utils/mailer.js` for a real provider)
- Input validation (zod), rate limiting on login and register, helmet, central error handling

## Stack

React 19 + Vite + React Router, Express 4, MongoDB + Mongoose, Jest + Supertest, Docker Compose.

## Run it

Needs Node 20+ and MongoDB (local, or a free Atlas cluster).

```bash
# 1. backend
cd backend
cp .env.example .env        # on Windows: copy .env.example .env
npm install
npm run seed                # demo accounts and six listings
npm run dev                 # http://localhost:5000

# 2. frontend (new terminal)
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

Demo logins created by the seed:

| Role | Email | Password |
|---|---|---|
| Admin | admin@slotbook.dev | Admin@123 |
| Provider | provider@slotbook.dev | Provider@123 |
| Player | user@slotbook.dev | User@12345 |

### With Docker

```bash
docker compose up --build   # app at http://localhost:3000
docker compose exec backend node seed.js
```

Change the two JWT secrets in `docker-compose.yml` before deploying anywhere real.

## Tests

```bash
cd backend
npm test
```

25 tests cover auth and cookies, role checks, slot generation, validation, the double-booking race, cancel rules, admin stats and the reminder job. The first run downloads an in-memory MongoDB. To use your own database instead, set `TEST_MONGO_URI`.

## API

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | /api/auth/register, /login | public | Create account, log in |
| POST | /api/auth/refresh, /logout | cookie | Rotate refresh token, log out |
| GET | /api/auth/me | any | Current user |
| GET | /api/resources | public | Search, filter, paginate |
| GET | /api/resources/:id, /:id/slots?date=YYYY-MM-DD | public | Detail and slot board |
| POST/PUT/DELETE | /api/resources | approved provider | Manage listings |
| GET | /api/resources/mine | provider | My listings |
| POST | /api/bookings | player | Book a slot |
| GET | /api/bookings/mine | player | My bookings |
| PATCH | /api/bookings/:id/cancel | player | Cancel |
| GET | /api/bookings/provider | provider | Bookings on my listings |
| GET | /api/admin/stats | admin | Totals, 7-day chart, top listings |
| GET/PATCH | /api/admin/providers/pending, /:id/approve | admin | Approve providers |

## Design decisions worth knowing

1. **Concurrency lives in the database.** Checking "is it free?" and then inserting is a race. Instead, `Booking` has a unique index on `(resource, startTime)` limited to `status: "confirmed"`; the loser gets a duplicate-key error that the API turns into `409`. The partial filter is what lets a cancelled slot be rebooked.
2. **Slots are computed, not stored.** Changing a listing's hours can't leave orphan rows. Only bookings are stored.
3. **Server validates the slot.** A client can't book 9:15 on a listing with hourly slots, or a closed day; the requested time must match a generated slot.
4. **Timezone.** Venue times use a fixed offset (`TZ_OFFSET`, default IST `+05:30`). A fixed offset can't handle daylight saving; for multi-timezone venues, store an IANA zone per listing and use a date library.
5. **Tokens.** The access token is never written to localStorage; the refresh cookie is httpOnly and scoped to `/api/auth`. The Vite dev server and nginx both proxy `/api`, so the browser sees one origin and no CORS setup is needed.
6. **Soft delete** for listings, so past bookings never point at a missing document.

## Known limits (good next steps)

- No payments yet (Razorpay test mode would slot into the booking flow)
- Reminders log to the console instead of sending email
- A person can book overlapping slots across different listings
- No edit-listing screen in the UI (the `PUT` endpoint exists)
- Rate limiting is per-process; use a shared store such as Redis when running multiple instances
