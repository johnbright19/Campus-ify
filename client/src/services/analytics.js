import { getState, now } from '../lib/store'
import {
  HOUR_LABELS,
  WEEKDAY_LABELS,
} from '../lib/constants'
import {
  TZ,
  dayKey,
  dayShift,
  dowOf,
  dowOfWall,
  fmtDayShort,
  hourOf,
  overlaps,
  wallAt,
  wallOf,
} from '../lib/utils'
import { forecastNarrative, generateInsightsDigest, hoardingFlags } from './ai'

// ---------------------------------------------------------------------------
// Analytics.
//
// The SQL from Build.md §13 is expressed here in plain JavaScript over the same
// rows the API would return. Every number the AI digest quotes originates in
// one of these aggregates — nothing is invented downstream.
// ---------------------------------------------------------------------------

const OPEN = ['pending', 'approved']
const USED = ['approved', 'completed']
const DAY_HOURS = 14 // 07:00 → 21:00

function windowStart(days, at = now()) {
  return at.getTime() - days * 86400000
}

export function hoursOf(booking) {
  return Math.max(0, (new Date(booking.endTime) - new Date(booking.startTime)) / 3600000)
}

export function utilizationWindow(days = 28, db = getState()) {
  const from = windowStart(days)
  const perResource = db.resources.map((resource) => {
    const rows = db.bookings.filter(
      (b) => b.resourceId === resource.id && USED.includes(b.status) && new Date(b.startTime).getTime() >= from
    )
    const hours = rows.reduce((acc, b) => acc + hoursOf(b), 0)
    const future = db.bookings.filter(
      (b) =>
        b.resourceId === resource.id &&
        OPEN.includes(b.status) &&
        new Date(b.startTime).getTime() >= from
    ).length
    return {
      id: resource.id,
      name: resource.name,
      type: resource.type,
      location: resource.location,
      capacity: resource.capacity,
      hours: Math.round(hours * 10) / 10,
      bookings: rows.length,
      upcoming: future,
      utilization: Math.min(1, hours / (days * DAY_HOURS)),
    }
  })

  const totalHours = perResource.reduce((acc, r) => acc + r.hours, 0)
  const capacityHours = perResource.length * days * DAY_HOURS

  return {
    days,
    from: new Date(from).toISOString(),
    perResource: perResource.sort((a, b) => b.utilization - a.utilization),
    totalHours: Math.round(totalHours * 10) / 10,
    capacityHours,
    overallUtilization: capacityHours ? totalHours / capacityHours : 0,
  }
}

/** Resource × hour-of-day occupancy grid for the heatmap. */
export function heatmap(days = 28, db = getState()) {
  const from = windowStart(days)
  const hours = HOUR_LABELS
  const rows = db.resources.map((resource) => {
    const cells = hours.map(() => 0)
    const bookings = db.bookings.filter(
      (b) =>
        b.resourceId === resource.id &&
        USED.includes(b.status) &&
        new Date(b.startTime).getTime() >= from
    )
    for (const b of bookings) {
      const h = hourOf(b.startTime, TZ)
      const idx = hours.indexOf(h)
      if (idx >= 0) cells[idx] += 1
    }
    const total = cells.reduce((a, b) => a + b, 0)
    const peakIdx = cells.reduce((best, v, i) => (v > cells[best] ? i : best), 0)
    return {
      id: resource.id,
      name: resource.name,
      type: resource.type,
      cells,
      total,
      peakHour: hours[peakIdx],
      peakCount: cells[peakIdx] ?? 0,
    }
  })

  const max = Math.max(1, ...rows.flatMap((r) => r.cells))
  return { hours, rows, max, days }
}

/** Bookings by weekday — the shape of the campus week. */
export function weekdayProfile(days = 28, db = getState()) {
  const from = windowStart(days)
  const counts = WEEKDAY_LABELS.map((label, index) => ({ label, index, bookings: 0, hours: 0 }))
  for (const b of db.bookings) {
    if (!USED.includes(b.status)) continue
    if (new Date(b.startTime).getTime() < from) continue
    const dow = dowOf(b.startTime, TZ)
    counts[dow].bookings += 1
    counts[dow].hours += hoursOf(b)
  }
  return counts.map((c) => ({ ...c, hours: Math.round(c.hours * 10) / 10 }))
}

