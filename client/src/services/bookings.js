import { getState, now, produce } from '../lib/store'
import { fmtRange, overlapMs, overlaps, uid } from '../lib/utils'
import { api, getToken, mapBooking } from '../lib/api'
import { pullBookings, pullMyBookings, pullNotifications } from '../lib/sync'
import { detectConflicts, openConflictPairs } from './conflicts'
import { scorePriority } from './priority'
import { suggestAlternatives } from './suggestions'
import { promoteWaitlist } from './waitlist'
import { commit, makeAudit, makeNotification } from './notifications'
import { draftNotification } from './ai'

// ---------------------------------------------------------------------------
// Booking lifecycle.
//
// This is the deterministic heart of the product. Every rule from
// Architecture.md §6 is enforced here in plain code; the AI layer (see ai.js)
// only ever *advises* on top of these functions.
// ---------------------------------------------------------------------------

export class DomainError extends Error {
  constructor(code, message, extra = {}) {
    super(message)
    this.name = 'DomainError'
    this.code = code
    Object.assign(this, extra)
  }
}

export const OPEN_BOOKING_STATUSES = ['pending', 'approved']

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

function requireUser(db, userId) {
  const user = db.profiles.find((p) => p.id === userId)
  if (!user) throw new DomainError('NO_USER', 'Please sign in again')
  return user
}

function requireResource(db, resourceId) {
  const resource = db.resources.find((r) => r.id === resourceId)
  if (!resource) throw new DomainError('NO_RESOURCE', 'That resource no longer exists')
  if (!resource.isActive) throw new DomainError('INACTIVE', 'That resource is out of service')
  return resource
}

function isAdmin(db, userId) {
  return db.profiles.find((p) => p.id === userId)?.role === 'admin'
}

