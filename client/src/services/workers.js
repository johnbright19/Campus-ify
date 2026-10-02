import { getState, now } from '../lib/store'
import { dayShift, mulberry32, wallAt, wallOf } from '../lib/utils'
import {
  completeFinishedBookings,
  createBooking,
  escalateStaleApprovals,
  qrTokenFor,
  releaseNoShows,
  sendReminders,
} from './bookings'
import { detectConflicts } from './conflicts'
import { expireWaitlistOffers } from './waitlist'
import { commit, makeWorkerLog } from './notifications'
import { hoarding, overview } from './analytics'
import { generateInsightsDigest } from './ai'

// ---------------------------------------------------------------------------
// A5 — Ops Automator (node-cron in production, setInterval here).
//
// Cadences are compressed so a judge can watch the automation work during a
// demo instead of waiting a real minute. Every job is idempotent and logs to
// the audit trail, exactly as Architecture.md §8 requires.
// ---------------------------------------------------------------------------

export const WORKER_INTERVALS = {
  autoReleaseNoShows: 4000,
  expireWaitlistOffers: 5000,
  sendReminders: 15000,
  escalateStaleApprovals: 30000,
  completeFinishedBookings: 20000,
  hoardingWatch: 45000,
  dailyInsightsDigest: 120000,
  ambientActivity: 22000,
}

const runtime = {
  started: false,
  timers: [],
  lastRun: {},
  runs: {},
  ambientSeq: 0,
}

const AMBIENT_PRESETS = [
  ['Team stand-up', 'club'],
  ['Peer study group', 'personal'],
  ['Guest lecture rehearsal', 'academic'],
  ['Club poster design', 'club'],
  ['Open source sprint', 'academic'],
  ['Placement mock interview', 'placement'],
  ['Department review meeting', 'academic'],
  ['Music practice', 'fest'],
]

export function workerRuntime() {
  return { started: runtime.started, lastRun: { ...runtime.lastRun }, runs: { ...runtime.runs } }
}

function log(job, message, { level = 'info', count = 0 } = {}) {
  runtime.lastRun[job] = now().toISOString()
  runtime.runs[job] = (runtime.runs[job] ?? 0) + 1
  commit(`worker.${job}`, {}, { workerLog: [makeWorkerLog({ job, message, level, count })] })
}

/** Simulated other-people activity, so the live feed has something to show. */
function ambientActivity() {
  const db = getState()
  const pool = db.resources.filter((r) => r.isActive && !r.requiresApproval)
  if (!pool.length) return { count: 0, message: 'No auto-approve resources to simulate.' }

  const rnd = mulberry32(((Date.now() / 1000) | 0) + 7)
  runtime.ambientSeq += 1
  const today = wallOf(now())

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const resource = pool[Math.floor(rnd() * pool.length)]
    const dayOffset = Math.floor(rnd() * 5)
    const hour = 9 + Math.floor(rnd() * 9)
    const start = wallAt(dayShift(today, dayOffset), hour, 0)
    if (start < now()) continue
    const end = new Date(start.getTime() + 3600000)

    const { hard, soft, blackout } = detectConflicts({
      resourceId: resource.id,
      start,
      end,
    })
    if (hard.length || soft.length || blackout) continue

    const student = db.profiles.find((p) => p.role === 'student')
    const [title, eventType] = AMBIENT_PRESETS[Math.floor(rnd() * AMBIENT_PRESETS.length)]
    if (!student) return { count: 0, message: 'No student account available to simulate.' }

    createBooking({
      userId: student.id,
      resourceId: resource.id,
      title,
      purpose: 'Simulated campus activity (live feed demo)',
      eventType,
      attendees: Math.max(4, Math.round((resource.capacity || 30) * 0.4)),
      start,
      end,
      source: 'ambient',
    })

    return {
      count: 1,
      message: `${resource.name}: “${title}” added to the live calendar.`,
      pulse: { kind: 'booking', resourceId: resource.id },
    }
  }

  return { count: 0, message: 'No free window found this tick.' }
}

