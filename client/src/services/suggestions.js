import { getState, now } from '../lib/store'
import {
  TZ,
  dayShift,
  dowOfWall,
  fmtDayShort,
  fmtTime,
  humanizeFeature,
  wallAt,
  wallInTz,
  wallOf,
} from '../lib/utils'
import { detectConflicts } from './conflicts'

// ---------------------------------------------------------------------------
// S3 — suggest_alternatives  (deterministic)
//
// Turns a failure into options. Two families:
//   1. same room, other time   (shifts on the same day, then the next days)
//   2. similar room, same time (type + capacity + feature fit)
//
// matchScore = 0.5·timeCloseness + 0.3·locationCloseness + 0.2·featureMatch
// ---------------------------------------------------------------------------

const TIME_SHIFTS = [1, 2, 3, -1, -2, -3]

function locationCloseness(a, b) {
  if (a === b) return 1
  if (!a || !b) return 0.5
  const blockA = String(a).split('·')[0].trim()
  const blockB = String(b).split('·')[0].trim()
  if (blockA && blockA === blockB) return 0.75
  return 0.35
}

/** Re-anchor an instant onto another calendar date, keeping its wall-clock time. */
function sameTimeOnDay(date, wall) {
  const w = wallInTz(date, TZ)
  return wallAt(wall, w.hour, w.minute, TZ)
}

export function suggestAlternatives({
  resourceId,
  start,
  end,
  attendees = 0,
  features = [],
  maxDaysAhead = 3,
  limit = 6,
  db = getState(),
}) {
  const resource = db.resources.find((r) => r.id === resourceId)
  if (!resource) return []

  const current = now()
  const startDate = new Date(start)
  const endDate = new Date(end)
  const durationMs = Math.max(30 * 60000, endDate.getTime() - startDate.getTime())
  const wanted = features.length ? features : (resource.features ?? [])
  const results = []
  const seen = new Set()

  const consider = (candidate) => {
    if (new Date(candidate.start) < current) return
    const key = `${candidate.resourceId}|${candidate.start}`
    if (seen.has(key)) return
    const { hard, soft, blackout } = detectConflicts({
      resourceId: candidate.resourceId,
      start: candidate.start,
      end: candidate.end,
      db,
    })
    if (hard.length || blackout) return
    seen.add(key)
    results.push({
      ...candidate,
      warnedSoft: soft.length > 0,
      matchScore: Math.round(Math.min(1, candidate.matchScore) * 100) / 100,
    })
  }

  // --- 1a. same resource, shifted hours on the same day -------------------
  for (const hours of TIME_SHIFTS) {
    const s = new Date(startDate.getTime() + hours * 3600000)
    if (s < current) continue
    const closeness = 1 - Math.abs(hours) / 48
    consider({
      type: 'other_time',
      resourceId,
      name: resource.name,
      location: resource.location,
      capacity: resource.capacity,
      start: s.toISOString(),
      end: new Date(s.getTime() + durationMs).toISOString(),
      matchScore: 0.5 * closeness + 0.5,
      reasons: ['Same room', hours > 0 ? `${hours} h later` : `${Math.abs(hours)} h earlier`],
      features: resource.features,
    })
  }

  // --- 1b. same resource, same time on the following days -----------------
  const startWall = wallOf(startDate, TZ)
  for (let day = 1; day <= maxDaysAhead; day += 1) {
    const shifted = sameTimeOnDay(startDate, dayShift(startWall, day, TZ))
    const closeness = Math.max(0.25, 1 - day * 0.22)
    consider({
      type: 'other_day',
      resourceId,
      name: resource.name,
      location: resource.location,
      capacity: resource.capacity,
      start: shifted.toISOString(),
      end: new Date(shifted.getTime() + durationMs).toISOString(),
      matchScore: 0.5 * closeness + 0.5,
      reasons: ['Same room', day === 1 ? 'Tomorrow' : `${day} days ahead`, fmtTime(shifted, TZ)],
      features: resource.features,
    })
  }

  // --- 2. similar resources at the same time ------------------------------
  const similar = db.resources.filter(
    (r) =>
      r.id !== resourceId &&
      r.isActive &&
      r.type === resource.type &&
      (r.type === 'equipment' || r.capacity >= attendees)
  )

  for (const other of similar) {
    const matched = wanted.filter((f) => (other.features ?? []).includes(f))
    const featureMatch = wanted.length ? matched.length / wanted.length : 1
    const missing = wanted.filter((f) => !(other.features ?? []).includes(f))

    consider({
      type: 'other_resource',
      resourceId: other.id,
      name: other.name,
      location: other.location,
      capacity: other.capacity,
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      matchScore:
        0.5 + 0.3 * locationCloseness(resource.location, other.location) + 0.2 * featureMatch,
      reasons: [
        'Same time',
        other.capacity ? `Seats ${other.capacity}` : 'Equipment',
        missing.length === 0
          ? 'All requested features'
          : `Missing ${missing.map(humanizeFeature).join(', ')}`,
      ],
      features: other.features,
      tradeoff: missing.length ? 'Feature tradeoff' : null,
    })
  }

  return results.sort((a, b) => b.matchScore - a.matchScore).slice(0, limit)
}

/**
 * S16 — suggest_best_time.
 * Cheapest uncontested windows for a resource over the next few days, ranked by
 * how much competition the window currently has.
 */
export function bestTimesFor(resourceId, durationMin = 60, days = 5, db = getState()) {
  const current = now()
  const startWall = wallOf(current, TZ)
  const out = []

  for (let day = 0; day < days; day += 1) {
    const wall = dayShift(startWall, day, TZ)
    const weekend = [0, 6].includes(dowOfWall(wall))
    const hours = weekend ? [10, 11, 12, 14, 15] : [8, 11, 12, 13, 15, 16, 18, 19]

    for (const hour of hours) {
      const s = wallAt(wall, hour, 0, TZ)
      if (s < current) continue
      const e = new Date(s.getTime() + durationMin * 60000)
      const { hard, soft, blackout } = detectConflicts({ resourceId, start: s, end: e, db })
      if (hard.length || blackout) continue
      out.push({
        start: s.toISOString(),
        end: e.toISOString(),
        contested: soft.length,
        offPeak: hour <= 9 || hour >= 17,
        label: `${fmtDayShort(s, TZ)} · ${fmtTime(s, TZ)}`,
      })
    }
  }

  return out
    .sort((a, b) => a.contested - b.contested || Number(b.offPeak) - Number(a.offPeak))
    .slice(0, 6)
}
