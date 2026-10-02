import { buildSeed, SCHEMA_VERSION } from './seed'

// ---------------------------------------------------------------------------
// The in-browser "database".
//
// This build ships without a server, so the store plays the role of Postgres:
// it holds every table, persists to localStorage, and exposes a change bus that
// stands in for Supabase Realtime. All writes go through services/ — components
// never mutate it directly. That keeps the exact same data flow as the real
// architecture, so swapping in `fetch('/api/...')` later is a drop-in change.
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'campusify:db'
const MAX_AGE_MS = 48 * 3600 * 1000

const listeners = new Set()
const eventBus = new Set()
let version = 0
let state = bootstrap()

function bootstrap() {
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        const usable =
          parsed?.meta?.schemaVersion === SCHEMA_VERSION &&
          Date.now() - Number(parsed.meta.seededAtMs ?? 0) < MAX_AGE_MS &&
          Array.isArray(parsed.bookings) &&
          Array.isArray(parsed.resources)
        if (usable) return parsed
      }
    } catch {
      /* corrupt cache — fall through to a fresh seed */
    }
  }
  const seeded = buildSeed()
  safeWrite(seeded)
  return seeded
}

function safeWrite(snapshot) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    /* quota or private mode — the app still works in memory */
  }
}

export function getState() {
  return state
}

export function getVersion() {
  return version
}

export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Bump the version so every live query refetches. */
export function emit(reason = 'change') {
  version += 1
  safeWrite(state)
  for (const listener of listeners) {
    try {
      listener(state, reason)
    } catch (error) {
      console.error('[store] listener failed', error)
    }
  }
  for (const handler of eventBus) {
    try {
      handler({ reason, state })
    } catch (error) {
      console.error('[store] event handler failed', error)
    }
  }
}

/** Shallow-merge a partial snapshot and notify subscribers. */
export function setState(partial) {
  state = { ...state, ...partial }
  emit('set')
  return state
}

/** Replace the whole snapshot (used by services that build new arrays). */
export function replaceState(next, reason = 'mutate') {
  state = next
  emit(reason)
  return state
}

/**
 * Atomic write: the producer receives the CURRENT snapshot, so services can
 * compose several table changes without ever clobbering a concurrent write.
 */
export function produce(reason, producer) {
  const next = producer(state)
  if (!next || next === state) return state
  return replaceState(next, reason)
}

/** Borrow the bus for transient UI signals (a pulse on the calendar, a toast). */
export function onEvent(handler) {
  eventBus.add(handler)
  return () => eventBus.delete(handler)
}

export function fireEvent(event) {
  for (const handler of eventBus) {
    try {
      handler(event)
    } catch (error) {
      console.error('[store] bus handler failed', error)
    }
  }
}

/* ---------------------------------------------------------------------------
 * Clock — services never call Date.now() directly.
 *
 * `clockOffsetMs` lets the demo fast-forward time from the operations console,
 * which is what makes the automation workers (no-show release, offer expiry)
 * actually fire on stage instead of waiting 30 real minutes.
 * ------------------------------------------------------------------------- */

export function now() {
  return new Date(Date.now() + (state.clockOffsetMs || 0))
}

export function realNow() {
  return new Date()
}

export function setClockOffset(ms) {
  setState({ clockOffsetMs: Math.max(0, ms) })
}

export function clockOffset() {
  return state.clockOffsetMs || 0
}

/* ---------------------------------------------------------------------------
 * Administrative helpers
 * ------------------------------------------------------------------------- */

export function resetDatabase() {
  state = buildSeed()
  emit('reset')
  return state
}

export function clearCache() {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
