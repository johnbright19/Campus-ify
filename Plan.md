# Plan.md — 4-Hour Execution Plan

**Project:** Campus Resource Booking & Conflict Resolution
**Stack:** React + Tailwind + GSAP · Node.js · Supabase · Google OAuth · LLM API
**Goal:** A working, demo-ready platform with a rock-solid conflict engine and 3–4 visible AI/automation features.

---

## 1. Success Criteria

By the end of 4 hours, a judge can:

1. Sign in with Google and see role-based views
2. Browse resources and see a **live** calendar
3. Book a slot, then try the same slot from a second account and see an **instant conflict with smart alternatives**
4. Type a **natural-language request** and get a pre-filled booking
5. See a **priority-based resolution** with a visible score breakdown
6. Cancel a booking and watch the **waitlist auto-promote** in real time
7. See **automation** at work (no-show auto-release, reminders) and an **AI insights digest** on the admin dashboard

---

## 2. Scope Tiers

### Tier 1 — Foundation (must)
- Google OAuth, profiles, roles
- Resource CRUD (admin) + explorer (all)
- Booking form + **conflict engine** (S1) + DB exclusion constraint
- Calendar view
- Approval flow (pending → approved/rejected)
- In-app notifications

### Tier 2 — USP (should)
- Priority scoring with breakdown (S2)
- Smart alternatives (S3)
- Waitlist + auto-promotion (S10)
- Realtime updates (Supabase Realtime)
- **AI Concierge**: natural-language booking (S4 / A1)
- **AI conflict explanation** (S6 / A2)
- Auto-release no-shows (S11) + QR check-in (S15)

### Tier 3 — Wow (could)
- Approval Copilot briefs (S8 / A3)
- Utilization dashboard + AI digest (S12–S13 / A4)
- Hoarding detection (S14)
- Resource bundling
- `.ics` export

### Cut line
If you're behind schedule at the **2:30 mark**, drop Tier 3 entirely and present it as roadmap. If behind at **3:00**, drop QR check-in and keep the auto-release worker (it can run without QR using a manual "Check in" button).

---

## 3. AI & Automation Summary

| Feature | Type | Impact for demo |
|---|---|---|
| Natural-language booking | LLM | Instant "wow", easy to show |
| Conflict explanation + alternatives | Hybrid | Shows fairness and transparency |
| Approval brief | LLM | Shows productivity gain for staff |
| No-show auto-release | Automation | Shows real-world thinking |
| Waitlist auto-promotion | Automation | Real-time drama in demo |
| Reminders / escalation | Automation | Completeness |
| AI insights digest | LLM | Admin value |

**Principle:** deterministic core, AI on top, fallback for every AI path.

---

## 4. Team Split (adjust to your size)

| Role | Owns |
|---|---|
| **Backend lead** | Schema, conflict engine, priority, waitlist, workers |
| **Frontend lead** | Auth UI, calendar, booking form, conflict panel, GSAP |
| **AI/Integration** | AI client, skills S4–S9, Concierge chat, prompts + fallbacks |
| **Product/Demo** | Seed data, dashboard, deck, demo script, QA |

**Solo?** Follow the timeline in order and skip the "parallel" notes. Do Tier 1 → S2/S3 → S4 → waitlist → realtime → cron.

---

## 5. Timeline

### Hour 0:00 – 0:30 — Setup & Foundations
| Task | Owner | Done when |
|---|---|---|
| Create repo; scaffold `client` (Vite + React + Tailwind + GSAP) and `server` (Express) | All | Both run locally |
| Supabase project; enable Google provider; Google Cloud OAuth client | Backend | "Sign in with Google" returns a session |
| Run migration (tables, trigger, constraint, RLS) | Backend | Tables visible in Supabase |
| Seed script: 10 resources, 5 demo users with roles | Product | `npm run seed` works |
| Pick LLM key, add `.env` | AI | Test call returns text |

**Checkpoint 1:** Sign in → profile row created → `/api/me` returns role.

### Hour 0:30 – 1:30 — Core Booking & Conflict Engine
| Task | Owner | Done when |
|---|---|---|
| Auth middleware (verify Supabase JWT, load profile) | Backend | Protected routes work |
| Resources API + Explorer UI | Backend/Frontend | Cards with filters |
| `detect_conflicts` (S1) + tests | Backend | All edge-case tests pass |
| `POST /bookings` with `23P01` handling | Backend | Duplicate approved slot returns 409 |
| Calendar UI (FullCalendar) + booking form with inline conflict check | Frontend | Create booking from UI |

**Checkpoint 2:** Two accounts, same slot → second gets a clean 409 message.

### Hour 1:30 – 2:30 — Intelligence Layer
| Task | Owner | Done when |
|---|---|---|
| `score_priority` (S2) + breakdown UI | Backend/Frontend | Score visible on request |
| `suggest_alternatives` (S3) + AlternativesList (GSAP stagger) | Backend/Frontend | One-click rebook |
| Approval flow + notifications table + Realtime | Backend/Frontend | Approver sees inbox; calendar updates live |
| AI client wrapper + `parse_booking_request` (S4) + chrono fallback | AI | NL sentence → structured JSON |
| Concierge chat dock (option cards → prefilled form) | AI/Frontend | "Hall tomorrow 2–4 for 80" works |