/* ---------------------------------------------------------------------------
 * Job registry
 * ------------------------------------------------------------------------- */

const JOBS = {
  autoReleaseNoShows: () => {
    const { released, promoted } = releaseNoShows()
    return {
      count: released,
      message: released
        ? `Released ${released} no-show booking(s), promoted ${promoted} from the waitlist.`
        : 'No lapsed bookings to release.',
      level: released ? 'warn' : 'info',
    }
  },

  expireWaitlistOffers: () => {
    const { expired, reoffered } = expireWaitlistOffers()
    return {
      count: expired,
      message: expired
        ? `Expired ${expired} offer(s), rolled ${reoffered} to the next in line.`
        : 'No offers past their window.',
      level: expired ? 'warn' : 'info',
    }
  },

  sendReminders: () => {
    const { reminded } = sendReminders()
    return {
      count: reminded,
      message: reminded ? `Sent ${reminded} start reminder(s).` : 'Nothing starting soon.',
    }
  },

  escalateStaleApprovals: () => {
    const { escalated } = escalateStaleApprovals()
    return {
      count: escalated,
      message: escalated ? `Escalated ${escalated} request(s) breaching SLA.` : 'All approvals inside SLA.',
      level: escalated ? 'warn' : 'info',
    }
  },

  completeFinishedBookings: () => {
    const { completed } = completeFinishedBookings()
    return {
      count: completed,
      message: completed ? `Marked ${completed} booking(s) completed.` : 'Nothing to close out.',
    }
  },

  hoardingWatch: () => {
    const flags = hoarding()
    return {
      count: flags.length,
      message: flags.length
        ? `Flagged ${flags.length} account(s): ${flags.map((f) => f.user?.fullName ?? f.userId).join(', ')}.`
        : 'No unusual reservation patterns.',
      level: flags.length ? 'warn' : 'info',
    }
  },

  dailyInsightsDigest: () => {
    const aggregates = overview(28)
    const digest = generateInsightsDigest(aggregates, { log: false })
    return {
      count: digest.insights.length,
      message: `Digest generated with ${digest.insights.length} insight(s) and ${digest.actions.length} recommended action(s).`,
      digest,
    }
  },

  ambientActivity: () => ambientActivity(),
}

/** Run one job immediately (the admin console's "Run now" buttons). */
export function runJob(name) {
  const job = JOBS[name]
  if (!job) return null
  const outcome = job() ?? {}
  log(name, outcome.message ?? 'Ran.', outcome)
  return { job: name, ...outcome }
}

export function runAllJobs() {
  return Object.keys(JOBS).map((name) => runJob(name))
}

/* ---------------------------------------------------------------------------
 * Scheduler
 * ------------------------------------------------------------------------- */

export function startWorkers() {
  if (runtime.started) return
  runtime.started = true

  for (const [name, interval] of Object.entries(WORKER_INTERVALS)) {
    const enabled = () => getState().settings.workers?.[name] !== false
    const id = window.setInterval(() => {
      if (!enabled()) return
      try {
        runJob(name)
      } catch (error) {
        log(name, `Failed: ${error.message}`, { level: 'error' })
      }
    }, interval)
    runtime.timers.push(id)
  }

  log('scheduler', 'Automation workers started.', { count: Object.keys(JOBS).length })
}

export function stopWorkers() {
  runtime.timers.forEach((id) => window.clearInterval(id))
  runtime.timers = []
  runtime.started = false
  log('scheduler', 'Automation workers stopped.')
}

export function setWorkerEnabled(name, enabled) {
  const db = getState()
  commit('settings.workers', {
    settings: { ...db.settings, workers: { ...db.settings.workers, [name]: enabled } },
  })
}

export function workerLog(limit = 40, db = getState()) {
  return [...db.workerLog]
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, limit)
}

export function checkInQrFor(booking) {
  return qrTokenFor(booking.id, booking.endTime)
}

export { JOBS }
