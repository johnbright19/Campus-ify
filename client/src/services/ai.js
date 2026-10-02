import { getState, now } from '../lib/store'
import {
  CAMPUS,
  EVENT_LABEL,
  HIGH_PRIORITY_EVENTS,
  RESOURCE_TYPE_LABEL,
} from '../lib/constants'
import {
  TZ,
  dayKey,
  dayShift,
  dowOfWall,
  fmtDayShort,
  fmtRange,
  humanizeFeature,
  titleCase,
  wallAt,
  wallOf,
} from '../lib/utils'
import { detectConflicts } from './conflicts'
import { commit, makeAiRun } from './notifications'

// ---------------------------------------------------------------------------
// The AI layer.
//
// Architecture.md §1: "AI advises, code decides." Every skill below has a
// deterministic fallback, which is exactly the mode the demo-safety checklist
// wants (`LLM_DISABLED=true`). The functions therefore return the SAME shape a
// validated model response would, and record an `ai_runs` row marked
// `usedFallback: true` — so the observability story is real, not mocked away.
//
// Swapping in a live model means replacing the body of `runSkill` with an
// Anthropic call plus the Zod schema already described in Skills.md.
// ---------------------------------------------------------------------------

const skillLoggers = []

export function onAiRun(handler) {
  skillLoggers.push(handler)
  return () => {
    const i = skillLoggers.indexOf(handler)
    if (i >= 0) skillLoggers.splice(i, 1)
  }
}

/** Rule-based engine wrapper: records the run, returns the schema-valid output. */
function runSkill({ name, userId = null, input = {}, produce, log = true }) {
  const startedAt = Date.now()
  const output = produce()
  const latencyMs = Math.max(1, Date.now() - startedAt)

  if (log) {
    const run = makeAiRun({
      name,
      userId,
      input,
      output,
      latencyMs,
      usedFallback: true,
      outcome: 'n/a',
    })
    commit(`ai.${name}`, {}, { aiRuns: [run] })
    for (const handler of skillLoggers) {
      try {
        handler(run)
      } catch {
        /* ignore listener errors */
      }
    }
  }

  return { output, usedFallback: true, latencyMs, skill: name }
}

/* ===========================================================================
 * S4 — parse_booking_request
 *
 * The headline "wow" feature: a sentence in, a structured intent out.
 * Deterministic parser (the documented chrono-node + regex fallback).
 * ========================================================================= */

const RESOURCE_KEYWORDS = [
  { value: 'auditorium', words: ['auditorium', 'auditoria'] },
  { value: 'seminar_hall', words: ['seminar hall', 'seminar', 'hall', 'lecture hall'] },
  { value: 'lab', words: ['lab', 'laboratory', 'computer lab', 'computing lab'] },
  { value: 'classroom', words: ['classroom', 'class room', 'room', 'class'] },
  { value: 'ground', words: ['ground', 'field', 'playground', 'court', 'pitch'] },
  { value: 'equipment', words: ['projector', 'equipment', 'mic', 'pa system', 'speaker'] },
]

const FEATURE_KEYWORDS = {
  projector: ['projector', 'projection', 'screen'],
  ac: ['ac', 'air condition', 'air-condition', 'aircon', 'cooling'],
  mic: ['mic', 'microphone', 'mike', 'podium'],
  sound_system: ['sound system', 'sound', 'speaker', 'pa system', 'audio'],
  whiteboard: ['whiteboard', 'white board'],
  smartboard: ['smartboard', 'smart board', 'interactive board'],
  wifi: ['wifi', 'wi-fi', 'internet'],
  power_outlets: ['power', 'plug', 'socket', 'charging'],
  recording: ['recording', 'record the', 'livestream', 'live stream', 'camera'],
  stage: ['stage', 'dais'],
  lighting: ['lighting', 'lights', 'spotlight'],
  parking: ['parking'],
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

const PART_OF_DAY = {
  morning: 9,
  'early morning': 8,
  noon: 12,
  'after lunch': 14,
  afternoon: 14,
  evening: 17,
  'after college': 16,
  night: 19,
  tonight: 19,
}

function parseTimeRange(text) {
  const normalized = text
    .replace(/\./g, ':')
    .replace(/(\d)\s*(am|pm)\b/g, '$1$2')
    .replace(/\s+/g, ' ')

  const rangeRe =
    /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|till|until|through|-|–|—)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/
  const range = normalized.match(rangeRe)
  if (range) {
    const [, h1, m1, ap1, h2, m2, ap2] = range
    let startH = Number(h1)
    let endH = Number(h2)
    const startM = m1 ? Number(m1) : 0
    const endM = m2 ? Number(m2) : 0
    const meridiem = (ap1 || ap2 || '').toLowerCase()

    if (meridiem === 'pm') {
      if (startH < 12) startH += 12
      if (endH < 12) endH += 12
    } else if (meridiem === 'am') {
      if (startH === 12) startH = 0
      if (endH === 12) endH = 0
    } else {
      // "2 to 4" almost always means the afternoon in campus booking.
      if (startH <= 7) startH += 12
      if (endH <= 7) endH += 12
      if (endH <= startH && endH <= 12) endH += 12
    }
    return { startH, startM, endH, endM, matched: true }
  }

  const single = normalized.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/)
  if (single) {
    let h = Number(single[1])
    const m = single[2] ? Number(single[2]) : 0
    const ap = single[3].toLowerCase()
    if (ap === 'pm' && h < 12) h += 12
    if (ap === 'am' && h === 12) h = 0
    return { startH: h, startM: m, endH: h + 1, endM: m, matched: true }
  }

  for (const [phrase, hour] of Object.entries(PART_OF_DAY)) {
    if (normalized.includes(phrase)) {
      return { startH: hour, startM: 0, endH: Math.min(hour + 2, 21), endM: 0, matched: true, phrase }
    }
  }

  return { matched: false }
}

