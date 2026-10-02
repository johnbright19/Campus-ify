# Campus-ify — Xavier's Institute of Engineering

Campus resource booking and conflict resolution for **Xavier's Institute of Engineering (XIE)**. A student
requests a space; the system checks availability, scores the request transparently, and — when two people
want the same slot — ranks them and offers the loser real alternatives instead of a flat "denied".

The repository holds two deployables:

| Path | What it is |
| --- | --- |
| `client/` | The React app — every screen, the calendar, the concierge |
| `B2B_Resource/server/` | Express API, Supabase access, background workers |
| `B2B_Resource/supabase/migrations/` | Postgres schema (the source of truth) |

---

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- A Supabase project with `supabase/migrations/001_init.sql` applied

## 1. Backend

```bash
cd B2B_Resource/server
npm install
cp .env.example .env      # then fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
npm run dev               # http://localhost:4000
```

Check it came up:

```bash
curl http://localhost:4000/health
```

`PORT` is read from `.env`, but a shell that already exports `PORT=0` wins over it — the server treats
`0`/junk as unset and falls back to **4000**, which is what the Vite proxy expects.

### Database

Apply the migration once (Supabase dashboard → SQL editor, or `psql`):

```bash
psql "$SUPABASE_DB_URL" -f B2B_Resource/supabase/migrations/001_init.sql
```

Then create the demo people and spaces, and fill the calendar:

```bash
cd B2B_Resource/server
npm run seed                        # 15 demo profiles + 14 resources
node scripts/seed-week.mjs          # ~680 bookings across ±1 week
node scripts/check-db.mjs           # optional: prints table row counts
```

`seed-week.mjs` is idempotent — it deletes its own rows (tagged `[demo-week]` in `purpose`) before
re-seeding, and it respects the schema's core guarantee: two **approved** bookings can never overlap on the
same resource. Pending requests are exempt, which is exactly how a contested slot is meant to look.

## 2. Frontend

```bash
cd client
npm install
npm run dev                         # http://localhost:5173
```

`client/vite.config.js` proxies `/api` → `http://localhost:4000`, so both processes must be running.

## Signing in

There is no OAuth provider wired up, so sign-in uses the backend's demo bearer tokens. Each demo account
maps by email to its real row in `profiles`. Choose an identity on `/login`; the session is linked to
that exact database profile rather than a generic role account. The selector includes:

| Demo identity | Role / department |
| --- | --- |
| General Secretary · IEEE, General Secretary · Student Council | Student committees |
| President · XIE-CSI, President · TEDx-XIE | Student committees |
| General Secretary · Women Development Cell, General Secretary · Alumni Cell | Student committees |
| Dr. Sarah Faculty, Support Staff / Lab Assistant | Faculty |
| Prof. Ramesh HOD | HOD · Computer Science |
| Prof. IT HOD | HOD · IT |
| Prof. EXTC HOD | HOD · EXTC |
| Prof. CSE HOD | HOD · CSE |
| Dr. Lata Ragha | Principal / Administrator |
| Sports & Facilities Admin, Campus Office | Administrator |

Sign-in waits for identity and the resource directory, then navigates while bookings, waitlist entries,
and notifications synchronize in the background. This keeps login responsive without making booking
actions local-only. If the API is unreachable the app stays in offline demo mode; those local changes
are not written to Supabase.

## Booking lifecycle

1. Start both the API and client, open `http://localhost:5173/login`, and choose the account that will
  make the request. For an end-to-end database test, keep the API connected to Supabase.
2. Open **New booking**, select a resource and time, complete the title and attendee count, then confirm.
  The browser sends `POST /api/bookings`; the API checks facility policy, capacity and conflicts,
  calculates priority, then inserts the row into `public.bookings`. Postgres' exclusion constraint is
  the final guard against overlapping approved bookings.
3. The returned database row is added to the client immediately. The `/my-bookings` endpoint refreshes
  the signed-in user's complete booking list, including dates outside the calendar's short polling
  window. Pending requests appear under **Awaiting approval**; approved future requests appear under
  **Upcoming**.
4. A HOD sees pending requests only for their department's resources or requesters. HOD approval and
  rejection are department-checked again by the API. The Principal/admin can review all departments.