/** 7-day demand forecast from the trailing three weeks, same weekday. */
export function demandForecast(db = getState()) {
  const today = wallOf(now(), TZ)
  const profile = weekdayProfile(21, db)
  const maxPerDay = Math.max(1, ...profile.map((p) => p.bookings))
  const out = []

  for (let i = 0; i < 7; i += 1) {
    const wall = dayShift(today, i, TZ)
    const dow = dowOfWall(wall)
    const share = (profile[dow]?.bookings ?? 0) / 3 / maxPerDay
    out.push({
      date: dayKey(wall, TZ),
      label: fmtDayShort(wallAt(wall, 12, 0, TZ), TZ),
      weekday: WEEKDAY_LABELS[dow],
      expectedUtilization: Math.min(1, Math.max(0.05, share)),
      historicalBookings: profile[dow]?.bookings ?? 0,
    })
  }

  const narrative = forecastNarrative(out, { log: false })
  return { days: out, narrative: narrative.narrative, peak: narrative.peak, quiet: narrative.quiet }
}

/** Where do collisions actually happen? */
export function conflictHotspots(days = 28, db = getState()) {
  const from = windowStart(days)
  const perResource = new Map()

  const active = db.bookings.filter(
    (b) => OPEN.includes(b.status) && new Date(b.endTime).getTime() >= from
  )

  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const a = active[i]
      const b = active[j]
      if (a.resourceId !== b.resourceId) continue
      if (!overlaps(a.startTime, a.endTime, b.startTime, b.endTime)) continue
      const row = perResource.get(a.resourceId) ?? { resourceId: a.resourceId, conflicts: 0, prime: 0 }
      row.conflicts += 1
      const hour = hourOf(a.startTime, TZ)
      if (hour >= 10 && hour <= 16) row.prime += 1
      perResource.set(a.resourceId, row)
    }
  }

  return [...perResource.values()]
    .map((row) => {
      const resource = db.resources.find((r) => r.id === row.resourceId)
      return { ...row, name: resource?.name ?? 'Unknown', type: resource?.type }
    })
    .sort((a, b) => b.conflicts - a.conflicts)
}

export function waitlistPressure(db = getState()) {
  const perResource = new Map()
  for (const w of db.waitlist) {
    if (!['waiting', 'offered'].includes(w.status)) continue
    const row = perResource.get(w.resourceId) ?? { resourceId: w.resourceId, waiting: 0, offers: 0 }
    if (w.status === 'waiting') row.waiting += 1
    if (w.status === 'offered') row.offers += 1
    perResource.set(w.resourceId, row)
  }
  return [...perResource.values()]
    .map((row) => {
      const resource = db.resources.find((r) => r.id === row.resourceId)
      return { ...row, name: resource?.name ?? 'Unknown' }
    })
    .sort((a, b) => b.waiting - a.waiting)
}

/** Decision latency: created → the approving audit entry. */
export function approvalLatency(db = getState()) {
  const inner = []
  for (const log of db.auditLogs) {
    if (log.action !== 'booking.approve' || !log.entityId) continue
    const booking = db.bookings.find((b) => b.id === log.entityId)
    if (!booking) continue
    const delta = (new Date(log.createdAt) - new Date(booking.createdAt)) / 3600000
    if (delta >= 0 && delta < 240) inner.push(delta)
  }
  if (!inner.length) {
    const fallback = db.bookings
      .filter((b) => b.status === 'approved' && new Date(b.updatedAt) > new Date(b.createdAt))
      .map((b) => (new Date(b.updatedAt) - new Date(b.createdAt)) / 3600000)
      .filter((h) => h >= 0 && h < 240)
    inner.push(...fallback)
  }
  if (!inner.length) return { avgHours: 6.5, samples: 0, estimated: true }
  const avg = inner.reduce((a, b) => a + b, 0) / inner.length
  return { avgHours: Math.round(avg * 10) / 10, samples: inner.length, estimated: false }
}