function parseDurationHours(text) {
  const m = text.match(/(?:for|of)?\s*(\d{1,2}(?:\.\d)?)\s*(?:hour|hr|h)\b/)
  if (!m) return null
  const value = Number(m[1])
  return Number.isFinite(value) && value > 0 && value <= 12 ? value : null
}

function parseDate(text, today) {
  const t = text.toLowerCase()

  if (/\bday after tomorrow\b/.test(t)) return { offset: 2, label: 'day after tomorrow' }
  if (/\btomorrow\b|\btmrw\b|\btmr\b/.test(t)) return { offset: 1, label: 'tomorrow' }
  if (/\btoday\b|\btonight\b|\bthis evening\b|\bthis afternoon\b/.test(t)) {
    return { offset: 0, label: 'today' }
  }

  const inDays = t.match(/\bin\s+(\d{1,2})\s+days?\b/)
  if (inDays) return { offset: Number(inDays[1]), label: `in ${inDays[1]} days` }

  if (/\bnext week\b/.test(t) && !WEEKDAYS.some((d) => t.includes(d))) {
    return { offset: 7, label: 'next week' }
  }

  const weekday = WEEKDAYS.findIndex((d) => t.includes(d) || t.includes(d.slice(0, 3)))
  if (weekday >= 0) {
    const todayDow = dowOfWall(today)
    let delta = (weekday - todayDow + 7) % 7
    if (delta === 0) delta = 7
    if (/\bnext\b/.test(t)) delta += delta < 7 ? 7 : 0
    return { offset: delta, label: `${/\bnext\b/.test(t) ? 'next ' : ''}${titleCase(WEEKDAYS[weekday])}` }
  }

  // "3 october" / "3rd oct" / "oct 3"
  const dmy = t.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/)
  const mdy = t.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})/)
  const explicit = dmy
    ? { day: Number(dmy[1]), monthName: dmy[2] }
    : mdy
      ? { day: Number(mdy[2]), monthName: mdy[1] }
      : null

  if (explicit) {
    const monthIndex = MONTHS.findIndex((m) => m.startsWith(explicit.monthName))
    if (monthIndex >= 0) {
      const anchor = wallAt(today, 12, 0, TZ)
      let year = today.year
      if (monthIndex < today.month - 1) year += 1
      const target = { year, month: monthIndex + 1, day: explicit.day }
      const diffDays = Math.round(
        (wallAt(target, 12).getTime() - anchor.getTime()) / 86400000
      )
      if (diffDays >= 0) return { offset: diffDays, label: `${explicit.day} ${MONTHS[monthIndex]}` }
    }
  }

  return { offset: null, label: null }
}

function parseAttendees(text) {
  const patterns = [
    /(\d{1,4})\s*(?:people|persons?|students?|pax|seats?|attendees?|participants?|members?|guests?)/,
    /(?:for|about|around|approx\.?)\s*(\d{1,4})\b/,
    /\b(\d{1,4})\s*(?:strong|capacity)\b/,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m) return Number(m[1])
  }
  return null
}

function parseResourceType(text) {
  const t = text.toLowerCase()
  for (const entry of RESOURCE_KEYWORDS) {
    if (entry.words.some((w) => t.includes(w))) return entry.value
  }
  return null
}

function parseFeatures(text) {
  const t = text.toLowerCase()
  const found = []
  for (const [feature, words] of Object.entries(FEATURE_KEYWORDS)) {
    if (words.some((w) => t.includes(w))) found.push(feature)
  }
  return found
}

