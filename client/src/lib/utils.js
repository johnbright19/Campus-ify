import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { CAMPUS } from './constants'

export const cn = (...inputs) => twMerge(clsx(inputs))

export const clamp = (n, min, max) => Math.min(Math.max(n, min), max)

export const pad = (n, len = 2) => String(n).padStart(len, '0')

export const NBSP = '\u00a0'

/* ---------------------------------------------------------------------------
 * Timezone helpers
 *
 * Principle from Architecture.md §10: store UTC instants, present them in the
 * campus timezone. Rather than pulling in a tz library we use Intl, which is
 * exact for fixed-offset zones like IST.
 * ------------------------------------------------------------------------- */

export const TZ = CAMPUS.timezone

const partsFormatter = (tz) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
  })

const fmtCache = new Map()
const getParts = (tz) => {
  if (!fmtCache.has(tz)) fmtCache.set(tz, partsFormatter(tz))
  return fmtCache.get(tz)
}

/** Wall-clock fields of an instant as seen in `tz`. */
export function wallInTz(date, tz = TZ) {
  const d = date instanceof Date ? date : new Date(date)
  const out = {}
  for (const p of getParts(tz).formatToParts(d)) out[p.type] = p.value
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour) % 24,
    minute: Number(out.minute),
    second: Number(out.second),
    weekday: out.weekday,
  }
}

/** Milliseconds to add to a UTC instant to obtain its wall clock in `tz`. */
export function tzOffsetMs(date, tz = TZ) {
  const d = date instanceof Date ? date : new Date(date)
  const w = wallInTz(d, tz)
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second)
  return asUtc - d.getTime()
}

/** Build the UTC instant for a wall-clock time in `tz`. `month` is 1-based. */
export function zonedDate(
  { year, month, day, hour = 0, minute = 0, second = 0 },
  tz = TZ
) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second)
  const off1 = tzOffsetMs(new Date(guess), tz)
  let ts = guess - off1
  const off2 = tzOffsetMs(new Date(ts), tz)
  if (off2 !== off1) ts = guess - off2
  return new Date(ts)
}

/** Today's calendar date in the campus timezone. */
export function wallNow(tz = TZ) {
  const w = wallInTz(new Date(), tz)
  return { year: w.year, month: w.month, day: w.day }
}

/** Today's calendar date as seen from a (possibly time-travelled) instant. */
export function wallOf(date, tz = TZ) {
  const w = wallInTz(date, tz)
  return { year: w.year, month: w.month, day: w.day }
}

/** Shift a calendar date by whole days. Noon anchoring dodges DST edges. */
export function dayShift(wall, days, tz = TZ) {
  const anchor = zonedDate({ ...wall, hour: 12 }, tz)
  const moved = wallInTz(new Date(anchor.getTime() + days * 86400000), tz)
  return { year: moved.year, month: moved.month, day: moved.day }
}

/** Instant for `hour:minute` on a given calendar date. */
export function wallAt(wall, hour = 0, minute = 0, tz = TZ) {
  return zonedDate({ ...wall, hour, minute }, tz)
}