5. A request that cannot take its slot can join the waitlist. The row is saved in `public.waitlist` and
  refreshed into the **Waitlist** section. When an offer is promoted, the requester can accept it from
  their waitlist view.
6. The notification bell shows only a newly approved/accepted/confirmed booking. A pending request,
  rejection, cancellation, reminder, or waitlist update does not appear there.

### Verify the database write

After confirming a booking, run this in the Supabase SQL editor (or `psql`) to see the newest rows,
their owner, resource, status, and time:

```sql
select
  p.full_name,
  p.email,
  r.name as resource,
  b.title,
  b.status,
  b.start_time,
  b.end_time,
  b.created_at
from public.bookings b
join public.profiles p on p.id = b.user_id
join public.resources r on r.id = b.resource_id
order by b.created_at desc
limit 25;
```

`GET /api/bookings/mine` returns the same signed-in user's rows to the client. If no new row is present
in Supabase, confirm that the server is running with the correct `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`, that the migration was applied, and that the app status reads
**live · server** rather than **demo data**.

## How live updates work

Supabase Realtime is enabled on `bookings`, but the browser cannot subscribe to it with these demo
bearer tokens — they are not Supabase session JWTs, and the anon key is not used anywhere in this build.
So the client **polls**: every 5s it re-reads a narrow booking window (today −1 … today +2) and checks
accepted-booking notifications; it does a full sync (−7 … +14) on focus. Anything new or
status-changed pulses the affected space on the calendar.

## The calendar

`client/src/features/calendar/CampusGrid.jsx` is a space-lane timetable, not a stock week grid: **one row
per space, time running left to right**. Every booking gets its own readable block, and only genuinely
contested slots (two pending requests on the same space) share horizontal room. The week view lists each
space-day's bookings as chips — nothing hides behind a "+3 more".

## API surface

| Method | Route | Notes |
| --- | --- | --- |
| `GET` | `/health` | no auth |
| `GET` | `/api/me` | current profile from the bearer token |
| `GET` | `/api/resources` | optional `?type=&capacity=` |
| `GET` | `/api/resources/:id/availability` | `?start=&end=` → conflicts + alternatives |
| `GET` | `/api/profiles` | directory |
| `GET` | `/api/bookings/calendar` | `?from=&to=&resourceId=&status=` (overlap semantics) |
| `GET` | `/api/bookings/mine` | all bookings owned by the current profile |
| `POST` | `/api/bookings` | policy → conflict → priority → exclusion constraint |
| `POST` | `/api/bookings/:id/cancel` | promotes the waitlist |
| `PATCH` | `/api/bookings/:id/approve` · `/reject` | faculty / hod / admin |
| `GET` | `/api/notifications` | own notifications |
| `GET` | `/api/admin/kpis` · `/utilization` · `/approvals` · `/audit` | admin console |

## Environment

`B2B_Resource/server/.env` (see `.env.example`):

| Variable | Purpose |
| --- | --- |
| `PORT` | API port, defaults to 4000 |
| `CLIENT_ORIGIN` | CORS origin |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | **required** — the database |
| `ALLOWED_EMAIL_DOMAIN` | optional domain lock |
| `GROQ_API_KEY`, `GROQ_MODEL`, `LLM_DISABLED` | optional LLM; fallbacks always work |
| `QR_SECRET`, `NO_SHOW_GRACE_MIN`, `OFFER_WINDOW_MIN` | check-in and waitlist rules |

Never commit `.env` — it is git-ignored.

## Technologies

- **Frontend** — React 18, Vite, Tailwind CSS, TanStack Query, GSAP, Lucide, date-fns
- **Backend** — Node.js, Express, Zod, node-cron, @supabase/supabase-js
- **Database** — Postgres via Supabase (RLS, exclusion constraints, Realtime publication)

## Known gaps

- The waitlist page, the concierge and the client-side automation workers still run the in-browser
  engine. The API has the endpoints (`POST /api/bookings/waitlist`, `admin/run-job/:name`); they are not
  wired into those screens yet.
- Sign-in uses demo tokens rather than real Supabase Auth, so Realtime is unavailable (see above).

## License

MIT