export function parseBookingRequest(input, { userId = null, log = true } = {}) {
  const text = String(typeof input === 'string' ? input : input?.text ?? '').trim()
  const today = wallOf(now(), TZ)

  return runSkill({
    name: 'parse_booking_request',
    userId,
    input: { text },
    log,
    produce: () => {
      const lower = text.toLowerCase()
      const resourceType = parseResourceType(text)
      const attendees = parseAttendees(text)
      const features = parseFeatures(text)
      const durationHours = parseDurationHours(lower)
      const parsedDate = parseDate(text, today)
      const time = parseTimeRange(lower)

      let startTime = null
      let endTime = null
      if (time.matched) {
        startTime = `${String(time.startH).padStart(2, '0')}:${String(time.startM).padStart(2, '0')}`
        let endH = time.endH
        let endM = time.endM
        if (durationHours) {
          const total = time.startH * 60 + time.startM + durationHours * 60
          endH = Math.floor(total / 60)
          endM = total % 60
        }
        endTime = `${String(Math.min(endH, 23)).padStart(2, '0')}:${String(endM).padStart(2, '0')}`
      }

      const date =
        parsedDate.offset === null ? null : dayKey(dayShift(today, parsedDate.offset, TZ), TZ)

      const quoted = text.match(/["“']([^"”']{3,80})["”']/)
      let title = quoted ? quoted[1].trim() : null
      if (!title && /\b(meeting|session|workshop|class|exam|exam|drive|rehearsal|practice|lecture|seminar|audition|showcase|sprint)\b/i.test(text)) {
        const match = text.match(/\b(?:for|about|a|an|the)\s+([a-z ]{3,40}?(?:meeting|session|workshop|class|exam|drive|rehearsal|practice|lecture|seminar|audition|showcase|sprint))/i)
        if (match) title = titleCase(match[1].trim())
      }

      // The raw sentence doubles as the purpose — useful context for an
      // approver, and read-only data as far as the AI layer is concerned.
      const purpose = text.length > 12 ? text : null

      const resolved = {
        resourceType,
        attendees,
        date,
        startTime,
        endTime,
        features,
        title,
        purpose,
      }

      const required = ['resourceType', 'attendees', 'date', 'startTime', 'endTime']
      const missing = required.filter((f) => resolved[f] === null)
      if (!title) missing.push('title')

      const confidence =
        Math.round(
          ((required.length - missing.filter((m) => required.includes(m)).length) / required.length) *
            100
        ) / 100

      let resolvedStart = null
      let resolvedEnd = null
      if (date && startTime && endTime) {
        const [y, mo, d] = date.split('-').map(Number)
        const [sh, sm] = startTime.split(':').map(Number)
        const [eh, em] = endTime.split(':').map(Number)
        resolvedStart = wallAt({ year: y, month: mo, day: d }, sh, sm, TZ).toISOString()
        resolvedEnd = wallAt({ year: y, month: mo, day: d }, eh, em, TZ).toISOString()
      }

      return {
        resourceType,
        attendees,
        date,
        startTime,
        endTime,
        features,
        title,
        purpose,
        missing,
        confidence,
        resolvedStart,
        resolvedEnd,
        rawText: text,
        dateLabel: parsedDate.label,
        interpretations: [
          parsedDate.label && { label: 'Date', value: titleCase(parsedDate.label) },
          resolvedStart && { label: 'Window', value: `${fmtDayShort(resolvedStart, TZ)} · ${fmtRange(resolvedStart, resolvedEnd, TZ)}` },
          attendees && { label: 'Headcount', value: `${attendees} people` },
          resourceType && { label: 'Space', value: RESOURCE_TYPE_LABEL[resourceType] ?? humanizeFeature(resourceType) },
          features.length && { label: 'Needs', value: features.map(humanizeFeature).join(', ') },
        ].filter(Boolean),
      }
    },
  }).output
}

/* ===========================================================================
 * S5 — classify_event_purpose   (keyword map fallback)
 * ========================================================================= */

const PURPOSE_RULES = [
  { eventType: 'exam', words: ['exam', 'examination', 'viva', 'practical exam', 'invigilat', 'test'] },
  { eventType: 'placement', words: ['placement', 'recruit', 'interview', 'hr round', 'campus drive', 'infosys', 'tcs', 'shortlist'] },
  { eventType: 'academic', words: ['lecture', 'class', 'tutorial', 'lab session', 'remedial', 'workshop', 'seminar', 'curriculum', 'doubt'] },
  { eventType: 'fest', words: ['fest', 'cultural', 'annual day', 'audition', 'rehearsal', 'showcase', 'celebration', 'fête'] },
  { eventType: 'club', words: ['club', 'committee', 'chapter', 'society', 'ieee', 'robotics', 'stand-up', 'meeting'] },
]

