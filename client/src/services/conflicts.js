import { getState } from '../lib/store'
import { overlaps } from '../lib/utils'

// ---------------------------------------------------------------------------
// S1 — detect_conflicts  (deterministic)
//
// Finds bookings that collide with a requested resource + range.
//   hard     → overlaps an APPROVED booking  (cannot proceed)
//   soft     → overlaps a PENDING  booking   (compare priorities)
//   blackout → maintenance / exam / holiday   (cannot proceed)
//
// Ranges follow the `[)` convention from Architecture.md §4: a booking that
// ends at 14:00 and one that starts at 14:00 do NOT conflict.
// ---------------------------------------------------------------------------

export const ACTIVE_STATUSES = ['pending', 'approved']

export function bookingsForResource(resourceId, db = getState()) {
  return db.bookings.filter(
    (b) => b.resourceId === resourceId && ACTIVE_STATUSES.includes(b.status)
  )
}

export function findOverlaps({ resourceId, start, end, excludeId = null, db = getState() }) {
  return bookingsForResource(resourceId, db).filter(
    (b) => b.id !== excludeId && overlaps(start, end, b.startTime, b.endTime)
  )
}

export function findBlackout({ resourceId, start, end, db = getState() }) {
  return (
    db.blackouts.find(
      (bl) =>
        (bl.resourceId === resourceId || bl.resourceId === null) &&
        overlaps(start, end, bl.startTime, bl.endTime)
    ) ?? null
  )
}

export function detectConflicts({ resourceId, start, end, excludeId = null, db = getState() }) {
  const overlapping = findOverlaps({ resourceId, start, end, excludeId, db })
  const blackout = findBlackout({ resourceId, start, end, db })
  const hard = overlapping.filter((b) => b.status === 'approved')
  const soft = overlapping.filter((b) => b.status === 'pending')

  return {
    hard,
    soft,
    blackout,
    hasBlocking: hard.length > 0 || Boolean(blackout),
    summary:
      hard.length > 0
        ? `${hard.length} approved booking(s) already own this slot`
        : blackout
          ? `Resource blocked: ${blackout.reason}`
          : soft.length > 0
            ? `${soft.length} pending request(s) overlap — priorities will decide`
            : 'No conflicts',
  }
}

/** Everything happening on a resource inside a window (for the day rail UI). */
export function agendaForResource(resourceId, from, to, db = getState()) {
  return db.bookings
    .filter(
      (b) =>
        b.resourceId === resourceId &&
        ACTIVE_STATUSES.includes(b.status) &&
        overlaps(from, to, b.startTime, b.endTime)
    )
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
}

/** Every pair of overlapping pending requests (the Mediator's work queue). */
export function openConflictPairs(db = getState()) {
  const pending = db.bookings.filter((b) => b.status === 'pending')
  const pairs = []
  for (let i = 0; i < pending.length; i += 1) {
    for (let j = i + 1; j < pending.length; j += 1) {
      const a = pending[i]
      const b = pending[j]
      if (a.resourceId !== b.resourceId) continue
      if (!overlaps(a.startTime, a.endTime, b.startTime, b.endTime)) continue
      pairs.push({ a, b, gap: Math.abs(a.priorityScore - b.priorityScore) })
    }
  }
  return pairs
}