export function qrTokenFor(bookingId, endTime) {
  const payload = `${bookingId}.${new Date(endTime).getTime()}`
  let h = 2166136261
  for (let i = 0; i < payload.length; i += 1) {
    h ^= payload.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `xit.${payload}.${(h >>> 0).toString(16)}`
}

export function verifyQrToken(token, bookingId) {
  if (!token || !bookingId) return false
  return typeof token === 'string' && token.startsWith(`xit.${bookingId}.`)
}

export function checkInWindow(booking, settings) {
  const start = new Date(booking.startTime).getTime()
  const grace = (settings?.noShowGraceMin ?? 15) * 60000
  return { opensAt: new Date(start - 10 * 60000), closesAt: new Date(start + grace) }
}

export function canCheckIn(booking, settings, at = now()) {
  if (booking.status !== 'approved' || booking.checkedInAt) return false
  const { opensAt, closesAt } = checkInWindow(booking, settings)
  return at >= opensAt && at <= closesAt
}

/** Score a prospective booking without writing anything. */
export function previewScore({ userId, eventType, verified = false, start, attendees }) {
  const db = getState()
  const user = requireUser(db, userId)
  void attendees
  return scorePriority({
    user: {
      role: user.role,
      club: user.club,
      department: user.department,
      noShowCount: user.noShowCount,
    },
    eventType,
    verified,
    start,
    now: now(),
    bookings: db.bookings,
    config: db.settings.priority,
  })
}

/** Which approvers should hear about a pending request. */
function approversFor(db, resource) {
  const wanted = resource.approverRole
  const candidates = db.profiles.filter(
    (p) => p.role === 'admin' || (wanted ? p.role === wanted : false)
  )
  const fallback = db.profiles.filter((p) => ['hod', 'admin'].includes(p.role))
  return (candidates.length ? candidates : fallback).map((p) => p.id)
}

/** Full pre-flight report used by the form's live conflict banner. */
export function inspectAvailability({ resourceId, start, end, excludeId = null, attendees = 0, features = [] }) {
  const db = getState()
  const resource = db.resources.find((r) => r.id === resourceId)
  if (!resource) return { ok: false, code: 'NO_RESOURCE' }

  const conflicts = detectConflicts({ resourceId, start, end, excludeId, db })
  const capacityIssue =
    resource.type !== 'equipment' && attendees > resource.capacity
      ? `Capacity is ${resource.capacity} — you asked for ${attendees}`
      : null
  const past = new Date(start) < now()
  const durationMs = new Date(end) - new Date(start)

  return {
    ok: !conflicts.hasBlocking && !capacityIssue && !past && durationMs > 0,
    resource,
    ...conflicts,
    capacityIssue,
    past,
    invalidRange: durationMs <= 0,
    durationMs,
    alternatives:
      conflicts.hasBlocking
        ? suggestAlternatives({ resourceId, start, end, attendees, features, db })
        : [],
  }
}

/* ---------------------------------------------------------------------------
 * Create
 * ------------------------------------------------------------------------- */

export function createBooking({
  userId,
  resourceId,
  title,
  purpose = '',
  eventType = 'club',
  attendees = 1,
  start,
  end,
  verified = false,
  source = 'web',
  aiMeta = {},
}) {
  const db = getState()
  const user = requireUser(db, userId)
  const resource = requireResource(db, resourceId)

  if (!title || title.trim().length < 3) {
    throw new DomainError('TITLE', 'Give the booking a title (at least 3 characters)')
  }
  if (new Date(end) <= new Date(start)) {
    throw new DomainError('RANGE', 'The end time must be after the start time')
  }
  if (new Date(start) < now()) {
    throw new DomainError('PAST', 'You cannot book a slot in the past')
  }
  if (resource.type !== 'equipment' && attendees > resource.capacity) {
    throw new DomainError('CAPACITY', `${resource.name} seats ${resource.capacity} people`, {
      capacity: resource.capacity,
    })
  }

  const conflicts = detectConflicts({ resourceId, start, end, db })

  if (conflicts.blackout) {
    throw new DomainError('BLACKOUT', `${resource.name} is blocked: ${conflicts.blackout.reason}`, {
      blackout: conflicts.blackout,
      alternatives: suggestAlternatives({ resourceId, start, end, attendees, db }),
      canJoinWaitlist: false,
    })
  }

  if (conflicts.hard.length) {
    throw new DomainError(
      'CONFLICT',
      `${resource.name} is already booked for that slot`,
      {
        conflicts: conflicts.hard,
        alternatives: suggestAlternatives({
          resourceId,
          start,
          end,
          attendees,
          features: resource.features ?? [],
          db,
        }),
        canJoinWaitlist: true,
        holder: conflicts.hard[0],
      }
    )
  }

  const { score, breakdown, notes } = scorePriority({
    user: {
      role: user.role,
      club: user.club,
      department: user.department,
      noShowCount: user.noShowCount,
    },
    eventType,
    verified,
    start,
    now: now(),
    bookings: db.bookings,
    config: db.settings.priority,
  })

  const status = resource.requiresApproval ? 'pending' : 'approved'
  const id = uid('bkg')
  const createdAt = now().toISOString()

  const booking = {
    id,
    groupId: null,
    userId,
    resourceId,
    title: title.trim(),
    purpose: purpose.trim(),
    eventType,
    attendees,
    startTime: new Date(start).toISOString(),
    endTime: new Date(end).toISOString(),
    status,
    verified,
    priorityScore: score,
    priorityBreakdown: breakdown,
    aiMeta: { ...aiMeta, scoreNotes: notes },
    source,
    checkedInAt: null,
    qrToken: status === 'approved' ? qrTokenFor(id, end) : null,
    createdAt,
    updatedAt: createdAt,
  }

  const notifications = []
  const audits = [
    makeAudit(userId, 'booking.create', 'booking', id, {
      status,
      score,
      breakdown,
      softConflicts: conflicts.soft.length,
    }),
  ]

  if (status === 'approved') {
    notifications.push(
      makeNotification(userId, {
        title: 'Booking confirmed',
        body: `${resource.name} · ${fmtRange(booking.startTime, booking.endTime)}. Your check-in QR is ready.`,
        link: '/bookings',
        kind: 'success',
      })
    )
  } else {
    for (const approverId of approversFor(db, resource)) {
      notifications.push(
        makeNotification(approverId, {
          title: 'Approval needed',
          body: `${title} · ${resource.name} · ${fmtRange(booking.startTime, booking.endTime)}`,
          link: '/approvals',
          kind: 'info',
        })
      )
    }
  }

  commit(
    'booking.create',
    { bookings: [booking, ...db.bookings] },
    { notifications, audits },
    { pulse: { kind: 'booking', bookingId: id, resourceId, status } }
  )

  return { booking, softConflicts: conflicts.soft, score, breakdown }
}

/* -------------------------------------------------------------------------
 * Server-backed booking lifecycle
 *
 * With a session linked, the Express API is the source of truth: it runs the
 * policy + conflict + priority checks against Postgres, and the database
 * exclusion constraint is the final arbiter. The local engine stays as the
 * offline demo path. Both return the same shapes, so callers do not care which
 * one ran.
 * ------------------------------------------------------------------------ */

export async function createBookingRemote(payload) {
  try {
    const result = await api.createBooking({
      resourceId: payload.resourceId,
      title: payload.title,
      purpose: payload.purpose ?? '',
      eventType: payload.eventType || 'club',
      attendees: payload.attendees ?? 1,
      start: new Date(payload.start).toISOString(),
      end: new Date(payload.end).toISOString(),
    })
    // Render the persisted row immediately; background reads reconcile joined
    // fields and keep the calendar/history views in sync.
    const booking = mapBooking(result.booking)
    produce('server.booking.created', (db) => ({
      ...db,
      bookings: [booking, ...db.bookings.filter((item) => item.id !== booking.id)],
    }))
    pullBookings({ full: true }).catch(() => {})
    pullMyBookings().catch(() => {})
    if (booking.status === 'approved') pullNotifications().catch(() => {})
    return {
      booking,
      softConflicts: (result.softConflicts ?? []).map(mapBooking),
    }
  } catch (error) {
    if (error?.status === 409) {
      throw new DomainError(
        error.code === 'BLACKOUT' ? 'BLACKOUT' : 'CONFLICT',
        error.message,
        {
          // The API returns raw Postgres rows; the conflict panel reads the
          // camelCase shape the rest of the UI uses.
          conflicts: (error.payload?.conflictingBookings ?? []).map(mapBooking),
          alternatives: error.payload?.alternatives ?? [],
          canJoinWaitlist: error.payload?.canJoinWaitlist ?? true,
        }
      )
    }
    if ([400, 403, 404].includes(error?.status)) {
      throw new DomainError(error.code ?? 'INVALID', error.message)
    }
    throw error
  }
}

/** Cancel through the API, then mirror the new status back into the store. */
export async function cancelBookingRemote(id) {
  const result = await api.cancelBooking(id)
  await pullBookings({ full: true })
  return result
}

export async function approveBookingRemote(id, verified = false) {
  const result = await api.approveBooking(id, verified)
  await Promise.all([
    pullBookings({ full: true }),
    pullMyBookings(),
    pullNotifications().catch(() => 0),
  ])
  return mapBooking(result)
}

export async function rejectBookingRemote(id, reason) {
  const result = await api.rejectBooking(id, reason)
  await pullBookings({ full: true })
  return mapBooking(result)
}

/** True when the session is linked to the backend. */
export function isRemoteMode() {
  return Boolean(getToken())
}

/* ---------------------------------------------------------------------------
 * Cancel / release
 * ------------------------------------------------------------------------- */

export function cancelBooking(id, actorId, reason = 'Released by the requester') {
  const db = getState()
  const booking = db.bookings.find((b) => b.id === id)
  if (!booking) throw new DomainError('NOT_FOUND', 'That booking no longer exists')
  if (booking.userId !== actorId && !isAdmin(db, actorId)) {
    throw new DomainError('FORBIDDEN', 'You can only cancel your own bookings')
  }
  if (['cancelled', 'completed', 'no_show'].includes(booking.status)) {
    throw new DomainError('STATE', `That booking is already ${booking.status}`)
  }

  const patch = {
    bookings: db.bookings.map((b) =>
      b.id === id ? { ...b, status: 'cancelled', updatedAt: now().toISOString() } : b
    ),
  }
  const effects = {
    notifications: [
      makeNotification(booking.userId, {
        title: 'Booking cancelled',
        body: `${booking.title} has been released. Anyone on the waitlist was just offered it.`,
        link: '/bookings',
        kind: 'warning',
      }),
    ],
    audits: [makeAudit(actorId, 'booking.cancel', 'booking', id, { reason })],
  }

  // Promote the next person in the same transaction, so the release is atomic.
  const promotions = {}
  const offered = promoteWaitlist(booking.resourceId, booking.startTime, booking.endTime, {
    collect: promotions,
  })
  if (offered) {
    patch.waitlist = promotions.waitlist
    effects.notifications = [...effects.notifications, ...(promotions.notifications ?? [])]
    effects.audits = [...effects.audits, ...(promotions.audits ?? [])]
  }

  commit('booking.cancel', patch, effects, {
    pulse: { kind: 'release', resourceId: booking.resourceId, promoted: Boolean(offered) },
  })

  return { booking, promoted: offered, offered }
}

/* ---------------------------------------------------------------------------
 * Approvals
 * ------------------------------------------------------------------------- */

export function approveBooking(id, actorId, { verified = false, reason = '' } = {}) {
  const db = getState()
  const booking = db.bookings.find((b) => b.id === id)
  if (!booking) throw new DomainError('NOT_FOUND', 'That request no longer exists')
  const actor = db.profiles.find((p) => p.id === actorId)
  if (!actor || !['faculty', 'hod', 'admin'].includes(actor.role)) {
    throw new DomainError('FORBIDDEN', 'Only approvers can decide on requests')
  }
  if (booking.status === 'approved') return { booking, alreadyApproved: true }

  const conflicts = detectConflicts({
    resourceId: booking.resourceId,
    start: booking.startTime,
    end: booking.endTime,
    excludeId: booking.id,
    db,
  })
  if (conflicts.hard.length) {
    throw new DomainError('CONFLICT', 'Another approved booking now owns this slot', {
      conflicts: conflicts.hard,
      alternatives: suggestAlternatives({
        resourceId: booking.resourceId,
        start: booking.startTime,
        end: booking.endTime,
        attendees: booking.attendees,
        db,
      }),
    })
  }

  const resource = db.resources.find((r) => r.id === booking.resourceId)
  const needsVerification = ['exam', 'placement'].includes(booking.eventType)
  const shouldVerify = verified || (needsVerification && booking.verified)

  const next = {
    ...booking,
    status: 'approved',
    verified: shouldVerify,
    qrToken: qrTokenFor(booking.id, booking.endTime),
    updatedAt: now().toISOString(),
  }

  const notifications = [
    makeNotification(booking.userId, {
      title: 'Booking approved ✅',
      body: `${booking.title} is confirmed for ${fmtRange(booking.startTime, booking.endTime)}${reason ? ` — ${reason}` : ''}.`,
      link: '/bookings',
      kind: 'success',
    }),
  ]

  // Any pending requests that now collide get politely bumped, with options.
  const bumped = conflicts.soft
  const patch = { bookings: db.bookings.map((b) => (b.id === id ? next : b)) }

  for (const other of bumped) {
    notifications.push(
      makeNotification(other.userId, {
        title: 'A slot you were queuing for was taken',
        body: `${other.title} overlaps an approved booking. Here are ranked alternatives.`,
        link: '/bookings',
        kind: 'conflict',
      })
    )
  }

  commit('booking.approve', patch, {
    notifications,
    audits: [
      makeAudit(actorId, 'booking.approve', 'booking', id, {
        verified: shouldVerify,
        bumped: bumped.map((b) => b.id),
        reason,
      }),
    ],
  }, { pulse: { kind: 'approved', bookingId: id, resourceId: booking.resourceId } })

  return { booking: next, bumped }
}

export function rejectBooking(id, actorId, reason = 'Not specified') {
  const db = getState()
  const booking = db.bookings.find((b) => b.id === id)
  if (!booking) throw new DomainError('NOT_FOUND', 'That request no longer exists')
  const actor = db.profiles.find((p) => p.id === actorId)
  if (!actor || !['faculty', 'hod', 'admin'].includes(actor.role)) {
    throw new DomainError('FORBIDDEN', 'Only approvers can decide on requests')
  }

  const next = { ...booking, status: 'rejected', updatedAt: now().toISOString() }

  // S9 draft_notification composes the wording; the skill is pure here so the
  // write stays a single atomic commit.
  const message = draftNotification({
    event: 'rejected',
    facts: { title: booking.title, reason },
    userId: booking.userId,
    log: false,
  })

  commit(
    'booking.reject',
    { bookings: db.bookings.map((b) => (b.id === id ? next : b)) },
    {
      notifications: [
        makeNotification(booking.userId, {
          title: message.title,
          body: message.body,
          link: message.ctaLink,
          kind: 'warning',
        }),
      ],
      audits: [makeAudit(actorId, 'booking.reject', 'booking', id, { reason })],
    }
  )
  return next
}

export function requestChanges(id, actorId, note = '') {
  const db = getState()
  const booking = db.bookings.find((b) => b.id === id)
  if (!booking) throw new DomainError('NOT_FOUND', 'That request no longer exists')

  commit(
    'booking.changes_requested',
    {
      bookings: db.bookings.map((b) =>
        b.id === id
          ? { ...b, aiMeta: { ...b.aiMeta, changesRequested: note }, updatedAt: now().toISOString() }
          : b
      ),
    },
    {
      notifications: [
        makeNotification(booking.userId, {
          title: 'Changes requested',
          body: `${booking.title}: ${note || 'Please review the details and resubmit.'}`,
          link: '/bookings',
          kind: 'warning',
        }),
      ],
      audits: [makeAudit(actorId, 'booking.changes_requested', 'booking', id, { note })],
    }
  )
  return true
}

export function verifyHighPriority(id, actorId) {
  const db = getState()
  const booking = db.bookings.find((b) => b.id === id)
  if (!booking) throw new DomainError('NOT_FOUND', 'That request no longer exists')
  const { score, breakdown } = scorePriority({
    user: (() => {
      const u = db.profiles.find((p) => p.id === booking.userId)
      return { role: u?.role, club: u?.club, department: u?.department, noShowCount: u?.noShowCount }
    })(),
    eventType: booking.eventType,
    verified: true,
    start: booking.startTime,
    now: now(),
    bookings: db.bookings,
    config: db.settings.priority,
  })

  commit(
    'booking.verify',
    {
      bookings: db.bookings.map((b) =>
        b.id === id
          ? {
              ...b,
              verified: true,
              priorityScore: score,
              priorityBreakdown: breakdown,
              updatedAt: now().toISOString(),
            }
          : b
      ),
    },
    {
      notifications: [
        makeNotification(booking.userId, {
          title: 'High-priority claim verified',
          body: `${booking.title} now counts at full priority weight (${score}).`,
          link: '/bookings',
          kind: 'success',
        }),
      ],
      audits: [makeAudit(actorId, 'booking.verify', 'booking', id, { score })],
    }
  )
  return score
}

/* ---------------------------------------------------------------------------
 * Check-in & automation sweeps
 * ------------------------------------------------------------------------- */

export function checkIn(bookingId, actorId) {
  const db = getState()
  const booking = db.bookings.find((b) => b.id === bookingId)
  if (!booking) throw new DomainError('NOT_FOUND', 'That booking no longer exists')
  if (booking.userId !== actorId && !isAdmin(db, actorId)) {
    throw new DomainError('FORBIDDEN', 'Only the organiser can check in')
  }
  if (booking.checkedInAt) return { booking, already: true }
  if (!canCheckIn(booking, db.settings)) {
    const { opensAt, closesAt } = checkInWindow(booking, db.settings)
    throw new DomainError(
      'WINDOW',
      `Check-in opens at ${fmtRange(opensAt, closesAt)}`,
      { opensAt, closesAt }
    )
  }

  const next = { ...booking, checkedInAt: now().toISOString(), updatedAt: now().toISOString() }
  commit('booking.checkin', { bookings: db.bookings.map((b) => (b.id === bookingId ? next : b)) }, {
    notifications: [
      makeNotification(booking.userId, {
        title: 'Checked in ✔',
        body: `Have a good session — ${booking.title}.`,
        link: '/bookings',
        kind: 'success',
      }),
    ],
    audits: [makeAudit(actorId, 'booking.checkin', 'booking', bookingId, {})],
  })
  return { booking: next, already: false }
}

/**
 * S11 — release_no_shows.
 * Approved, unchecked bookings past the grace window become `no_show`, the
 * organiser is penalised, and the slot is offered to the waitlist.
 */
export function releaseNoShows({ resourceId = null } = {}) {
  const db = getState()
  const current = now()
  const grace = (db.settings.noShowGraceMin ?? 15) * 60000

  const lapsed = db.bookings.filter(
    (b) =>
      b.status === 'approved' &&
      !b.checkedInAt &&
      (!resourceId || b.resourceId === resourceId) &&
      new Date(b.startTime).getTime() + grace < current.getTime()
  )
  if (!lapsed.length) return { released: 0, promoted: 0 }

  const lapsedIds = new Set(lapsed.map((b) => b.id))
  const bookings = db.bookings.map((b) =>
    lapsedIds.has(b.id)
      ? { ...b, status: 'no_show', updatedAt: current.toISOString(), qrToken: null }
      : b
  )

  // Fairness penalty: one strike per no-show, tracked on the profile.
  const strikes = new Map()
  for (const b of lapsed) strikes.set(b.userId, (strikes.get(b.userId) ?? 0) + 1)
  const profiles = db.profiles.map((p) =>
    strikes.has(p.id) ? { ...p, noShowCount: (p.noShowCount ?? 0) + strikes.get(p.id) } : p
  )

  const notifications = []
  const audits = []
  for (const b of lapsed) {
    notifications.push(
      makeNotification(b.userId, {
        title: 'Slot auto-released (no-show)',
        body: `${b.title} was released because nobody checked in within ${db.settings.noShowGraceMin} minutes.`,
        link: '/bookings',
        kind: 'warning',
      })
    )
    audits.push(
      makeAudit(null, 'worker.auto_release', 'booking', b.id, {
        reason: `No check-in within ${db.settings.noShowGraceMin} minute grace window`,
      })
    )
  }

  commit('worker.autoRelease', { bookings, profiles }, { notifications, audits }, {
    pulse: { kind: 'autoRelease', count: lapsed.length },
  })

  let promoted = 0
  for (const b of lapsed) {
    if (promoteWaitlist(b.resourceId, b.startTime, b.endTime)) promoted += 1
  }

  return { released: lapsed.length, promoted, bookings: lapsed }
}

/** Mark past, confirmed sessions as completed so fairness credit rolls up. */
export function completeFinishedBookings() {
  const db = getState()
  const current = now()
  const finished = db.bookings.filter(
    (b) => b.status === 'approved' && b.checkedInAt && new Date(b.endTime) < current
  )
  if (!finished.length) return { completed: 0 }

  const ids = new Set(finished.map((b) => b.id))
  commit(
    'worker.completeBookings',
    {
      bookings: db.bookings.map((b) =>
        ids.has(b.id) ? { ...b, status: 'completed', updatedAt: current.toISOString() } : b
      ),
    },
    {
      audits: finished.map((b) => makeAudit(null, 'worker.complete', 'booking', b.id, {})),
    }
  )
  return { completed: finished.length }
}

/** 30-minute-before reminders (S9 template wording). */
export function sendReminders() {
  const db = getState()
  const current = now()
  const lead = (db.settings.remindersLeadMin ?? 30) * 60000
  const due = db.bookings.filter((b) => {
    if (b.status !== 'approved') return false
    if (b.aiMeta?.remindedAt) return false
    const startsIn = new Date(b.startTime).getTime() - current.getTime()
    return startsIn > 0 && startsIn <= lead
  })
  if (!due.length) return { reminded: 0 }

  const notifications = due.map((b) =>
    makeNotification(b.userId, {
      title: 'Starting soon',
      body: `${b.title} begins at ${fmtRange(b.startTime, b.endTime)}. Tap to check in.`,
      link: '/bookings',
      kind: 'info',
    })
  )
  const dueIds = new Set(due.map((b) => b.id))

  commit(
    'worker.reminders',
    {
      bookings: db.bookings.map((b) =>
        dueIds.has(b.id)
          ? { ...b, aiMeta: { ...b.aiMeta, remindedAt: current.toISOString() } }
          : b
      ),
    },
    { notifications, audits: due.map((b) => makeAudit(null, 'worker.remind', 'booking', b.id, {})) }
  )
  return { reminded: due.length }
}

/** Escalate requests that have been waiting longer than the SLA allows. */
export function escalateStaleApprovals() {
  const db = getState()
  const current = now()
  const slaMs = (db.settings.approvalSlaHours ?? 24) * 3600000
  const stale = db.bookings.filter(
    (b) => b.status === 'pending' && current.getTime() - new Date(b.createdAt).getTime() > slaMs
  )
  if (!stale.length) return { escalated: 0 }

  const notifications = []
  for (const b of stale) {
    const resource = db.resources.find((r) => r.id === b.resourceId)
    for (const approverId of approversFor(db, resource ?? {})) {
      notifications.push(
        makeNotification(approverId, {
          title: 'Approval breached SLA',
          body: `${b.title} has waited longer than ${db.settings.approvalSlaHours} h. Escalated.`,
          link: '/approvals',
          kind: 'warning',
        })
      )
    }
  }

  commit('worker.escalate', {}, {
    notifications,
    audits: stale.map((b) => makeAudit(null, 'worker.escalate', 'booking', b.id, {})),
  })
  return { escalated: stale.length }
}

/* ---------------------------------------------------------------------------
 * Waitlist offer acceptance
 * ------------------------------------------------------------------------- */

export function confirmWaitlistOffer(waitlistId, actorId) {
  const db = getState()
  const entry = db.waitlist.find((w) => w.id === waitlistId)
  if (!entry) throw new DomainError('NOT_FOUND', 'That waitlist entry no longer exists')
  if (entry.userId !== actorId && !isAdmin(db, actorId)) {
    throw new DomainError('FORBIDDEN', 'That offer belongs to someone else')
  }
  if (entry.status !== 'offered') {
    throw new DomainError('STATE', 'That offer is no longer open')
  }
  if (entry.offerExpiresAt && new Date(entry.offerExpiresAt) < now()) {
    throw new DomainError('EXPIRED', 'That offer has expired')
  }

  const conflicts = detectConflicts({
    resourceId: entry.resourceId,
    start: entry.startTime,
    end: entry.endTime,
    db,
  })
  if (conflicts.hard.length || conflicts.blackout) {
    throw new DomainError('CONFLICT', 'Someone else claimed that slot first', {
      alternatives: suggestAlternatives({
        resourceId: entry.resourceId,
        start: entry.startTime,
        end: entry.endTime,
        attendees: entry.attendees,
        db,
      }),
    })
  }

  const id = uid('bkg')
  const createdAt = now().toISOString()
  const booking = {
    id,
    groupId: null,
    userId: entry.userId,
    resourceId: entry.resourceId,
    title: entry.title,
    purpose: entry.purpose ?? '',
    eventType: entry.eventType,
    attendees: entry.attendees,
    startTime: entry.startTime,
    endTime: entry.endTime,
    status: 'approved',
    verified: false,
    priorityScore: entry.priorityScore,
    priorityBreakdown: entry.breakdown ?? {},
    aiMeta: { fromWaitlist: true },
    source: 'waitlist',
    checkedInAt: null,
    qrToken: qrTokenFor(id, entry.endTime),
    createdAt,
    updatedAt: createdAt,
  }

  commit(
    'waitlist.confirm',
    {
      bookings: [booking, ...db.bookings],
      waitlist: db.waitlist.map((w) => (w.id === waitlistId ? { ...w, status: 'confirmed' } : w)),
    },
    {
      notifications: [
        makeNotification(entry.userId, {
          title: 'Slot claimed 🎉',
          body: `${entry.title} is yours. Check-in QR is ready in My bookings.`,
          link: '/bookings',
          kind: 'success',
        }),
      ],
      audits: [makeAudit(actorId, 'waitlist.confirm', 'waitlist', waitlistId, { bookingId: id })],
    },
    { pulse: { kind: 'waitlistConfirmed', bookingId: id, resourceId: entry.resourceId } }
  )

  return booking
}

/* ---------------------------------------------------------------------------
 * Reads used across the UI
 * ------------------------------------------------------------------------- */

export function bookingById(id, db = getState()) {
  return db.bookings.find((b) => b.id === id) ?? null
}

export function decorate(booking, db = getState()) {
  if (!booking) return null
  const user = db.profiles.find((p) => p.id === booking.userId) ?? null
  const resource = db.resources.find((r) => r.id === booking.resourceId) ?? null
  return { ...booking, user, resource }
}

export function bookingsFor(userId, db = getState()) {
  return db.bookings
    .filter((b) => b.userId === userId)
    .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
    .map((b) => decorate(b, db))
}

export function pendingForApprover(userId, db = getState()) {
  const me = db.profiles.find((p) => p.id === userId)
  if (!me) return []
  const isAdmin = me.role === 'admin'

  return db.bookings
    .filter((b) => b.status === 'pending')
    .filter((b) => {
      if (isAdmin) return true
      const resource = db.resources.find((r) => r.id === b.resourceId)
      if (!resource) return false
      if (me.role === 'hod') {
        const requester = db.profiles.find((p) => p.id === b.userId)
        return requester?.department === me.department || resource.ownerDepartment === me.department
      }
      if (resource.approverRole === me.role) return true
      // Faculty can clear routine academic requests in their department.
      if (me.role === 'faculty') {
        const requester = db.profiles.find((p) => p.id === b.userId)
        return (
          ['academic', 'club', 'personal', 'fest'].includes(b.eventType) &&
          requester?.department === me.department
        )
      }
      return false
    })
    .filter((b) => b.userId !== userId)
    .sort((a, b) => b.priorityScore - a.priorityScore || new Date(a.startTime) - new Date(b.startTime))
    .map((b) => decorate(b, db))
}

/** The Mediator desk queue: overlapping pending pairs within the margin. */
export function closeCallQueue(db = getState(), userId = null) {
  const margin = db.settings.priority.closeCallMargin ?? 12
  const me = userId ? db.profiles.find((p) => p.id === userId) : null
  return openConflictPairs(db)
    .filter((p) => p.gap <= margin)
    .filter((pair) => {
      if (me?.role !== 'hod') return true
      const resource = db.resources.find((r) => r.id === pair.a.resourceId)
      const requesterA = db.profiles.find((p) => p.id === pair.a.userId)
      const requesterB = db.profiles.find((p) => p.id === pair.b.userId)
      return (
        resource?.ownerDepartment === me.department ||
        requesterA?.department === me.department ||
        requesterB?.department === me.department
      )
    })
    .sort((a, b) => a.gap - b.gap)
    .map((p) => ({
      ...p,
      resource: db.resources.find((r) => r.id === p.a.resourceId),
      a: decorate(p.a, db),
      b: decorate(p.b, db),
      overlapMs: overlapMs(p.a.startTime, p.a.endTime, p.b.startTime, p.b.endTime),
    }))
}

export function upcomingForResource(resourceId, db = getState()) {
  const current = now()
  return db.bookings
    .filter(
      (b) =>
        b.resourceId === resourceId &&
        OPEN_BOOKING_STATUSES.includes(b.status) &&
        new Date(b.endTime) >= current
    )
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
    .map((b) => decorate(b, db))
}

export function overlapsAny(booking, bookings) {
  return bookings.some((b) => b.id !== booking.id && overlaps(booking.startTime, booking.endTime, b.startTime, b.endTime))
}