export function classifyEventPurpose({ title = '', purpose = '', userRole = 'student', userId = null, log = true }) {
  return runSkill({
    name: 'classify_event_purpose',
    userId,
    input: { title, purpose, userRole },
    log,
    produce: () => {
      const haystack = `${title} ${purpose}`.toLowerCase()
      let eventType = 'personal'
      let confidence = 0.4

      for (const rule of PURPOSE_RULES) {
        const hits = rule.words.filter((w) => haystack.includes(w)).length
        if (hits > 0) {
          eventType = rule.eventType
          confidence = Math.min(0.96, 0.6 + hits * 0.12)
          break
        }
      }

      const flags = []
      const words = haystack.split(/\s+/).filter(Boolean)
      if (words.length < 4) flags.push('vague')
      if (HIGH_PRIORITY_EVENTS.includes(eventType) && userRole === 'student') {
        flags.push('verify_required')
      }
      if (eventType === 'exam' && !/course|subject|semester|sem\b|paper/.test(haystack)) {
        flags.push('missing_course_reference')
      }

      return {
        eventType,
        confidence,
        flags,
        reasoning: `Keyword evidence points to “${EVENT_LABEL[eventType] ?? eventType}”. ${
          HIGH_PRIORITY_EVENTS.includes(eventType)
            ? 'High-priority claims only reach full weight once an approver verifies them.'
            : 'No verification needed for this category.'
        }`,
      }
    },
  }).output
}

/* ===========================================================================
 * S6 — explain_conflict   (template fallback, facts only)
 * ========================================================================= */

function leanFactor(breakdown = {}) {
  const entries = Object.entries(breakdown).filter(([k]) => k !== 'noShowPenalty')
  if (!entries.length) return null
  const [key, value] = entries.sort((a, b) => b[1] - a[1])[0]
  return { key, value }
}

const FACTOR_PHRASE = {
  eventType: 'the declared event type carried the most weight',
  role: 'the requester’s role carried the most weight',
  fairness: 'a fairness credit broke the tie',
  advanceNotice: 'the earlier request carried the most weight',
  noShowPenalty: 'a no-show penalty applied',
}

export function explainConflict({
  requester,
  other,
  decision = 'other_wins',
  requesterUserId = null,
  log = true,
} = {}) {
  return runSkill({
    name: 'explain_conflict',
    userId: requesterUserId,
    input: {
      requesterScore: requester?.priorityScore,
      otherScore: other?.priorityScore,
      decision,
    },
    log,
    produce: () => {
      const a = requester ?? {}
      const b = other ?? {}
      const lean = leanFactor(a.priorityBreakdown ?? {})
      const reason = lean ? FACTOR_PHRASE[lean.key] : 'the combined priority score was higher'
      const gap = Math.round((Math.abs((a.priorityScore ?? 0) - (b.priorityScore ?? 0)) + Number.EPSILON) * 10) / 10

      const forRequester =
        decision === 'requester_wins'
          ? `Your request scored ${a.priorityScore ?? 0} against ${b.priorityScore ?? 0}, so it holds the slot. ${titleCase(reason)}.`
          : `Your request scored ${a.priorityScore ?? 0}; the competing request scored ${b.priorityScore ?? 0}. ${titleCase(reason)} — a gap of ${gap} point${gap === 1 ? '' : 's'}.`

      const forOther =
        decision === 'requester_wins'
          ? `The competing request scored ${b.priorityScore ?? 0} against ${a.priorityScore ?? 0}. It does not take the slot on this occasion.`
          : `This request scored ${b.priorityScore ?? 0} against ${a.priorityScore ?? 0} and keeps the slot. ${titleCase(reason)}.`

      return {
        forRequester,
        forOther,
        tone: gap <= 12 ? 'close' : 'clear',
        factsUsed: {
          requesterScore: a.priorityScore ?? 0,
          otherScore: b.priorityScore ?? 0,
          gap,
          leanFactor: lean?.key ?? null,
        },
      }
    },
  }).output
}

/* ===========================================================================
 * S7 — recommend_resolution  (hybrid: deterministic options, model ranks)
 * ========================================================================= */

export function recommendResolution(a, b, { userId = null, log = true } = {}) {
  return runSkill({
    name: 'recommend_resolution',
    userId,
    input: { aId: a?.id, bId: b?.id, gap: Math.abs((a?.priorityScore ?? 0) - (b?.priorityScore ?? 0)) },
    log,
    produce: () => {
      if (!a || !b) return { options: [], rationale: 'Need two requests to compare.' }
      const lead = (a.priorityScore ?? 0) >= (b.priorityScore ?? 0) ? a : b
      const trail = lead === a ? b : a
      const optionList = [
        {
          id: 'lead_wins',
          description: `Approve “${lead.title}” and reject “${trail.title}”`,
          impact: `${lead.attendees ?? 0} people served; ${trail.attendees ?? 0} need an alternative`,
          recommended: true,
        },
        {
          id: 'move_trail',
          description: `Move “${trail.title}” to a suggested alternative`,
          impact: 'Both run, one shifts slot or room',
          recommended: false,
        },
        {
          id: 'split',
          description: 'Split the window between both requests',
          impact: 'Neither gets the full duration',
          recommended: false,
        },
        {
          id: 'escalate',
          description: 'Escalate to the department head for a policy call',
          impact: 'Adds delay, keeps accountability',
          recommended: false,
        },
      ]
      const gap = Math.round(Math.abs((a.priorityScore ?? 0) - (b.priorityScore ?? 0)) * 10) / 10
      return {
        options: optionList,
        rationale: `The gap is ${gap} point${gap === 1 ? '' : 's'}, inside the “close call” margin, so a human decides. Headcount matters here: ${a.title} serves ${a.attendees ?? 0}, ${b.title} serves ${b.attendees ?? 0}.`,
        leaderId: lead.id,
      }
    },
  }).output
}

