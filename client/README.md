# Campus-ify · Frontend

**Xavier's Institute of Engineering** — campus resource booking and conflict resolution.
This is the client described in [`Plan.md`](../Plan.md), [`Architecture.md`](../Architecture.md),
[`Skills.md`](../Skills.md), [`Agent.md`](../Agent.md) and [`Build.md`](../Build.md).

> **Runs two ways.** With the API in `../B2B_Resource/server` reachable, sign-in links the
> session to a real Postgres profile and resources, profiles, bookings and notifications are
> mirrored from the database — a booking made anywhere shows up on the grid within seconds.
> With the API down, every engine (conflict detection, priority scoring, alternatives,
> waitlist promotion, workers, the AI layer) still runs in the browser, so the product is
> fully demoable offline. Same screens either way.

---

## 1. Run it

```bash
cd client
npm install
npm run dev          # http://localhost:5173
```

Other scripts:

```bash
npm run build        # production bundle → dist/
npm run preview      # serve the built bundle on :4173
```

Stack: **React 18 · Vite 5 · Tailwind CSS v4 · GSAP · Recharts ·
React Query · React Router**. No state library, no component kit — the design system lives
in [`src/index.css`](src/index.css).

The calendar is hand-built ([`src/features/calendar/CampusGrid.jsx`](src/features/calendar/CampusGrid.jsx))
rather than a FullCalendar week grid — see §4.

---

## 2. Two modes, one data flow

Components never touch storage directly — they call services and read `useDb()`. That indirection is
what makes the client work against a real API **and** offline without a component changing:

| Production piece | With the API up | API down |
|---|---|---|
| Supabase Postgres | [`src/lib/api.js`](src/lib/api.js) + [`src/lib/sync.js`](src/lib/sync.js) mirror resources, profiles, bookings and notifications into the store | [`src/lib/store.js`](src/lib/store.js) — a versioned snapshot in `localStorage`, seeded by [`src/lib/seed.js`](src/lib/seed.js) |
| Session | [`src/app/AuthProvider.jsx`](src/app/AuthProvider.jsx) calls `GET /api/me` and re-points the session at the database profile, so `bookings.user_id` matches "my bookings" | [`src/services/auth.js`](src/services/auth.js) — emulated handshake, same session shape |
| Realtime | Poll `GET /api/bookings/calendar` every 5s (narrow window), full re-sync on focus | The store's change bus + `fireEvent` pulses (`onEvent`) |
| `POST /api/bookings` | [`createBookingRemote()`](src/services/bookings.js) — the server runs policy → conflict → priority, and the Postgres exclusion constraint is the final arbiter | `createBooking()` — identical validation order and error codes |
| Cancel / approve / reject | `cancelBookingRemote()`, `approveBookingRemote()`, `rejectBookingRemote()` | `cancelBooking()`, `approveBooking()`, `rejectBooking()` |
| Google OAuth | Profile-specific demo bearer token, matched by profile email | Same identities, resolved locally |

The header badge reads **live · server** or **demo data** so it is always obvious which mode answered.
`GET /api/bookings/calendar` returns snake_case rows; every row is mapped to the camelCase shape at the
boundary in [`src/lib/api.js`](src/lib/api.js), so nothing downstream knows Postgres exists.

**Why polling and not Supabase Realtime:** the `bookings` table *is* in the `supabase_realtime`
publication, but subscribing from the browser requires a real Supabase session JWT. The demo bearer
tokens are not Supabase sessions, and the anon key is not used in this build. Polling is the transport
that actually works today; swapping to Realtime means replacing `startLiveSync()` in
[`src/lib/sync.js`](src/lib/sync.js) and nothing else.

---

## 3. The calendar

`CampusGrid` is a space-lane timetable: **one row per space, time running left to right**. Each booking
is an absolutely positioned block with its own time range and title.

The earlier stock week grid put every space in the same day column, so a busy campus squeezed ~30
bookings into ~5px slivers with clipped labels. An intermediate version bundled overlapping events into
one "N overlapping" block, which hid rows behind a summary. Rows instead of columns fixes the root
cause: same-space overlaps are impossible by construction, and only genuinely contested slots (two
pending requests on one space) share horizontal room.

