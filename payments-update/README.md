# SlotBook

A MERN app for booking sports courts by the hour. Providers list courts and set opening hours, players pick a free slot and book it, and an admin approves providers and watches the numbers.

The main engineering point: **two people can never book the same slot**, even if their requests arrive in the same millisecond. A partial unique index in MongoDB enforces it, and a test fires 8 simultaneous requests at one slot and checks that exactly one wins.

## Features

- Register and log in as a player, provider or admin (role-based access)
- JWT auth: 15-minute access token (kept in memory) plus a 7-day refresh token in an httpOnly cookie, rotated on every refresh
- Providers create listings with opening hours, slot length and open days; slots are generated from those rules, never stored
- Search, sport filter and pagination on listings
- Slot board per date: open, booked or passed
- **Online payments with Razorpay (test mode):** picking a slot holds it for 10 minutes while the player pays; only a verified payment confirms it
- Cancel with an automatic refund (blocked inside the last 2 hours); a cancelled slot becomes bookable again
- Unpaid holds expire and release their slot automatically
- Admin approval for new providers, and a stats page built from MongoDB aggregation pipelines
- Hourly cron job sends reminders for bookings starting within 24 hours (the mailer logs to the console; swap `utils/mailer.js` for a real provider)
- Input validation (zod), rate limiting on login and register, helmet, central error handling

## Stack

React 19 + Vite + React Router, Express 4, MongoDB + Mongoose, Razorpay, Jest + Supertest, Docker Compose.

## Payments (Razorpay test mode)

No real money moves in test mode.

1. Create a free account at razorpay.com and switch the dashboard to **Test Mode**.
2. Go to **Settings → API Keys → Generate Test Key**. Copy the Key Id and Key Secret.
3. Add them to `backend/.env` (and to your hosting provider's environment variables):
   ```
   RAZORPAY_KEY_ID=rzp_test_xxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxx
   ```
4. Pay with Razorpay's test credentials: card `4111 1111 1111 1111` with any future expiry and any CVV, or UPI id `success@razorpay`. The test checkout lets you choose success or failure.
5. Optional but recommended once deployed: **Settings → Webhooks → Add**, URL `https://YOUR-BACKEND/api/payments/webhook`, pick the `payment.captured` event, and put the secret you chose in `RAZORPAY_WEBHOOK_SECRET`. It confirms bookings even if the player closes the tab right after paying.

Without keys the app still runs. Free listings (price 0) confirm instantly, and paid ones answer "payments aren't set up yet".

### How a booking works

1. **Hold.** The player picks a slot; the server creates a `pending` booking (the unique index gives the slot to exactly one person) plus a Razorpay order, and returns the order to the browser.
2. **Pay.** The browser opens Razorpay Checkout.
3. **Verify.** The browser sends the payment id and signature to `/api/bookings/:id/verify`. The server recomputes the HMAC with the key secret; only a valid signature marks the booking `confirmed`. The webhook can do the same server-to-server, and both paths are idempotent.
4. **Expire.** A cron job (and a lazy check on every read) releases holds that weren't paid in 10 minutes.
5. **Late payment.** If money arrives after a hold expired, the server tries to re-take the slot; if someone else booked it meanwhile, it refunds automatically.
6. **Cancel.** Confirmed bookings are refunded through Razorpay first; if the refund fails, the booking stays confirmed.

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

44 tests cover auth and cookies, role checks, slot generation, validation, the double-booking race, the payment flow (forged signatures, expiry, late payments, refunds, webhook) and the reminder job. Razorpay's API is stubbed, so no keys are needed to run them. The first run downloads an in-memory MongoDB. To use your own database instead, set `TEST_MONGO_URI`.

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
| POST | /api/bookings | player | Hold a slot and start a payment |
| GET | /api/bookings/:id/checkout | player | Reopen payment for a held booking |
| POST | /api/bookings/:id/verify | player | Verify the payment signature and confirm |
| POST | /api/payments/webhook | Razorpay | Server-to-server payment confirmation |
| GET | /api/bookings/mine | player | My bookings |
| PATCH | /api/bookings/:id/cancel | player | Cancel (refunds paid bookings) |
| GET | /api/bookings/provider | provider | Bookings on my listings |
| GET | /api/admin/stats | admin | Totals, 7-day chart, top listings |
| GET/PATCH | /api/admin/providers/pending, /:id/approve | admin | Approve providers |

## Design decisions worth knowing

1. **Concurrency lives in the database.** Checking "is it free?" and then inserting is a race. Instead, `Booking` has a unique index on `(resource, startTime)` limited to `holdsSlot: true`; the loser gets a duplicate-key error that the API turns into `409`. Pending and confirmed bookings both hold the slot, so nobody can grab it while someone is paying; cancelled and expired ones release it.
2. **Slots are computed, not stored.** Changing a listing's hours can't leave orphan rows. Only bookings are stored.
3. **Server validates the slot.** A client can't book 9:15 on a listing with hourly slots, or a closed day; the requested time must match a generated slot.
4. **Timezone.** Venue times use a fixed offset (`TZ_OFFSET`, default IST `+05:30`). A fixed offset can't handle daylight saving; for multi-timezone venues, store an IANA zone per listing and use a date library.
5. **Tokens.** The access token is never written to localStorage; the refresh cookie is httpOnly and scoped to `/api/auth`. The Vite dev server and nginx both proxy `/api`, so the browser sees one origin and no CORS setup is needed.
6. **Soft delete** for listings, so past bookings never point at a missing document.

## Known limits (good next steps)

- Payments run in Razorpay test mode; going live needs KYC and live keys
- Refunds are always full; there is no partial-refund policy
- Reminders log to the console instead of sending email
- A person can book overlapping slots across different listings
- No edit-listing screen in the UI (the `PUT` endpoint exists)
- Rate limiting is per-process; use a shared store such as Redis when running multiple instances
