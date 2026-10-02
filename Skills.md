# Skills.md — Skill Catalog

A **skill** is a single-purpose, testable function with a strict input/output contract. Agents (see `Agent.md`) combine skills. Skills are either **deterministic** (plain code), **LLM** (language model call with schema-validated output), or **hybrid**.

All skills live in `server/src/ai/skills/` (LLM/hybrid) or `server/src/services/` (deterministic).

**Conventions**
- Every LLM skill: Zod schema for output, 6-second timeout, one retry, a **fallback**, and a row in `ai_runs`.
- Skills never write to the DB unless explicitly marked ✍️. Writing skills run only through services that enforce rules.
- Prompts treat user text (titles, purposes) as **data**, never as instructions.

---

## Skill Index

| # | Skill | Type | Writes? | Used by |
|---|---|---|---|---|
| S1 | `detect_conflicts` | Deterministic | No | Concierge, Mediator, API |
| S2 | `score_priority` | Deterministic | No | Mediator, API |
| S3 | `suggest_alternatives` | Deterministic | No | Concierge, Mediator |
| S4 | `parse_booking_request` | LLM + fallback | No | Concierge |
| S5 | `classify_event_purpose` | LLM + fallback | No | API, Approval Copilot |
| S6 | `explain_conflict` | LLM + template fallback | No | Mediator |
| S7 | `recommend_resolution` | Hybrid | No | Mediator, Approval Copilot |
| S8 | `summarize_request_for_approver` | LLM + template fallback | No | Approval Copilot |
| S9 | `draft_notification` | LLM + template fallback | No | All agents, workers |
| S10 | `promote_waitlist` | Deterministic | ✍️ | Ops workers |
| S11 | `release_no_shows` | Deterministic | ✍️ | Ops workers |
| S12 | `forecast_demand` | Statistical + LLM narrative | No | Utilization Analyst |
| S13 | `generate_insights_digest` | LLM + template fallback | No | Utilization Analyst |
| S14 | `detect_hoarding` | Rules + LLM note | No | Ops, Analyst |
| S15 | `issue_and_verify_qr` | Deterministic | ✍️ | API, Check-in |
| S16 | `suggest_best_time` | Statistical | No | Concierge, UI |

---

## S1 — `detect_conflicts`

**Purpose:** Find bookings that overlap a requested resource and time range.

**Input**
```json
{ "resourceIds": ["uuid"], "start": "ISO", "end": "ISO", "excludeBookingId": "uuid|null" }
```
**Output**
```json
{ "hard": [Booking], "soft": [Booking], "blackout": Blackout|null }
```
**Logic:** `existing.start < new.end AND existing.end > new.start`. `hard` = overlaps an `approved` booking. `soft` = overlaps a `pending` booking. Also checks `blackouts`.
**Edge cases:** back-to-back (end == start is OK), midnight spanning, inactive resource.
**Test:** 12 unit tests covering touching, nested, partial, identical, and cross-midnight ranges.

---

## S2 — `score_priority`

**Purpose:** Produce a transparent priority score with a per-factor breakdown.

**Input:** `{ user, eventType, resource, start, createdAt, history }`
**Output**
```json
{
  "score": 87,
  "breakdown": {
    "eventType": 80, "role": 20, "fairness": 9,
    "advanceNotice": 6, "noShowPenalty": -10, "verifiedBonus": 0
  }
}
```

| Factor | Rule |
|---|---|
| `eventType` | exam 100 · placement 90 · academic 80 · fest 60 · club 40 · personal 20 |
| `role` | admin 30 · hod 25 · faculty 20 · student 10 |
| `fairness` | 0–15 bonus for clubs/departments with fewer approved hours this month |
| `advanceNotice` | +1 per day booked in advance, cap 10 |
| `noShowPenalty` | −5 per no-show in the last 60 days |
| `verifiedBonus` | high-priority event types count fully only if approver-verified |

Weights live in a `priority_config` object (editable in admin settings). **Every decision can show its breakdown to users.**

---

## S3 — `suggest_alternatives`

**Purpose:** Turn a failed request into ranked options.

**Input:** original request (resource, start, end, capacity, features) and constraints (`maxDaysAhead`, `maxDistance`)
**Output:** up to 5 items:
```json
{ "type": "other_time|other_resource", "resourceId": "...", "start": "...", "end": "...",
  "matchScore": 0.92, "reasons": ["same time", "capacity 120", "projector ✔"] }
```
**Logic**
1. **Same resource, other times:** compute free windows ≥ duration on the same day (±3 h) and the next 2 days.
2. **Similar resources, same time:** filter by `capacity ≥ attendees`, required features, free at that time.
3. **Score:** `0.5·timeCloseness + 0.3·locationCloseness + 0.2·featureMatch`. Sort descending.

---

## S4 — `parse_booking_request` (LLM)

**Purpose:** Convert natural language into structured booking intent.

**Input:** `{ text, now, timezone: "Asia/Kolkata", user }`
**Output (Zod)**
```json
{
  "resourceType": "seminar_hall|lab|classroom|auditorium|ground|equipment|null",
  "attendees": 80,
  "date": "2026-10-03",
  "startTime": "14:00",
  "endTime": "16:00",
  "features": ["projector"],
  "title": "string|null",
  "purpose": "string|null",
  "missing": ["title"],
  "confidence": 0.9
}
```
**Prompt rules:** resolve relative dates against `now`; never invent a resource ID; list unknown fields in `missing`; return JSON only.
**Fallback:** `chrono-node` for date/time + regex for capacity and feature keywords.
**Test cases:** "tomorrow 2 to 4", "next Friday evening", "for 80 people with mic", ambiguous "after lunch".

