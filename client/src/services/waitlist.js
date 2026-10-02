import { getState, now } from '../lib/store'
import { overlaps, uid } from '../lib/utils'
import { api } from '../lib/api'
import { pullWaitlist } from '../lib/sync'
import { scorePriority } from './priority'
import { detectConflicts } from './conflicts'
import { commit, makeAudit, makeNotification } from './notifications'
import { draftNotification } from './ai'

// ---------------------------------------------------------------------------
// S10 — waitlist (join, rank, promote, expire)
//
// Deterministic and idempotent: running a promotion twice yields the same
// final state. Ordering is `priority_score desc, created_at asc`.
// ---------------------------------------------------------------------------

export const WAITLIST_OPEN_STATUSES = ['waiting', 'offered']

export function waitlistFor(userId, db = getState()) {
  return db.waitlist
    .filter((w) => w.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

/**
 * Join the waitlist through the API when a backend session exists.
 *
 * The server scores the entry with the same priority engine and stores the row,
 * so the queue the user sees is the queue an approver sees.
 */
export async function joinWaitlistRemote({
  resourceId,
  title,
  eventType = 'club',
  start,
  end,
}) {
  await api.joinWaitlist({
    resourceId,
    title,
    eventType,
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
  })
  await pullWaitlist()
  return { alreadyQueued: false }
}

export function joinWaitlist({
  userId,
  resourceId,
  title,
  purpose = '',
  eventType = 'club',
  attendees = 1,
  start,
  end,
}) {
  const db = getState()
  const user = db.profiles.find((p) => p.id === userId)
  const resource = db.resources.find((r) => r.id === resourceId)
  if (!user || !resource) throw new Error('Unknown user or resource')

  const duplicate = db.waitlist.find(
    (w) =>
      w.userId === userId &&
      w.resourceId === resourceId &&
      WAITLIST_OPEN_STATUSES.includes(w.status) &&
      overlaps(start, end, w.startTime, w.endTime)
  )
  if (duplicate) return { entry: duplicate, alreadyQueued: true }

  const { score, breakdown } = scorePriority({
    user: {
      role: user.role,
      club: user.club,
      department: user.department,
      noShowCount: user.noShowCount,
    },
    eventType,
    start,
    now: now(),
    bookings: db.bookings,
    config: db.settings.priority,
  })

  const entry = {
    id: uid('wl'),
    userId,
    resourceId,
    title: title || `${resource.name} request`,
    purpose,
    eventType,
    attendees,
    startTime: new Date(start).toISOString(),
    endTime: new Date(end).toISOString(),
    priorityScore: score,
    breakdown,
    status: 'waiting',
    offerExpiresAt: null,
    createdAt: now().toISOString(),
  }

  commit(
    'waitlist.join',
    { waitlist: [entry, ...db.waitlist] },
    {
      notifications: [
        makeNotification(userId, {
          title: 'You are on the waitlist',
          body: `${resource.name} · ${new Date(start).toLocaleString('en-IN', { timeZone: db.settings.timezone })}. We will offer it the moment it frees up.`,
          link: '/waitlist',
          kind: 'info',
        }),
      ],
      audits: [makeAudit(userId, 'waitlist.join', 'waitlist', entry.id, { resourceId })],
    },
    { pulse: { kind: 'waitlist', resourceId } }
  )

  return { entry, alreadyQueued: false }
}

/**
 * Offer a freed window to the best-ranked waiting entry that still fits.
 * Returns the offered entry, or null when nobody qualifies.
 */
export function promoteWaitlist(resourceId, freedStart, freedEnd, { collect } = {}) {
  const db = getState()
  const candidates = db.waitlist
    .filter(
      (w) =>
        w.resourceId === resourceId &&
        w.status === 'waiting' &&
        overlaps(w.startTime, w.endTime, freedStart, freedEnd)
    )
    .sort(
      (a, b) =>
        b.priorityScore - a.priorityScore || new Date(a.createdAt) - new Date(b.createdAt)
    )

  const offerMinutes = db.settings.offerWindowMin ?? 30
  const notice = []
  const audits = []
  let offered = null
  let touched = null

  for (const w of candidates) {
    const { hard, blackout } = detectConflicts({
      resourceId,
      start: w.startTime,
      end: w.endTime,
      db,
    })
    if (hard.length || blackout) continue

    const expiresAt = new Date(now().getTime() + offerMinutes * 60000).toISOString()
    touched = { ...w, status: 'offered', offerExpiresAt: expiresAt }
    offered = touched
    // S9 wording, composed purely so the offer stays part of one atomic write.
    const message = draftNotification({
      event: 'waitlist_offer',
      facts: { title: w.title, minutes: offerMinutes },
      userId: w.userId,
      log: false,
    })

    notice.push(
      makeNotification(w.userId, {
        title: message.title,
        body: message.body,
        link: message.ctaLink,
        kind: 'offer',
      })
    )
    audits.push(
      makeAudit(null, 'waitlist.offer', 'waitlist', w.id, { resourceId, expiresAt })
    )
    break
  }

  if (!touched) return null

  if (collect) {
    // Part of a larger transaction: return the patch instead of writing here.
    collect.waitlist = db.waitlist.map((w) => (w.id === touched.id ? touched : w))
    collect.notifications = [...(collect.notifications ?? []), ...notice]
    collect.audits = [...(collect.audits ?? []), ...audits]
    return offered
  }

  commit(
    'waitlist.offer',
    { waitlist: db.waitlist.map((w) => (w.id === touched.id ? touched : w)) },
    { notifications: notice, audits },
    { pulse: { kind: 'offer', resourceId, waitlistId: touched.id } }
  )
  return offered
}

/** Expire stale offers and roll each one to the next person in line. */
export function expireWaitlistOffers() {
  const db = getState()
  const current = now()
  const stale = db.waitlist.filter(
    (w) => w.status === 'offered' && w.offerExpiresAt && new Date(w.offerExpiresAt) < current
  )
  if (!stale.length) return { expired: 0, reoffered: 0 }

  const next = {
    ...db,
    waitlist: db.waitlist.map((w) =>
      stale.some((s) => s.id === w.id) ? { ...w, status: 'expired', offerExpiresAt: null } : w
    ),
  }

  const notifications = []
  const audits = []
  for (const s of stale) {
    notifications.push(
      makeNotification(s.userId, {
        title: 'Waitlist offer expired',
        body: `Your window to claim ${s.title} closed. We moved it to the next person.`,
        link: '/waitlist',
        kind: 'warning',
      })
    )
    audits.push(makeAudit(null, 'waitlist.expire', 'waitlist', s.id, {}))
  }

  // Write the expiry first, then let promotion logic pick the next candidate.
  commit('waitlist.expire', { waitlist: next.waitlist }, { notifications, audits })

  let reoffered = 0
  for (const s of stale) {
    if (promoteWaitlist(s.resourceId, s.startTime, s.endTime)) reoffered += 1
  }
  return { expired: stale.length, reoffered }
}

export function withdrawWaitlist(id, actorId) {
  const db = getState()
  const entry = db.waitlist.find((w) => w.id === id)
  if (!entry) return null
  const canWithdraw = entry.userId === actorId || db.profiles.find((p) => p.id === actorId)?.role === 'admin'
  if (!canWithdraw) throw new Error('You can only withdraw your own waitlist entries')

  commit(
    'waitlist.withdraw',
    { waitlist: db.waitlist.map((w) => (w.id === id ? { ...w, status: 'cancelled' } : w)) },
    { audits: [makeAudit(actorId, 'waitlist.withdraw', 'waitlist', id, {})] }
  )
  return true
}

/** Admin/demo helper: how many people are queuing for a given window. */
export function queueDepthFor(resourceId, start, end, db = getState()) {
  return db.waitlist.filter(
    (w) =>
      w.resourceId === resourceId &&
      w.status === 'waiting' &&
      overlaps(start, end, w.startTime, w.endTime)
  ).length
}
