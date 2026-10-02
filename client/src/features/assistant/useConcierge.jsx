import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  classifyEventPurpose,
  conciergeTurn,
  parseBookingRequest,
  searchResources,
} from '../../services/ai'
import { createBooking, inspectAvailability, previewScore } from '../../services/bookings'
import { bestTimesFor } from '../../services/suggestions'
import { getState } from '../../lib/store'
import { fmtDayShort, fmtRange, humanizeFeature, uid } from '../../lib/utils'
import { EVENT_LABEL, RESOURCE_TYPE_LABEL } from '../../lib/constants'
import { useToast } from '../../app/ToastProvider'

const GREETING = {
  id: 'greeting',
  role: 'agent',
  kind: 'text',
  text: 'Hi — describe the booking in plain English and I will find the space, check availability and price your priority score. I only draft; you confirm.',
}

const QUICK_STARTS = [
  'Need a hall for 80 people tomorrow 2 to 4 with a projector',
  'Lab for 40 students this Friday 10 to 12',
  'When is the auditorium quietest next week?',
  'Book classroom 101 for a study group tonight 6 to 8',
]

const CLARIFY_CHIPS = {
  date: ['Today', 'Tomorrow', 'Day after tomorrow', 'Next Monday', 'Next Friday'],
  startTime: ['9 to 11', '11 to 1', '2 to 4', '4 to 6'],
  attendees: ['20 people', '40 people', '80 people', '150 people'],
  resourceType: ['A seminar hall', 'A lab', 'A classroom', 'The auditorium', 'The ground'],
  title: ['Club meeting', 'Department review', 'Guest lecture', 'Cultural rehearsal'],
}

/** Fold a date/answer chip into a full sentence so the parser can read it. */
function chipToText(chip, askFor) {
  if (askFor === 'resourceType') return `I need ${chip.toLowerCase()}`
  if (askFor === 'date') return `Hold it ${chip.toLowerCase()}`
  return chip
}

function eventTypeFrom(text, userId) {
  const db = getState()
  const me = db.profiles.find((p) => p.id === userId)
  const result = classifyEventPurpose({
    title: text,
    purpose: text,
    userRole: me?.role ?? 'student',
    userId,
    log: false,
  })
  return result
}

/**
 * The concierge loop: parse → search → check availability → draft → human
 * confirmation. Mirrors the sequence diagram in Architecture.md §6.4.
 */
