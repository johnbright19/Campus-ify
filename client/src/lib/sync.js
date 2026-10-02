import { api, getToken, mapBooking, mapNotification, mapProfile, mapResource, mapWaitlistEntry, setToken, tokenForRole } from './api'
import { fireEvent, getState, produce } from './store'
import { TZ, dayShift, wallOf, zonedDate } from './utils'

// ---------------------------------------------------------------------------
// Keeping the browser store in step with the Express + Supabase backend.
//
// The store stays the read model (components keep using `useDb()`), but once a
// session is linked every table is mirrored from Postgres. Bookings are polled
// because the browser cannot subscribe to Supabase Realtime without a user JWT
// — the demo bearer tokens are not Supabase sessions. Polling is scoped to a
// small window so the common case is a cheap query, and the full two-week
// window is re-synced on focus.
// ---------------------------------------------------------------------------

const POLL_WINDOW_DAYS = { before: 1, after: 2 }
const FULL_WINDOW_DAYS = { before: 7, after: 14 }
const DEFAULT_POLL_MS = 5000

let pollTimer = null
let inFlight = false

function windowBounds(days) {
  const today = wallOf(new Date())
  const from = zonedDate({ ...dayShift(today, -days.before), hour: 0, minute: 0 }, TZ)
  const to = zonedDate({ ...dayShift(today, days.after), hour: 23, minute: 59 }, TZ)
  return { from: from.toISOString(), to: to.toISOString() }
}

/** True when an instant falls inside the window we just fetched. */
function inWindow(iso, bounds) {
  return new Date(iso) > new Date(bounds.from) && new Date(iso) < new Date(bounds.to)
}

function setServerMeta(patch) {
  produce('server.meta', (db) => ({
    ...db,
    server: { ...db.server, ...patch, lastSyncAt: new Date().toISOString() },
  }))
}

/**
 * Fetch bookings and merge them into the store. Rows inside the fetched window
 * are replaced wholesale; rows outside it (history loaded by the full sync) are
 * kept. Anything new or status-changed fires a pulse so the calendar can
 * highlight the affected space.
 */
export async function pullBookings({ full = false, authoritative = false, window } = {}) {
  if (!getToken()) return { changed: 0 }
  const bounds = windowBounds(window ?? (full ? FULL_WINDOW_DAYS : POLL_WINDOW_DAYS))

  const rows = await api.calendar({ from: bounds.from, to: bounds.to })
  const incoming = rows.map(mapBooking)

  const before = getState().bookings
  const beforeById = new Map(before.map((b) => [b.id, b]))
  const incomingIds = new Set(incoming.map((b) => b.id))

  // Once the session is linked the server owns the data: the bundled demo seed
  // is dropped rather than left to double up with real rows. Outside the polled
  // window we keep the full `/mine` result, including statuses the calendar omits.
  const keepExisting = (b) =>
    authoritative
      ? b.serverBacked &&
        (!inWindow(b.startTime, bounds) || b.userId === getState().session?.userId)
      : !b.serverBacked || !inWindow(b.startTime, bounds)

  const merged = [...before.filter(keepExisting), ...incoming]
    // Guard against duplicates: overlapping sync windows must never yield the
    // same booking twice (it would render as two blocks on the grid).
    .filter((booking, index, all) => all.findIndex((b) => b.id === booking.id) === index)
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))

  const pulses = {}
  let changed = 0
  for (const booking of incoming) {
    const existing = beforeById.get(booking.id)
    if (!existing) {
      pulses[booking.resourceId] = Date.now()
      changed += 1
    } else if (existing.status !== booking.status) {
      pulses[booking.resourceId] = Date.now()
      changed += 1
    }
  }
  for (const booking of before) {
    if (booking.serverBacked && inWindow(booking.startTime, bounds) && !incomingIds.has(booking.id)) {
      pulses[booking.resourceId] = Date.now()
      changed += 1
    }
  }

  // Write whenever the row set moved, not only when a server row changed:
  // dropping the demo seed on the first authoritative sync changes no `changed`
  // count but must still be persisted.
  if (changed > 0 || merged.length !== before.length) {
    produce('server.bookings', (db) => ({ ...db, bookings: merged }))
    for (const [resourceId, at] of Object.entries(pulses)) {
      fireEvent({ type: 'pulse', resourceId, reason: 'New activity on the calendar', at })
    }
  }

  setServerMeta({ connected: true, error: null, mode: 'server' })
  return { changed, total: incoming.length }
}

/** Resources + directory. Cheap enough to run on every session link. */
export async function pullDirectory() {
  const [resources, profiles] = await Promise.all([api.resources(), api.profiles()])
  produce('server.directory', (db) => ({
    ...db,
    resources: resources.map(mapResource),
    profiles: profiles.map(mapProfile),
  }))
  setServerMeta({ connected: true, error: null, mode: 'server' })
  return { resources: resources.length, profiles: profiles.length }
}

/**
 * Notifications for the signed-in user, restricted to booking acceptances.
 *
 * The server also emits reminders, escalations and waitlist offers; the bell is
 * only for "your booking was accepted", so everything else is filtered out here
 * rather than at each call site.
 */