**Checkpoint 3:** Type a sentence → options → confirm → booking appears live on another browser.

### Hour 2:30 – 3:20 — Automation & Resolution
| Task | Owner | Done when |
|---|---|---|
| Waitlist table + `promote_waitlist` (S10) + offer expiry | Backend | Cancel → next user notified |
| Conflict Mediator: `explain_conflict` (S6) + soft-conflict handling | AI/Backend | Close-score case shows admin comparison card |
| `release_no_shows` (S11) cron + manual "Check in" (QR if time) | Backend | Unchecked booking auto-releases |
| `draft_notification` (S9) with templates | AI | Messages read well |
| Reminder + escalation workers | Backend | Logs show runs |

**Checkpoint 4 (cut line):** The full story works: book → clash → alternatives/waitlist → cancel → auto-promote.

### Hour 3:20 – 3:45 — Wow Layer & Polish
| Task | Owner | Done when |
|---|---|---|
| Approval Copilot brief (S8) in inbox | AI | Brief + flags shown |
| Admin dashboard: utilization heatmap, KPIs (GSAP count-up), AI digest (S13) | Product/Frontend | Dashboard populated from seed data |
| GSAP pass: login hero, card stagger, conflict shake, live pulse | Frontend | Smooth, no jank |
| Empty/error/loading states | Frontend | No blank screens |

### Hour 3:45 – 4:00 — Ship & Rehearse
| Task | Owner | Done when |
|---|---|---|
| Deploy (client → Vercel, API → Render, add redirect URLs) | Backend | Live URL works with Google login |
| Set `LLM_DISABLED=true` dry run | AI | Demo works without AI |
| Rehearse demo twice with timer | All | ≤ 5 minutes |
| Final 5-slide deck | Product | Problem → Solution → USPs → Architecture → Impact |

---

## 6. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Google OAuth redirect misconfiguration | High | Do it in the first 30 min; add both `localhost` and deployed URLs |
| LLM latency/failure in demo | Medium | Fallbacks (S4 chrono-node, templates); `LLM_DISABLED` switch; pre-warm before demo |
| Cron needs always-on server | Medium | Host API on Render/Railway; also add a manual "Run job now" admin button for demo |
| Realtime not firing | Low | Enable replication on `bookings` and `notifications`; test in checkpoint 3 |
| Time overrun on UI polish | High | Polish only after Checkpoint 4 |
| Timezone bugs | Medium | Store UTC, convert at display; test one cross-midnight case |

---

## 7. Demo Script (5 minutes)

| Time | Beat | What to show |
|---|---|---|
| 0:00 | **Hook** | WhatsApp/Excel chaos screenshot → "double-booking, favoritism, empty rooms" |
| 0:30 | **Sign in + live calendar** | Google login, resource cards animate in |
| 1:00 | **AI booking** | Type: "Need a hall for 80 people tomorrow 2 to 4 with a projector" → options → confirm |
| 1:45 | **Conflict** | Second account requests same slot → shake, conflict panel, ranked alternatives, one-click rebook |
| 2:30 | **Fair resolution** | Exam vs. club clash → score breakdown + AI explanation; close-score case → admin comparison card |
| 3:15 | **Automation** | Cancel booking → waitlisted user promoted live; show no-show auto-release log |
| 4:00 | **Insights** | Admin dashboard heatmap + AI digest: "Hall A is 94% booked weekdays; shift club meetings to Lab 3" |
| 4:30 | **Close** | "Not just booking — fair, explainable, automated conflict resolution that keeps campus resources in use." |

**Demo prep:** two browser profiles pre-logged (student, admin), seeded data that guarantees the clash, a waitlisted user ready, and a booking whose grace period is about to expire.

---

## 8. Seed Data Checklist

- 10 resources: Seminar Hall A/B, Auditorium, Lab 1–3, Classroom 101–102, Ground, Projector kit
- 5 users: student (club: IEEE), student (club: Cultural), faculty, HOD, admin
- 1 approved booking that creates a guaranteed clash
- 1 pending booking for the approval demo
- 1 waitlist entry
- 1 student with 2 no-shows (to show the fairness penalty)
- ~3 weeks of historical bookings (for heatmap and forecast)

---

## 9. Pre-Start Checklist

- [ ] Google Cloud project + OAuth client created
- [ ] Supabase project created, Google provider enabled
- [ ] LLM API key tested
- [ ] Repo + branches + `.env.example` committed
- [ ] Roles assigned, Slack/WhatsApp group ready
- [ ] `Architecture.md`, `Skills.md`, `Agent.md`, `Build.md` open for reference

---

## 10. Pitch Line

> **"A campus booking platform that doesn't just prevent double-booking. It resolves conflicts fairly, explains every decision, suggests instant alternatives, and automatically keeps resources from sitting idle."**