export function useConcierge({ userId }) {
  const [messages, setMessages] = useState([GREETING])
  const [context, setContext] = useState({})
  const [busy, setBusy] = useState(false)
  const { push } = useToast()
  const navigate = useNavigate()

  const append = useCallback((message) => {
    setMessages((list) => [...list, { id: uid('msg'), ...message }])
  }, [])

  const reset = useCallback(() => {
    setMessages([GREETING])
    setContext({})
  }, [])

  const buildDraft = useCallback(
    (option, intent, rawText) => {
      const classified = eventTypeFrom(rawText || '', userId)
      const start = option.start
      const end = option.end
      const scored = previewScore({
        userId,
        eventType: classified.eventType,
        start,
      })
      const attendees = intent.attendees ?? 1

      const availability = inspectAvailability({
        resourceId: option.resourceId,
        start,
        end: attendees,
        features: intent.features ?? [],
      })

      return {
        resourceId: option.resourceId,
        resourceName: option.resourceName,
        location: option.location,
        capacity: option.capacity,
        attendees,
        start,
        end,
        title:
          intent.title ??
          `${humanizeFeature(classified.eventType)} booking`,
        purpose: intent.purpose ?? rawText ?? '',
        eventType: classified.eventType,
        eventTypeConfidence: classified.confidence,
        score: scored.score,
        breakdown: scored.breakdown,
        notes: scored.notes,
        blocked: !availability.ok,
        blockedReason: availability.blackout?.reason ?? availability.capacityIssue ?? (availability.hard?.length ? 'Slot taken' : null),
        alternatives: availability.alternatives ?? [],
        matched: option.matched ?? [],
        missing: option.missing ?? [],
      }
    },
    [userId]
  )

  const send = useCallback(
    (rawText) => {
      const text = String(rawText ?? '').trim()
      if (!text) return
      append({ role: 'user', kind: 'text', text })
      setBusy(true)

      window.setTimeout(() => {
        try {
          // Special intent: "when is X quietest?"
          if (/\b(best time|quietest|quiet time|when.*(free|available|quiet)|least busy)\b/i.test(text)) {
            const intent = parseBookingRequest(text, { userId })
            const candidates = searchResources(intent, { limit: 3 })
            const target = candidates[0]
            if (target) {
              const windows = bestTimesFor(target.resource.id, 120, 6)
              append({
                role: 'agent',
                kind: 'best_times',
                text: windows.length
                  ? `${target.resource.name} has the least competition in these windows:`
                  : `I could not find a free two-hour window for ${target.resource.name} in the next six days.`,
                windows,
                resource: {
                  id: target.resource.id,
                  name: target.resource.name,
                  location: target.resource.location,
                },
                intent: { ...intent, resourceType: target.resource.type, attendees: intent.attendees ?? 20 },
              })
              setBusy(false)
              return
            }
          }

          const turn = conciergeTurn({ text, userId, context })

          if (turn.kind === 'clarify') {
            setContext(turn.intent)
            append({
              role: 'agent',
              kind: 'text',
              text: turn.question,
              chips: CLARIFY_CHIPS[turn.askFor] ?? [],
              askFor: turn.askFor,
              intent: turn.intent,
            })
            setBusy(false)
            return
          }

          if (turn.kind === 'no_match') {
            append({ role: 'agent', kind: 'text', text: turn.message, tone: 'amber' })
            setBusy(false)
            return
          }

          setContext(turn.intent)
          append({
            role: 'agent',
            kind: 'options',
            text: turn.message,
            options: turn.options,
            intent: turn.intent,
            allBusy: turn.allBusy,
          })
        } catch (error) {
          append({ role: 'agent', kind: 'text', text: `Something went wrong: ${error.message}`, tone: 'rose' })
        } finally {
          setBusy(false)
        }
      }, 340)
    },
    [append, context, userId]
  )

  const sendChip = useCallback(
    (chip, askFor) => {
      send(chipToText(chip, askFor))
    },
    [send]
  )

  const chooseOption = useCallback(
    (option, intent) => {
      if (!option.start || !option.end) {
        // No time was resolved yet — hand off to the form instead of guessing.
        navigate('/book', { state: { prefill: { resourceId: option.resourceId, intent } } })
        return
      }
      const rawText = intent?.purpose ?? ''
      const draft = buildDraft(option, intent ?? {}, rawText)
      append({
        role: 'agent',
        kind: 'draft',
        text: draft.blocked
          ? `Heads up — ${draft.blockedReason}. I can still try, or pick another option.`
          : `Here is your draft. Nothing is saved until you confirm.`,
        draft,
      })
    },
    [append, buildDraft, navigate]
  )

  const confirmDraft = useCallback(
    (draft) => {
      try {
        const { booking } = createBooking({
          userId,
          resourceId: draft.resourceId,
          title: draft.title,
          purpose: draft.purpose,
          eventType: draft.eventType,
          attendees: draft.attendees,
          start: draft.start,
          end: draft.end,
          source: 'concierge',
          aiMeta: { viaConcierge: true, eventTypeConfidence: draft.eventTypeConfidence },
        })

        append({
          role: 'agent',
          kind: 'success',
          text:
            booking.status === 'approved'
              ? `Booked. ${draft.resourceName} is confirmed for ${fmtRange(booking.startTime, booking.endTime)}.`
              : `Request submitted. ${draft.resourceName} is with an approver for ${fmtRange(booking.startTime, booking.endTime)}.`,
          bookingId: booking.id,
          status: booking.status,
          resourceName: draft.resourceName,
        })
        push({
          title: booking.status === 'approved' ? 'Booked via concierge' : 'Request submitted',
          body: `${draft.resourceName} · ${fmtRange(booking.startTime, booking.endTime)}`,
          kind: booking.status === 'approved' ? 'success' : 'info',
          action: (
            <button
              type="button"
              onClick={() => navigate('/bookings')}
              className="btn-secondary h-8 rounded-lg px-2.5 text-[12px]"
            >
              View my bookings
            </button>
          ),
        })
      } catch (error) {
        append({
          role: 'agent',
          kind: 'conflict',
          text: error.message,
          code: error.code,
          alternatives: error.alternatives ?? [],
          intent: { ...context, eventType: draft.eventType },
          original: draft,
        })
      }
    },
    [append, context, navigate, push, userId]
  )

  const openInForm = useCallback(
    (draft) => {
      navigate('/book', {
        state: {
          prefill: {
            resourceId: draft.resourceId,
            title: draft.title,
            purpose: draft.purpose,
            eventType: draft.eventType,
            attendees: draft.attendees,
            start: draft.start,
            end: draft.end,
          },
        },
      })
    },
    [navigate]
  )

  const substitute = useCallback(
    (alternative, intent) => {
      const option = {
        resourceId: alternative.resourceId,
        resourceName: alternative.name,
        location: alternative.location,
        capacity: alternative.capacity,
        start: alternative.start,
        end: alternative.end,
        matched: [],
        missing: [],
      }
      chooseOption(option, intent)
    },
    [chooseOption]
  )

  return {
    messages,
    busy,
    send,
    sendChip,
    chooseOption,
    confirmDraft,
    openInForm,
    substitute,
    reset,
    quickStarts: QUICK_STARTS,
  }
}

/** Pretty label for an option card header. */
export function optionSummary(option, intent) {
  const parts = [option.resourceName]
  if (option.start && option.end) parts.push(fmtRange(option.start, option.end))
  if (intent?.date && option.start) parts.push(fmtDayShort(option.start))
  if (intent?.resourceType) parts.push(RESOURCE_TYPE_LABEL[intent.resourceType] ?? '')
  if (intent?.eventType) parts.push(EVENT_LABEL[intent.eventType] ?? '')
  return parts.filter(Boolean).join(' · ')
}