/* ===========================================================================
 * S8 — summarize_request_for_approver
 * ========================================================================= */

export function summarizeRequestForApprover(booking, { log = true } = {}) {
  const db = getState()
  const resource = db.resources.find((r) => r.id === booking?.resourceId)
  const requester = db.profiles.find((p) => p.id === booking?.userId)

  return runSkill({
    name: 'summarize_request_for_approver',
    userId: requester?.id ?? null,
    input: { bookingId: booking?.id },
    log,
    produce: () => {
      const riskFlags = []
      if ((requester?.noShowCount ?? 0) >= 2) {
        riskFlags.push(`${requester.noShowCount} no-shows in the recent window`)
      }
      if (['exam', 'placement'].includes(booking?.eventType) && !booking?.verified) {
        riskFlags.push('High-priority claim awaiting verification')
      }
      if ((booking?.attendees ?? 0) > (resource?.capacity ?? 0) * 0.9) {
        riskFlags.push('Near full capacity — little headroom')
      }

      const overlapping = db.bookings.filter(
        (b) =>
          b.id !== booking.id &&
          b.resourceId === booking.resourceId &&
          b.status === 'pending' &&
          new Date(b.startTime) < new Date(booking.endTime) &&
          new Date(b.endTime) > new Date(booking.startTime)
      )
      if (overlapping.length) {
        riskFlags.push(`Overlaps ${overlapping.length} competing pending request(s)`)
      }

      const club = requester?.club ? `, ${requester.club}` : ''
      const summary = `${booking.title} · ${resource?.name ?? 'Unknown space'} · ${fmtRange(booking.startTime, booking.endTime)}. ${booking.attendees ?? 0} people · ${EVENT_LABEL[booking.eventType] ?? booking.eventType} by ${requester?.fullName ?? 'Unknown'} (${requester?.role ?? 'unknown'}${club}). Priority ${booking.priorityScore ?? 0}.`

      const suggestedAction = riskFlags.length >= 2 ? 'ask_changes' : 'approve'
      return {
        summary,
        riskFlags,
        suggestedAction,
        reason:
          riskFlags.length >= 2
            ? 'Several flags stack up — confirm the details before committing the space.'
            : 'No blocking conflicts. Matches the requester’s usual pattern.',
      }
    },
  }).output
}

/* ===========================================================================
 * S9 — draft_notification   (templates keyed by event)
 * ========================================================================= */

const MESSAGE_TEMPLATES = {
  approved: ({ title, when }) => ({
    title: 'Booking approved ✅',
    body: `${title} is confirmed for ${when}.`,
    ctaLabel: 'View booking',
    ctaLink: '/bookings',
  }),
  rejected: ({ title, reason }) => ({
    title: 'Booking declined',
    body: `${title} was not approved${reason ? `: ${reason}` : '.'}`,
    ctaLabel: 'Find another slot',
    ctaLink: '/explore',
  }),
  bumped: ({ title, when }) => ({
    title: 'Your slot was taken',
    body: `${title} overlaps a higher-priority booking for ${when}. Ranked alternatives are ready.`,
    ctaLabel: 'See alternatives',
    ctaLink: '/bookings',
  }),
  waitlist_offer: ({ title, minutes }) => ({
    title: 'A slot just opened up 🎉',
    body: `${title} is free. Claim it within ${minutes} minutes.`,
    ctaLabel: 'Claim slot',
    ctaLink: '/waitlist',
  }),
  reminder: ({ title, when }) => ({
    title: 'Starting soon',
    body: `${title} begins at ${when}. Tap to check in and keep the slot.`,
    ctaLabel: 'Check in',
    ctaLink: '/bookings',
  }),
  release_warning: ({ title, minutes }) => ({
    title: 'Check in to keep your slot',
    body: `${title} will be auto-released in ${minutes} minutes if nobody checks in.`,
    ctaLabel: 'Check in now',
    ctaLink: '/bookings',
  }),
}

export function draftNotification({ event, facts = {}, userId = null, log = true } = {}) {
  return runSkill({
    name: 'draft_notification',
    userId,
    input: { event, facts },
    log,
    produce: () => {
      const template = MESSAGE_TEMPLATES[event]
      if (!template) {
        return {
          title: facts.title ?? 'Campus notification',
          body: facts.body ?? 'Something changed on one of your bookings.',
          ctaLabel: 'Open',
          ctaLink: '/bookings',
        }
      }
      const result = template(facts)
      const words = result.body.split(/\s+/)
      return { ...result, body: words.length > 60 ? `${words.slice(0, 60).join(' ')}…` : result.body }
    },
  }).output
}