export function kpis(db = getState()) {
  const days = 28
  const from = windowStart(days)
  const bookings = db.bookings.filter((b) => new Date(b.startTime).getTime() >= from)
  const noShows = bookings.filter((b) => b.status === 'no_show')
  const finished = bookings.filter((b) => ['completed', 'no_show'].includes(b.status))

  const perDay = new Map()
  for (const b of bookings.filter((b) => OPEN.includes(b.status))) {
    const k = dayKey(b.startTime, TZ)
    perDay.set(k, (perDay.get(k) ?? 0) + 1)
  }
  const busiestDay = [...perDay.entries()].sort((a, b) => b[1] - a[1])[0] ?? null

  const liveNow = db.bookings.filter(
    (b) => b.status === 'approved' && new Date(b.startTime) <= now() && new Date(b.endTime) >= now()
  ).length

  const prime = bookings.filter((b) => {
    const h = hourOf(b.startTime, TZ)
    const dow = dowOf(b.startTime, TZ)
    return dow >= 1 && dow <= 5 && h >= 10 && h <= 16
  }).length

  return {
    windowDays: days,
    totalBookings: bookings.length,
    activeBookings: db.bookings.filter((b) => OPEN.includes(b.status)).length,
    pendingCount: db.bookings.filter((b) => b.status === 'pending').length,
    approvedCount: db.bookings.filter((b) => b.status === 'approved').length,
    completedCount: bookings.filter((b) => b.status === 'completed').length,
    noShowCount: noShows.length,
    noShowRate: finished.length ? noShows.length / finished.length : 0,
    wastedHours: Math.round(noShows.reduce((acc, b) => acc + hoursOf(b), 0) * 10) / 10,
    liveNow,
    primeSlotShare: bookings.length ? prime / bookings.length : 0,
    primeWindowLabel: '10:00–16:00',
    busiestDay: busiestDay ? { key: busiestDay[0], bookings: busiestDay[1] } : null,
    waitlistWaiting: db.waitlist.filter((w) => w.status === 'waiting').length,
    waitlistOffers: db.waitlist.filter((w) => w.status === 'offered').length,
    pendingWaitlistOffers: db.waitlist.filter(
      (w) => w.status === 'offered' && w.offerExpiresAt && new Date(w.offerExpiresAt) > now()
    ).length,
    checkInsToday: db.bookings.filter(
      (b) => b.checkedInAt && dayKey(b.checkedInAt, TZ) === dayKey(now(), TZ)
    ).length,
  }
}

/** The single bundle the dashboard, digest and Q&A all read from. */
export function overview(days = 28, db = getState()) {
  const util = utilizationWindow(days, db)
  const k = kpis(db)
  const hotspots = conflictHotspots(days, db)
  const latency = approvalLatency(db)
  const busy = util.perResource[0] ?? null

  // "Idle" has to be relative to the busiest space, otherwise a campus-wide
  // quiet week labels the pressure point itself as under-used.
  const idleThreshold = Math.max(0.1, Math.min(0.3, (busy?.utilization ?? 0) * 0.5))

  const aggregates = {
    days,
    overallUtilization: util.overallUtilization,
    totalHours: util.totalHours,
    capacityHours: util.capacityHours,
    perResource: util.perResource,
    busiestResource: busy
      ? {
          id: busy.id,
          name: busy.name,
          utilization: busy.utilization,
          hours: busy.hours,
          peakLabel: peakHourLabel(busy.id, db),
        }
      : null,
    idleResources: util.perResource
      .filter((r) => r.id !== busy?.id && r.utilization < idleThreshold)
      .map((r) => ({
        id: r.id,
        name: r.name,
        utilization: r.utilization,
      })),
    idleThreshold,
    noShowRate: k.noShowRate,
    noShowCount: k.noShowCount,
    wastedHours: k.wastedHours,
    avgApprovalHours: latency.avgHours,
    approvalSamples: latency.samples,
    slaHours: db.settings.approvalSlaHours,
    pendingCount: k.pendingCount,
    hotspots,
    waitlistPressure: waitlistPressure(db),
    primeSlotDemand: {
      window: k.primeWindowLabel,
      share: Math.round(k.primeSlotShare * 100),
    },
    kpis: k,
  }

  return aggregates
}

function peakHourLabel(resourceId, db) {
  const rows = heatmap(28, db).rows.find((r) => r.id === resourceId)
  if (!rows) return 'midday'
  return `${String(rows.peakHour).padStart(2, '0')}:00`
}

export function digest(days = 28, db = getState()) {
  const aggregates = overview(days, db)
  return generateInsightsDigest(aggregates, { log: false })
}

export function hoarding(days = 30, db = getState()) {
  void days
  return hoardingFlags(db)
}

export function auditFeed(limit = 60, db = getState()) {
  return [...db.auditLogs]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit)
    .map((entry) => ({
      ...entry,
      actor: db.profiles.find((p) => p.id === entry.actorId) ?? null,
    }))
}

export function aiFeed(limit = 40, db = getState()) {
  return [...db.aiRuns]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit)
}

/** Monthly approved hours per group — what the fairness factor reads from. */
export function fairnessLedger(db = getState()) {
  const byGroup = new Map()
  for (const b of db.bookings) {
    if (!USED.includes(b.status)) continue
    const user = db.profiles.find((p) => p.id === b.userId)
    const group = user?.club ?? user?.department ?? 'Unassigned'
    byGroup.set(group, (byGroup.get(group) ?? 0) + hoursOf(b))
  }
  return [...byGroup.entries()]
    .map(([group, hours]) => ({ group, hours: Math.round(hours * 10) / 10 }))
    .sort((a, b) => b.hours - a.hours)
}