export function isAcceptanceNotification(notification) {
  return /\bbooking\b.*\b(approved|accepted|confirmed)\b|\b(approved|accepted|confirmed)\b.*\bbooking\b/i.test(
    notification.title ?? ''
  )
}

export async function pullNotifications() {
  const rows = await api.notifications()
  const kept = rows.map(mapNotification).filter(isAcceptanceNotification)
  produce('server.notifications', (db) => ({
    ...db,
    notifications: kept,
  }))
  return kept.length
}

/**
 * Link the local session to a real database profile.
 *
 * The demo accounts keep their local identity, but the session is re-pointed at
 * the matching `profiles` row so `bookings.user_id` (a uuid) matches "my
 * bookings" comparisons.
 */
export async function linkSession(account) {
  const token = tokenForRole(account)
  setToken(token)

  const [me, directory] = await Promise.all([api.me({ token }), pullDirectory()])

  const profile = mapProfile(me)
  produce('auth.link', (db) => {
    const profiles = db.profiles.some((p) => p.id === profile.id)
      ? db.profiles.map((p) => (p.id === profile.id ? profile : p))
      : [...db.profiles, profile]
    return {
      ...db,
      profiles,
      session: db.session
        ? {
            ...db.session,
            userId: profile.id,
            email: profile.email,
            accessToken: token,
            linked: true,
          }
        : db.session,
    }
  })

  setServerMeta({ connected: true, error: null, mode: 'server' })
  // Sign-in only waits for identity and the resource directory. Booking history,
  // waitlist, and notifications fill in immediately after navigation.
  syncAll().catch(() => {})
  return { profile, ...directory }
}

/**
 * Every booking owned by the signed-in user, with no date window.
 *
 * The calendar only syncs ±1/±2 weeks, but "My bookings" must not silently drop
 * something booked for next quarter — so this endpoint is merged on top
 * regardless of the window.
 */
export async function pullMyBookings() {
  if (!getToken()) return 0
  const rows = await api.myBookings()
  const mine = rows.map(mapBooking)

  produce('server.myBookings', (db) => {
    const ids = new Set(mine.map((b) => b.id))
    return {
      ...db,
      bookings: [
        ...db.bookings.filter(
          (b) => !ids.has(b.id) && !(b.serverBacked && b.userId === db.session?.userId)
        ),
        ...mine,
      ].sort((a, b) => new Date(a.startTime) - new Date(b.startTime)),
    }
  })
  return mine.length
}

/** Waitlist entries for the signed-in user, from the API. */
export async function pullWaitlist() {
  if (!getToken()) return 0
  const rows = await api.waitlist()
  produce('server.waitlist', (db) => ({ ...db, waitlist: rows.map(mapWaitlistEntry) }))
  return rows.length
}

/** Full refresh used on sign-in, on focus, and after any local mutation. */
export async function syncAll() {
  if (!getToken()) return
  try {
    await Promise.all([
      pullDirectory(),
      pullBookings({ full: true, authoritative: true }),
      pullNotifications().catch(() => 0),
      pullMyBookings().catch(() => 0),
      pullWaitlist().catch(() => 0),
    ])
  } catch (error) {
    setServerMeta({ connected: false, error: error.message })
    throw error
  }
}

export function disconnect() {
  stopLiveSync()
  setToken(null)
  produce('server.disconnect', (db) => ({
    ...db,
    server: { connected: false, mode: 'demo', lastSyncAt: null, error: null },
  }))
}

/**
 * Poll the narrow window. Supabase Realtime is enabled on `bookings`, but the
 * browser would need a real Supabase session JWT (with the anon key) to
 * subscribe; the demo bearer tokens are not accepted there, so polling is the
 * transport that actually works today.
 */
export function startLiveSync({ intervalMs = DEFAULT_POLL_MS } = {}) {
  stopLiveSync()
  const tick = async () => {
    if (inFlight) return
    if (typeof document !== 'undefined' && document.hidden) return
    inFlight = true
    try {
      await Promise.all([
        pullBookings({ full: false }),
        pullNotifications().catch(() => 0),
      ])
    } catch (error) {
      setServerMeta({ connected: false, error: error.message })
    } finally {
      inFlight = false
    }
  }

  pollTimer = window.setInterval(tick, intervalMs)

  const onVisible = () => {
    if (!document.hidden) syncAll().catch(() => {})
  }
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onVisible)

  return () => {
    stopLiveSync()
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', onVisible)
  }
}

export function stopLiveSync() {
  if (pollTimer) {
    window.clearInterval(pollTimer)
    pollTimer = null
  }
}

export function isServerMode() {
  return Boolean(getToken()) || getState().server?.mode === 'server'
}

/** Human-readable connection state for the status pill. */
export function serverStatus(db = getState()) {
  const meta = db.server ?? {}
  return {
    mode: meta.mode ?? 'demo',
    connected: Boolean(meta.connected),
    error: meta.error ?? null,
    lastSyncAt: meta.lastSyncAt ?? null,
    label: meta.mode === 'server' ? 'live · server' : 'demo data',
  }
}