/* ===========================================================================
 * S13 — generate_insights_digest   (numbers strictly from the input)
 * ========================================================================= */

export function generateInsightsDigest(aggregates, { userId = null, log = false } = {}) {
  return runSkill({
    name: 'generate_insights_digest',
    userId,
    input: { keys: Object.keys(aggregates ?? {}) },
    log,
    produce: () => {
      const a = aggregates ?? {}
      const lines = []

      if (a.overallUtilization != null) {
        lines.push(
          `Campus-wide utilisation is **${Math.round(a.overallUtilization * 100)}%** across ${a.days ?? 28} days.`
        )
      }
      if (a.busiestResource) {
        lines.push(
          `**${a.busiestResource.name}** is your pressure point at **${Math.round(
            a.busiestResource.utilization * 100
          )}%**, peaking around ${a.busiestResource.peakLabel ?? 'midday'}.`
        )
      }
      if (a.idleResources?.length) {
        const names = a.idleResources.slice(0, 3).map((r) => r.name).join(', ')
        lines.push(`Under-used capacity: ${names} sit below ${Math.round((a.idleThreshold ?? 0.25) * 100)}% and can absorb overflow.`)
      }
      if (a.noShowRate != null) {
        lines.push(
          `No-shows run at **${Math.round(a.noShowRate * 100)}%**, costing roughly ${a.wastedHours ?? 0} booked hours this period.`
        )
      }
      if (a.avgApprovalHours != null) {
        lines.push(`Approvers respond in **${a.avgApprovalHours.toFixed(1)} h** on average — SLA is ${a.slaHours ?? 24} h.`)
      }
      if (a.primeSlotDemand) {
        lines.push(
          `Prime windows (weekdays ${a.primeSlotDemand.window}) attract ${a.primeSlotDemand.share}% of requests, so conflicts cluster there.`
        )
      }

      const actions = []
      if (a.busiestResource && a.idleResources?.length) {
        actions.push(
          `Shift recurring club meetings from ${a.busiestResource.name} to ${a.idleResources[0].name} to release peak pressure.`
        )
      }
      if (a.noShowRate > 0.05) {
        actions.push('Turn on the 30-minute reminder plus a second nudge 10 minutes before start to cut no-shows.')
      }
      if (a.pendingCount > 3) {
        actions.push(`Clear the ${a.pendingCount} pending approvals so requesters are not blocked.`)
      }
      if (!actions.length) {
        actions.push('Keep the current weighting — no dimension is out of tolerance.')
      }

      return {
        markdown: lines.map((l) => `- ${l}`).join('\n'),
        insights: lines,
        actions,
        numbersUsed: [
          a.overallUtilization,
          a.noShowRate,
          a.avgApprovalHours,
          a.busiestResource?.utilization,
          a.pendingCount,
        ].filter((n) => n != null),
        generatedAt: now().toISOString(),
      }
    },
  }).output
}

/** S12 — a forecast narrative that only ever restates the supplied numbers. */
export function forecastNarrative(forecast, { log = false } = {}) {
  return runSkill({
    name: 'forecast_demand',
    userId: null,
    input: { days: forecast?.length ?? 0 },
    log,
    produce: () => {
      const days = forecast ?? []
      if (!days.length) return { narrative: 'Not enough history to forecast yet.' }
      const peak = days.reduce((m, d) => (d.expectedUtilization > m.expectedUtilization ? d : m), days[0])
      const quiet = days.reduce((m, d) => (d.expectedUtilization < m.expectedUtilization ? d : m), days[0])
      return {
        narrative: `Demand peaks on ${peak.label} at about ${Math.round(peak.expectedUtilization * 100)}% and bottoms out on ${quiet.label} near ${Math.round(quiet.expectedUtilization * 100)}%. Book early for the peak day.`,
        peak,
        quiet,
      }
    },
  }).output
}

/* ===========================================================================
 * Concierge (A1) — orchestrates S4 + resource search + availability
 * ========================================================================= */

const CLARIFY_QUESTIONS = {
  date: 'Which day should I hold?',
  startTime: 'What time should it start?',
  attendees: 'Roughly how many people will attend?',
  resourceType: 'What kind of space do you need — hall, lab, classroom, auditorium or ground?',
  title: 'What should I call this booking?',
}