- **Day · by space** — the default; click empty track to prefill the booking form, click a block for detail
- **Week** — rows are still spaces, each space-day cell lists its bookings as chips, so nothing hides
  behind a "+3 more"
- Colour by space type or by status; filter by space and by type; a **Sync** button forces a re-read

---

## 4. Sign in (demo accounts)

Pick an account on `/login` — the sidebar, navigation, approvals queue and operations room all
re-render for that role. With the API running, the selected profile email maps to the matching row in
`profiles`, so bookings are attributed to the right database user and “my bookings” resolves correctly.
The root [`README.md`](../README.md) is the complete setup and end-to-end process guide, including
database verification.

| Account | Role / department |
|---|---|
| General Secretary · IEEE / Student Council | Student committee |
| President · XIE-CSI / TEDx-XIE | Student committee |
| General Secretary · Women Development Cell / Alumni Cell | Student committee |
| Prof. Ramesh HOD | HOD · Computer Science |
| Prof. IT HOD | HOD · IT |
| Prof. EXTC HOD | HOD · EXTC |
| Prof. CSE HOD | HOD · CSE |
| Dr. Lata Ragha | Principal / Administrator |
| Dr. Sarah Faculty / Support Staff | Faculty |
| Sports & Facilities Admin / Campus Office | Administrator |

Offline the bundled seed includes the same named identities, 10 resources, a guaranteed clash, a
pending request, a close-call pair 5 points apart, a waitlist queue, a booking about to lapse,
and three weeks of history for the heatmap. Against the API, `scripts/seed-week.mjs` in the
server fills ~680 bookings across ±1 week for a genuinely busy calendar.

---

## 5. The five-minute demo (`Plan.md` §7), replayed in this build

| Beat | Where | What to say |
|---|---|---|
| Hook | `/` | Spreadsheets and WhatsApp threads vs. a system that resolves conflicts |
| Sign in + live calendar | `/login` → `/calendar` | Cards stagger in; open a second tab and book something — the affected space pulses |
| AI booking | Chat dock (bottom-right) | *“Need a hall for 80 people tomorrow 2 to 4 with a projector”* → parsed intent → ranked options → draft **with its score** → you confirm |
| Conflict | `/book` | Request `Seminar Hall A · tomorrow 14:00` → the form shakes, the panel ranks six alternatives, one click rebooks |
| Fair resolution | `/mediator` | The 5-point-gap pair: side-by-side, score bars, an explanation that adds no new facts, four ranked paths |
| Automation | `/admin` | Advance the **campus clock** by 2 h → the no-show sweep releases the lapsed booking and promotes the waitlist, live in the log |
| Insights | `/admin` | Heatmap, forecast, and a digest whose every number comes from the aggregates beside it |
| Close | `/admin` | “Not just booking — fair, explainable, automated conflict resolution.” |

**Demo-safety switch:** Settings → *Force deterministic fallbacks (LLM_DISABLED)* is on by
default. The product is exactly as capable with it on, which is the dry run the docs ask
for.

---

## 6. Architecture → code