---

## S5 — `classify_event_purpose` (LLM)

**Purpose:** Suggest an `eventType` and detect vague or suspicious purposes.

**Input:** `{ title, purpose, userRole }` (quoted as data)
**Output:** `{ eventType, confidence, flags: ["vague","mismatch_with_role"], reasoning }`
**Rule:** The output is a **suggestion**. High-priority types (`exam`, `placement`) only gain full weight after approver verification, so typing "exam" does not jump the queue.
**Fallback:** keyword map.

---

## S6 — `explain_conflict` (LLM)

**Purpose:** Human-friendly explanation of why a clash was resolved a certain way.

**Input:** both requests, scores + breakdowns, the decision
**Output:** `{ forRequester, forOther, tone: "neutral" }` — 2–3 sentences each, referencing only the facts provided.
**Guard:** The prompt forbids adding facts not in the input. Numbers in the output are checked against the input breakdown.
**Fallback:** template — *"Your request was not approved because [factor] gave the other request higher priority (X vs Y)."*

---

## S7 — `recommend_resolution` (Hybrid)

**Purpose:** For close-score clashes, recommend a path.

**Logic:** deterministic options are generated first (A wins, B wins, A moves to alternative, B moves, split time). The LLM ranks them with reasoning and flags impacts (e.g., "B has 200 attendees, A has 15").
**Output:** `{ options: [{ id, description, impact, recommended }], rationale }`
**Rule:** The admin always makes the final call when the gap is within margin.

---

## S8 — `summarize_request_for_approver` (LLM)

**Purpose:** Give approvers a 3-line brief so they can decide in seconds.

**Output:**
```json
{ "summary": "...", "riskFlags": ["conflicts with pending request", "requester has 2 recent no-shows"],
  "suggestedAction": "approve|reject|ask_changes", "reason": "..." }
```
**Fallback:** deterministic brief from fields and flags.

---

## S9 — `draft_notification` (LLM)

**Purpose:** Clear, polite messages for events: approved, rejected, bumped, waitlist offer, reminder, release warning.

**Input:** `{ event, recipient, facts, channel: "in_app|email" }`
**Output:** `{ title, body, ctaLabel, ctaLink }`
**Rule:** Facts only. Under 60 words for in-app.
**Fallback:** per-event templates.

---

## S10 — `promote_waitlist` ✍️

**Purpose:** Fill a freed slot from the waitlist.

**Steps:** select waiting entries that fit the freed range → order by `score desc, created_at asc` → re-run `detect_conflicts` → create offer with `offer_expires_at` → `draft_notification` → emit Realtime event.
**Idempotent:** safe if a job runs twice.

---

## S11 — `release_no_shows` ✍️

**Purpose:** Free unused bookings.

**Rule:** `status = approved AND start_time + grace < now AND checked_in_at IS NULL` → set `no_show`, increment `no_show_count`, write `audit_logs`, call `promote_waitlist`.
**Config:** `NO_SHOW_GRACE_MIN` (default 15). Resources can override.

---

## S12 — `forecast_demand`

**Purpose:** Predict busy periods.

**Method:** per resource and weekday/hour, take the 8-week average of booked hours (SQL aggregate) plus a trend factor. Output a 7-day forecast. The LLM adds only a plain-language narrative, never numbers it computes itself.
**Output:** `{ resourceId, forecast: [{ date, hour, expectedUtilization }], narrative }`

---

## S13 — `generate_insights_digest`

**Purpose:** Daily/weekly admin report.

**Input:** aggregates (utilization %, no-show rate, top conflict hotspots, avg approval time, idle resources)
**Output:** markdown with 3–5 insights and 2 recommended actions (e.g., "Seminar Hall A is 94% booked on weekdays 10–4. Consider shifting club meetings to Lab 3.")
**Rule:** Every number in the output must exist in the input aggregates (validated).

---

## S14 — `detect_hoarding`

**Purpose:** Spot slot-hoarding or abuse.

**Rules:** user holds > N future pending/approved hours; cancel rate > 40% in 30 days; repeated bookings of the same prime slots; bookings created within seconds of each other.
**Output:** `{ userId, flags, severity }` plus an optional LLM-written note for the admin.
**Action:** flag only — a human decides on penalties.

---

## S15 — `issue_and_verify_qr` ✍️

**Purpose:** Secure check-in.

**Issue:** token = `bookingId.expiry.HMAC(bookingId.expiry, QR_SECRET)`.
**Verify:** signature valid, not expired, window `start−10 min … start+grace`, booking is `approved`. Sets `checked_in_at`.

---

## S16 — `suggest_best_time`

**Purpose:** "When is this resource least contested?"

**Method:** from the forecast, rank the next 7 days' free windows by lowest expected demand that fit the duration. Shown in the booking form as a "Recommended times" chip row.

---

## Testing & Evaluation

| Skill type | How to test |
|---|---|
| Deterministic (S1, S2, S3, S10, S11, S15) | Jest unit tests with fixed fixtures |
| LLM (S4–S9, S13) | A small **golden set** of 10–20 inputs with expected JSON fields; check schema validity + key fields, not exact wording |
| Fallbacks | Force LLM failure (`LLM_DISABLED=true`) and run the same inputs |

**Demo-safety checklist:** set `LLM_DISABLED=true`, confirm the booking, conflict, waitlist, and notifications flows still work end to end.