export function dayKey(input, tz = TZ) {
  const w = input && typeof input === 'object' && 'day' in input ? input : wallInTz(input, tz)
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`
}

export function monthKey(input, tz = TZ) {
  const w = input && typeof input === 'object' && 'day' in input ? input : wallInTz(input, tz)
  return `${w.year}-${pad(w.month)}`
}

/** Weekday index (0 = Sunday) for a calendar date. Calendar dates have a
 *  timezone-independent weekday, so plain UTC arithmetic is correct here. */
export function dowOfWall(wall) {
  return new Date(Date.UTC(wall.year, wall.month - 1, wall.day)).getUTCDay()
}

export function dowOf(date, tz = TZ) {
  return dowOfWall(wallOf(date, tz))
}

export function hourOf(date, tz = TZ) {
  return wallInTz(date, tz).hour
}

/** Minutes from midnight, campus time. */
export function minutesOfDay(date, tz = TZ) {
  const w = wallInTz(date, tz)
  return w.hour * 60 + w.minute
}

/* ---------------------------------------------------------------------------
 * Formatting
 * ------------------------------------------------------------------------- */

export const fmtTime = (date, tz = TZ) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(date))

export const fmtClock = (date, tz = TZ) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(date))

export const fmtDayShort = (date, tz = TZ) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(date))

export const fmtDateLong = (date, tz = TZ) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(date))

export const fmtMonthYear = (date, tz = TZ) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: tz, month: 'short', year: 'numeric' }).format(
    new Date(date)
  )

export const fmtRange = (start, end, tz = TZ) => `${fmtTime(start, tz)} – ${fmtTime(end, tz)}`

export const fmtDuration = (ms) => {
  const mins = Math.max(0, Math.round(ms / 60000))
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

export function fmtCountdown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${pad(m)}m`
  if (m > 0) return `${m}m ${pad(sec)}s`
  return `${sec}s`
}

export function fmtRelative(date, now = new Date(), tz = TZ) {
  const diff = new Date(date).getTime() - new Date(now).getTime()
  const abs = Math.abs(diff)
  const mins = Math.round(abs / 60000)
  const label =
    mins < 1
      ? 'just now'
      : mins < 60
        ? `${mins} min`
        : abs < 86400000
          ? `${Math.round(abs / 3600000)} h`
          : fmtDayShort(date, tz)
  if (mins < 1 && diff <= 0) return 'just now'
  if (mins < 1) return 'in a moment'
  return diff > 0 ? `in ${label}` : `${label} ago`
}

export const fmtPct = (n, digits = 0) => `${(n * 100).toFixed(digits)}%`

export const fmtScore = (n) => (Math.round(n * 10) / 10).toFixed(n % 1 === 0 ? 0 : 1)

/* ---------------------------------------------------------------------------
 * Misc helpers
 * ------------------------------------------------------------------------- */

let uidCounter = 0
export function uid(prefix = 'id') {
  uidCounter += 1
  return `${prefix}_${Date.now().toString(36)}${uidCounter.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 7)}`
}

/** Deterministic PRNG so demo data is identical on every machine. */
export function mulberry32(seed) {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)]
export const randInt = (min, max, rnd) => min + Math.floor(rnd() * (max - min + 1))

/** Milliseconds shared by two ranges ([) convention — touching = 0). */
export const overlapMs = (aStart, aEnd, bStart, bEnd) => {
  const s = Math.max(new Date(aStart).getTime(), new Date(bStart).getTime())
  const e = Math.min(new Date(aEnd).getTime(), new Date(bEnd).getTime())
  return Math.max(0, e - s)
}

export const overlaps = (aStart, aEnd, bStart, bEnd) =>
  new Date(aStart).getTime() < new Date(bEnd).getTime() &&
  new Date(aEnd).getTime() > new Date(bStart).getTime()

export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

export const titleCase = (s = '') => s.replace(/(^|[\s_-])(\w)/g, (m, a, b) => a + b.toUpperCase())

export const humanizeFeature = (f) =>
  titleCase(String(f).replace(/_/g, ' ')).replace(/\bWifi\b/, 'Wi-Fi').replace(/\bAc\b/, 'AC')

export const truncate = (s = '', n = 80) =>
  s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s

export const sum = (arr, fn = (x) => x) => arr.reduce((a, b) => a + fn(b), 0)

export const uniqueBy = (arr, keyFn) => {
  const seen = new Set()
  return arr.filter((x) => {
    const k = keyFn(x)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export const groupBy = (arr, keyFn) =>
  arr.reduce((acc, item) => {
    const k = keyFn(item)
    ;(acc[k] ||= []).push(item)
    return acc
  }, {})

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true

/** JSON-safe deep clone (structuredClone where available). */
export const deepClone = (value) =>
  typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value))