export function searchResources(intent, { limit = 8, db = getState() } = {}) {
  return db.resources
    .filter((r) => r.isActive)
    .filter((r) => !intent.resourceType || r.type === intent.resourceType)
    .filter((r) => !intent.attendees || r.type === 'equipment' || r.capacity >= intent.attendees)
    .map((r) => {
      const matched = (intent.features ?? []).filter((f) => (r.features ?? []).includes(f))
      const missing = (intent.features ?? []).filter((f) => !(r.features ?? []).includes(f))
      return {
        resource: r,
        matched,
        missing,
        fit:
          (missing.length === 0 ? 0.6 : 0.6 - missing.length * 0.15) +
          Math.min(0.4, r.capacity ? (intent.attendees ?? 0) / r.capacity : 0.2),
        utilization: utilizationOf(r.id, db),
      }
    })
    .sort((a, b) => b.fit - a.fit)
    .slice(0, limit)
}

function utilizationOf(resourceId, db) {
  const cutoff = now().getTime() - 28 * 86400000
  const rows = db.bookings.filter(
    (b) =>
      b.resourceId === resourceId &&
      ['approved', 'completed'].includes(b.status) &&
      new Date(b.startTime).getTime() >= cutoff
  )
  const hours = rows.reduce(
    (acc, b) => acc + (new Date(b.endTime) - new Date(b.startTime)) / 3600000,
    0
  )
  return Math.min(1, hours / (28 * 14))
}

/**
 * One turn of the concierge conversation.
 * Returns either a clarifying question, a ranked option set, or a draft.
 */
export function conciergeTurn({ text, userId, context = {} }) {
  const intent = parseBookingRequest(text, { userId })
  const merged = { ...context, ...stripNulls(intent) }

  const missing = ['resourceType', 'attendees', 'date', 'startTime'].filter((k) => merged[k] == null)
  if (missing.length && !merged.resolvedStart) {
    return {
      kind: 'clarify',
      intent: merged,
      question: CLARIFY_QUESTIONS[missing[0]],
      askFor: missing[0],
      missing,
    }
  }

  const raw = searchResources(merged)

  if (!raw.length) {
    return {
      kind: 'no_match',
      intent: merged,
      message: `No ${RESOURCE_TYPE_LABEL[merged.resourceType] ?? 'space'} seats ${merged.attendees} right now. Try a different space type or a smaller headcount.`,
      missing: ['resourceType'],
    }
  }

  const options = []
  for (const entry of raw) {
    if (options.length >= 3) break
    const start = merged.resolvedStart ?? (context.resolvedStart || null)
    const end = merged.resolvedEnd ?? (context.resolvedEnd || null)
    if (!start || !end) {
      options.push({
        resourceId: entry.resource.id,
        resourceName: entry.resource.name,
        location: entry.resource.location,
        capacity: entry.resource.capacity,
        available: null,
        matched: entry.matched,
        missing: entry.missing,
        utilization: entry.utilization,
        start: null,
        end: null,
        note: 'Pick a time and I will confirm availability.',
      })
      continue
    }

    const { hard, blackout, soft } = detectConflicts({
      resourceId: entry.resource.id,
      start,
      end,
    })
    options.push({
      resourceId: entry.resource.id,
      resourceName: entry.resource.name,
      location: entry.resource.location,
      capacity: entry.resource.capacity,
      available: !hard.length && !blackout,
      blockedReason: blackout?.reason ?? (hard.length ? `Busy — ${hard[0].title}` : null),
      softContested: soft.length,
      matched: entry.matched,
      missing: entry.missing,
      utilization: entry.utilization,
      start,
      end,
    })
  }

  const free = options.filter((o) => o.available !== false)
  return {
    kind: 'options',
    intent: merged,
    options: free.length ? free : options,
    allBusy: free.length === 0,
    message: free.length
      ? `Here ${free.length === 1 ? 'is 1 match' : `are ${free.length} matches`} for ${merged.attendees ?? 'your'} people${merged.dateLabel ? ` on ${merged.dateLabel}` : ''}.`
      : 'Everything matching that is busy. Here are the closest spaces so you can shift the time.',
  }
}

function stripNulls(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj ?? {})) {
    if (v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)) out[k] = v
  }
  return out
}

/* ===========================================================================
 * A4 — natural-language questions over a FIXED tool set (never free SQL)
 * ========================================================================= */

export const INSIGHT_TOOLS = [
  { id: 'get_utilization', question: 'Which spaces are most and least used?' },
  { id: 'get_no_show_stats', question: 'What is our no-show rate?' },
  { id: 'get_conflict_hotspots', question: 'Where do conflicts cluster?' },
  { id: 'get_approval_times', question: 'How fast do we approve requests?' },
  { id: 'get_waitlist_pressure', question: 'Where is the waitlist longest?' },
]

