import {
  EVENT_WEIGHTS,
  HIGH_PRIORITY_EVENTS,
  ROLE_WEIGHTS,
  SCORE_FACTORS,
} from '../lib/constants'
import { hourOf, monthKey, sum } from '../lib/utils'

// ---------------------------------------------------------------------------
// S2 — score_priority  (deterministic, no LLM)
//
// Produces a transparent score with a per-factor breakdown so every decision
// can be explained to the user who lost out. Pure function: no store access.
// ---------------------------------------------------------------------------

export const DEFAULT_PRIORITY_CONFIG = {
  eventWeights: { ...EVENT_WEIGHTS },
  roleWeights: { ...ROLE_WEIGHTS },
  fairnessCap: 15,
  advanceNoticeCap: 10,
  noShowPenaltyPer: 5,
  noShowCap: 4,
  /** An unverified exam/placement claim only collects a fraction of its weight,
   *  so typing "exam" cannot jump the queue. */
  unverifiedHighPriorityCap: 60,
  /** Scores within this gap are considered a "close call" for a human. */
  closeCallMargin: 12,
  /** Booking hours inside the quiet window earn a small convenience credit. */
  earlyBirdHours: [7, 8],
  earlyBirdBonus: 4,
}

export const EVENTS_NEEDING_VERIFICATION = HIGH_PRIORITY_EVENTS

/**
 * 0–15 credit for groups that have consumed fewer approved hours this month.
 * The busiest group gets 0; the lightest gets the full cap.
 */
export function fairnessBonusFor({ group, bookings, now = new Date(), config = DEFAULT_PRIORITY_CONFIG }) {
  const mk = monthKey(now)
  const isThisMonth = (b) => monthKey(b.startTime) === mk
  const billable = (b) => ['approved', 'completed'].includes(b.status)

  const hours = (b) =>
    Math.max(0, (new Date(b.endTime) - new Date(b.startTime)) / 3600000)

  const groupOf = (b) => b.group || b.club || b.department || 'unassigned'
  const relevant = (bookings || []).filter((b) => isThisMonth(b) && billable(b))

  if (!group) return 0
  const totals = new Map()
  for (const b of relevant) {
    const g = groupOf(b)
    totals.set(g, (totals.get(g) || 0) + hours(b))
  }
  if (totals.size < 2) return 0

  const mine = totals.get(group) || 0
  const busiest = Math.max(...totals.values())
  if (busiest <= 0) return 0
  return Math.round(config.fairnessCap * (1 - mine / busiest))
}

export function scorePriority({
  user = {},
  eventType = 'club',
  verified = false,
  start,
  now = new Date(),
  bookings = [],
  config = DEFAULT_PRIORITY_CONFIG,
  fairnessOverride,
}) {
  const notes = []
  const startMs = new Date(start).getTime()
  const nowMs = new Date(now).getTime()

  // --- event type ---------------------------------------------------------
  const declared = config.eventWeights[eventType] ?? 20
  let eventPts = declared
  if (EVENTS_NEEDING_VERIFICATION.includes(eventType) && !verified) {
    eventPts = Math.min(declared, config.unverifiedHighPriorityCap)
    notes.push({
      key: 'eventType',
      tone: 'amber',
      text: `“${eventType}” is capped at ${config.unverifiedHighPriorityCap} until an approver verifies it.`,
    })
  }

  // --- role ---------------------------------------------------------------
  const rolePts = config.roleWeights[user.role] ?? 10

  // --- advance notice -----------------------------------------------------
  const daysAhead = Math.floor((startMs - nowMs) / 86400000)
  const advanceNotice = Math.min(Math.max(0, daysAhead), config.advanceNoticeCap)

  // --- no-show penalty ----------------------------------------------------
  const noShowPenalty = -config.noShowPenaltyPer * Math.min(user.noShowCount ?? 0, config.noShowCap)
  if (noShowPenalty < 0) {
    notes.push({
      key: 'noShowPenalty',
      tone: 'rose',
      text: `${Math.min(user.noShowCount ?? 0, config.noShowCap)} recent no-show(s) applied a ${noShowPenalty} point penalty.`,
    })
  }

  // --- fairness -----------------------------------------------------------
  const group = user.club || user.department
  const fairness =
    fairnessOverride ??
    fairnessBonusFor({ group, bookings, now, config })
  if (fairness >= config.fairnessCap - 1) {
    notes.push({
      key: 'fairness',
      tone: 'mint',
      text: `${group ?? 'This group'} has used the least resource time this month — full fairness credit.`,
    })
  }

  // --- convenience credit for off-peak hours ------------------------------
  const extra = []
  if (config.earlyBirdHours.includes(hourOf(new Date(start)))) {
    extra.push({ key: 'offPeak', label: 'Off-peak', points: config.earlyBirdBonus })
  }

  const breakdown = {
    eventType: eventPts,
    role: rolePts,
    fairness,
    advanceNotice,
    noShowPenalty,
  }

  const score =
    sum(Object.values(breakdown)) + sum(extra, (e) => e.points)

  return {
    score: Math.round(score * 10) / 10,
    breakdown,
    extras: extra,
    notes,
    margin: config.closeCallMargin,
  }
}

/** Convenience wrapper that pulls the requester and history out of a db shape. */
export function scorePriorityFromDb(db, { userId, eventType, verified, start, config }) {
  const user = db.profiles.find((p) => p.id === userId) ?? {}
  return scorePriority({
    user,
    eventType,
    verified,
    start,
    bookings: db.bookings,
    config: config ?? db.settings?.priority ?? DEFAULT_PRIORITY_CONFIG,
  })
}

export const FACTOR_ORDER = SCORE_FACTORS.map((f) => f.key)

const safeSum = (values) => values.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0)

/** Total of a breakdown, used to verify the stored score matches its parts. */
export function factorTotal(breakdown = {}, extras = []) {
  return safeSum(Object.values(breakdown)) + safeSum((extras ?? []).map((e) => e.points))
}