```
src/
  lib/
    store.js        in-browser database, clock, realtime bus, atomic produce()
    seed.js         deterministic demo dataset (seeded PRNG, relative to today)
    utils.js        timezone-exact helpers, formatters, overlap math
    query.js        useDb / useLiveQuery / useNow — React bindings
    api.js          fetch wrapper + snake_case → camelCase row mappers
    sync.js         server ⇄ store mirroring, polling, live-sync lifecycle
    gsap.js         purposeful motion: stagger, shake, count-up, row reveal
    constants.js    enums, weights, labels, navigation matrix
  services/
    conflicts.js    S1 detect_conflicts          (hard / soft / blackout)
    priority.js     S2 score_priority            (pure, with breakdown + notes)
    suggestions.js  S3 suggest_alternatives · S16 suggest_best_time
    waitlist.js     S10 promote · expire · join · withdraw
    bookings.js     create/cancel/approve/reject/check-in + all sweeps (S11), and the
                   *Remote twins that go through the API when a session is linked
    ai.js           S4–S9, S12–S14 fallbacks + A1 concierge + A4 Q&A
    analytics.js    Build.md §13 aggregates: utilisation, heatmap, forecast, KPIs
    workers.js      A5 ops automator (7 jobs + the live campus simulation)
    notifications.js N5 rows, audit trail, AI-run log, atomic commit()
    auth.js · settings.js · analytics.js
  app/             providers, auth context, route guards, shell, command palette
  components/      ui primitives (Card, Modal, StatCard, …) + shared pieces
  features/        landing · auth · dashboard · resources · calendar · booking ·
                   bookings · waitlist · approvals (+ mediator) · assistant ·
                   admin (operations, heatmap, digest, automation, audit, settings) ·
                   notifications · profile
```

**Skill coverage** — S1 `detect_conflicts`, S2 `score_priority`, S3
`suggest_alternatives`, S4 `parse_booking_request`, S5 `classify_event_purpose`, S6
`explain_conflict`, S7 `recommend_resolution`, S8 `summarize_request_for_approver`, S9
`draft_notification`, S10 `promote_waitlist`, S11 `release_no_shows`, S12
`forecast_demand`, S13 `generate_insights_digest`, S14 `detect_hoarding`, S15
`issue_and_verify_qr`, S16 `suggest_best_time`.

**Agent coverage** — A1 Booking Concierge (chat dock), A2 Conflict Mediator (close-call
card + auto-bump with alternatives), A3 Approval Copilot (briefs, risk flags, batch
approve, verify toggle), A4 Utilisation Analyst (digest + fixed-tool Q&A), A5 Ops
Automator (switchable, loggable jobs).

---

## 7. What makes the UI advanced

- **Command palette** (`⌘K` / `Ctrl+K`) — navigate every console, run a no-show sweep, fire
  all jobs, fast-forward the demo clock, reseed the data.
- **Demo time-warp** — the campus clock in the sidebar drives countdowns, offer expiry and
  the no-show sweep, so automation is *observable* instead of theoretical.
- **Live campus simulation** — other people book while you watch, and the affected space's
  events pulse on the calendar.
- **Transparent priority breakdown everywhere** — signed factor bars, plain-language notes
  (“the declared event type carried the most weight”), and an explicit `+60` cap notice on
  unverified exam/placement claims.
- **Role-aware everything** — different dashboard, queues and consoles per role, with
  server-style route guards and a clear “no access” state rather than a blank page.
- **Honest AI UX** — the concierge labels itself as the deterministic fallback engine, logs
  every skill call to the AI activity table, and never hides which path answered.
- **Timezone correctness** — instants are stored UTC and rendered in `Asia/Kolkata` via
  `Intl`; the `[)` overlap rule means 14:00-end and 14:00-start do not collide.
- **Accessibility & restraint** — visible focus rings, semantic tables, ARIA labels,
  keyboard-driven palette, and every GSAP helper is a no-op under
  `prefers-reduced-motion`.

---

## 8. Going to production

1. Point `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_API_URL` at real services
   (see [`.env.example`](.env.example)).
2. Replace the demo bearer tokens in [`src/app/AuthProvider.jsx`](src/app/AuthProvider.jsx) with
   `supabase.auth.signInWithOAuth`; the session shape the UI consumes does not change.
3. With a real Supabase session JWT available, swap `startLiveSync()` in
   [`src/lib/sync.js`](src/lib/sync.js) for a `postgres_changes` subscription on `bookings`
   and drop the 5s poll.
4. Move the remaining local engines (waitlist, concierge, workers) onto their API endpoints —
   `src/lib/api.js` already exposes the route helpers.
5. Replace `runSkill()` in [`src/services/ai.js`](src/services/ai.js) with the Anthropic
   call plus the existing schema; keep the fallback functions as they are.
6. Delete `localStorage` persistence from `store.js` and read through React Query instead.

No component needs to change.