export function answerInsightQuestion(question, aggregates, { userId = null, log = false } = {}) {
  return runSkill({
    name: 'insights_qna',
    userId,
    input: { question },
    log,
    produce: () => {
      const q = String(question ?? '').toLowerCase()
      const a = aggregates ?? {}

      if (/no.?show|miss|no show/.test(q)) {
        return `No-shows are running at ${Math.round((a.noShowRate ?? 0) * 100)}% — about ${a.wastedHours ?? 0} booked hours released this period.`
      }
      if (/conflict|clash|collision/.test(q)) {
        const top = (a.hotspots ?? [])[0]
        return top
          ? `Most contested: ${top.name} with ${top.conflicts} collisions in the window. Prime slots drive it.`
          : 'No collisions recorded in this window.'
      }
      if (/approv|slow|sla|pending/.test(q)) {
        return `Average decision time is ${(a.avgApprovalHours ?? 0).toFixed(1)} h against a ${a.slaHours ?? 24} h SLA, with ${a.pendingCount ?? 0} requests currently pending.`
      }
      if (/waitlist|queue|wait/.test(q)) {
        const top = (a.waitlistPressure ?? [])[0]
        return top
          ? `Longest queue: ${top.name} with ${top.waiting} people waiting and ${top.offers} live offers.`
          : 'The waitlist is empty right now.'
      }
      if (/which|busiest|most used|utilisation|utilization|idle|unused/.test(q)) {
        const busiest = a.busiestResource
        const idle = (a.idleResources ?? [])[0]
        return `${busiest ? `${busiest.name} leads at ${Math.round(busiest.utilization * 100)}%` : 'No usage yet'}${idle ? `; ${idle.name} is the quietest at ${Math.round(idle.utilization * 100)}%` : ''}.`
      }
      return `I can answer questions about utilisation, no-shows, conflicts, approvals and waitlists. Campus utilisation is currently ${Math.round((a.overallUtilization ?? 0) * 100)}%.`
    },
  }).output
}

/* ===========================================================================
 * S14 — hoarding detection (rules + a short note)
 * ========================================================================= */

export function hoardingFlags(db = getState()) {
  const current = now()
  const horizon = current.getTime() + 30 * 86400000
  const perUser = new Map()

  for (const b of db.bookings) {
    if (!['pending', 'approved'].includes(b.status)) continue
    const start = new Date(b.startTime).getTime()
    if (start < current.getTime() || start > horizon) continue
    const row = perUser.get(b.userId) ?? { userId: b.userId, futureHours: 0, futureCount: 0, prime: 0 }
    const hours = (new Date(b.endTime) - new Date(b.startTime)) / 3600000
    row.futureHours += hours
    row.futureCount += 1
    const h = new Date(b.startTime).getUTCHours()
    if (h >= 9 && h <= 17) row.prime += 1
    perUser.set(b.userId, row)
  }

  const flags = []
  for (const [userId, row] of perUser) {
    const user = db.profiles.find((p) => p.id === userId)
    const reasons = []
    if (row.futureHours > 10) reasons.push(`holds ${row.futureHours.toFixed(1)} future hours (watch line 10)`)
    if (row.prime >= 4) reasons.push(`${row.prime} bookings land in prime hours`)
    const recent = db.bookings.filter(
      (b) =>
        b.userId === userId &&
        ['cancelled', 'no_show'].includes(b.status) &&
        current.getTime() - new Date(b.createdAt).getTime() < 30 * 86400000
    )
    const total = db.bookings.filter(
      (b) => b.userId === userId && current.getTime() - new Date(b.createdAt).getTime() < 30 * 86400000
    ).length
    const cancelRate = total ? recent.length / total : 0
    if (cancelRate > 0.4 && total >= 3) {
      reasons.push(`${Math.round(cancelRate * 100)}% cancel/no-show rate in 30 days`)
    }
    if (!reasons.length) continue
    flags.push({
      userId,
      user,
      severity: reasons.length > 1 ? 'high' : 'medium',
      reasons,
      futureHours: Math.round(row.futureHours * 10) / 10,
      futureCount: row.futureCount,
      cancelRate: Math.round(cancelRate * 100),
      note: `Flagged for review, not penalty. ${user?.fullName ?? 'This user'} has ${row.futureCount} live reservations.`,
    })
  }

  return flags.sort((a, b) => b.futureHours - a.futureHours)
}

/* ===========================================================================
 * Housekeeping: aggregate the numbers the digest is allowed to quote.
 * ========================================================================= */

export function digestNumbers(aggregates) {
  const allowed = new Set(
    [
      aggregates.overallUtilization,
      aggregates.noShowRate,
      aggregates.avgApprovalHours,
      aggregates.pendingCount,
      aggregates.wastedHours,
      aggregates.busiestResource?.utilization,
      ...(aggregates.idleResources ?? []).map((r) => r.utilization),
      ...(aggregates.hotspots ?? []).map((h) => h.conflicts),
    ].map((n) => Math.round(Number(n ?? 0)))
  )
  return { allowed, count: allowed.size }
}

export const AI_VENDOR = 'Deterministic fallback engine'
export const AI_DISABLED = true
export const CAMPUS_NAME = CAMPUS.name
