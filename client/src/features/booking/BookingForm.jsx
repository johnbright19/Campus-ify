import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import {
  ArrowRight,
  CalendarPlus,
  CheckCircle2,
  Hourglass,
  Info,
  LayoutList,
  MapPin,
  ShieldCheck,
  Sparkles,
  Timer,
  Users,
  Wand2,
  Zap,
} from 'lucide-react'
import { cn, dayKey, fmtDayShort, fmtRange, humanizeFeature, wallAt, wallInTz, wallNow } from '../../lib/utils'
import { TZ } from '../../lib/utils'
import { EVENT_TYPES, FEATURES, HIGH_PRIORITY_EVENTS, RESOURCE_TYPES } from '../../lib/constants'
import { useDb, useNow } from '../../lib/query'
import { useAuth } from '../../app/AuthProvider'
import { useToast } from '../../app/ToastProvider'
import { shake } from '../../lib/gsap'
import { createBooking, createBookingRemote, inspectAvailability, previewScore } from '../../services/bookings'
import { bestTimesFor } from '../../services/suggestions'
import { joinWaitlist, joinWaitlistRemote } from '../../services/waitlist'
import { classifyEventPurpose } from '../../services/ai'
import { Card, CardHeader, SectionTitle } from '../../components/ui/Card'
import {
  Badge,
  Button,
  Chip,
  EmptyState,
  Field,
  Input,
  Select,
  Textarea,
  Tooltip,
} from '../../components/ui/primitives'
import { Modal } from '../../components/ui/Modal'
import { PriorityBreakdown } from '../../components/PriorityBreakdown'
import { ResourceGlyph } from '../../components/ResourceGlyph'
import { ConflictPanel } from './ConflictPanel'

function toTimeValue(instant) {
  if (!instant) return ''
  const w = wallInTz(instant, TZ)
  return `${String(w.hour).padStart(2, '0')}:${String(w.minute).padStart(2, '0')}`
}

function toDateValue(instant) {
  if (!instant) return ''
  return dayKey(instant, TZ)
}

function buildInstant(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null
  const [y, mo, d] = String(dateStr).split('-').map(Number)
  const [h, mi] = String(timeStr).split(':').map(Number)
  if (!y || !mo || !d || Number.isNaN(h)) return null
  return wallAt({ year: y, month: mo, day: d }, h, mi, TZ).toISOString()
}

export default function BookingForm() {
  const db = useDb()
  const { user, server } = useAuth()
  const { push } = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const nowInstant = useNow(30000)

  const prefill = location.state?.prefill ?? null
  const initialResourceId = prefill?.resourceId ?? params.get('resource') ?? ''
  const formRef = useRef(null)

  const [resourceId, setResourceId] = useState(initialResourceId)
  const [title, setTitle] = useState(prefill?.title ?? '')
  const [purpose, setPurpose] = useState(prefill?.purpose ?? '')
  const [eventType, setEventType] = useState(prefill?.eventType ?? '')
  const [attendees, setAttendees] = useState(prefill?.attendees ? String(prefill.attendees) : '')
  const [date, setDate] = useState(
    prefill?.start ? toDateValue(prefill.start) : dayKey(wallNow(TZ), TZ)
  )
  const [start, setStart] = useState(prefill?.start ? toTimeValue(prefill.start) : '10:00')
  const [end, setEnd] = useState(prefill?.end ? toTimeValue(prefill.end) : '12:00')

  const [inspection, setInspection] = useState(null)
  const [checking, setChecking] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [created, setCreated] = useState(null)
  const [waitlistBusy, setWaitlistBusy] = useState(false)

  const resource = useMemo(
    () => db.resources.find((r) => r.id === resourceId) ?? null,
    [db.resources, resourceId]
  )

  const startInstant = useMemo(() => buildInstant(date, start), [date, start])
  const endInstant = useMemo(() => buildInstant(date, end), [date, end])
  const attendeeCount = Number(attendees) || 0

  // --- debounced inline conflict check ------------------------------------
  useEffect(() => {
    if (!resourceId || !startInstant || !endInstant) {
      setInspection(null)
      return undefined
    }
    setChecking(true)
    const handle = window.setTimeout(() => {
      const result = inspectAvailability({
        resourceId,
        start: startInstant,
        end: endInstant,
        attendees: attendeeCount,
        features: resource?.features ?? [],
      })
      setInspection(result)
      setChecking(false)
    }, 420)
    return () => {
      window.clearTimeout(handle)
      setChecking(false)
    }
  }, [resourceId, startInstant, endInstant, attendeeCount, resource])

  // --- live priority preview ---------------------------------------------
  const scoring = useMemo(() => {
    if (!startInstant) return null
    try {
      return previewScore({
        userId: user.id,
        eventType: eventType || 'club',
        start: startInstant,
        attendees: attendeeCount,
      })
    } catch {
      return null
    }
  }, [user.id, eventType, startInstant, attendeeCount])

  const suggestions = useMemo(() => {
    if (!eventType || !purpose) return null
    return classifyEventPurpose({
      title,
      purpose,
      userRole: user.role,
      userId: user.id,
      log: false,
    })
  }, [eventType, purpose, title, user.role, user.id])

  const quietWindows = useMemo(() => {
    if (!resourceId) return []
    const durationMin = startInstant && endInstant ? Math.max(30, (new Date(endInstant) - new Date(startInstant)) / 60000) : 60
    return bestTimesFor(resourceId, durationMin, 6, db)
  }, [db, resourceId, startInstant, endInstant])

  const durationLabel = useMemo(() => {
    if (!startInstant || !endInstant) return null
    const mins = Math.round((new Date(endInstant) - new Date(startInstant)) / 60000)
    if (mins <= 0) return 'invalid window'
    return mins < 60 ? `${mins} min` : `${(mins / 60).toFixed(mins % 60 ? 1 : 0)} h`
  }, [startInstant, endInstant])

  const applyAlternative = useCallback(
    (option) => {
      setResourceId(option.resourceId)
      setDate(toDateValue(option.start))
      setStart(toTimeValue(option.start))
      setEnd(toTimeValue(option.end))
      setError(null)
      push({
        title: 'Alternative applied',
        body: `${option.name} · ${fmtDayShort(option.start, TZ)} ${fmtRange(option.start, option.end, TZ)}`,
        kind: 'info',
      })
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    },
    [push]
  )

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    const payload = {
      userId: user.id,
      resourceId,
      title,
      purpose,
      eventType: eventType || 'club',
      attendees: attendeeCount || 1,
      start: startInstant,
      end: endInstant,
      source: 'web',
    }

    try {
      // With a backend session the API decides (and Postgres persists); without
      // one the deterministic in-browser engine runs, exactly as before.
      const result = server?.connected
        ? await createBookingRemote(payload)
        : createBooking(payload)
      setCreated(result.booking)
      push({
        title: result.booking.status === 'approved' ? 'Booking confirmed' : 'Request submitted',
        body: `${resource?.name} · ${fmtRange(result.booking.startTime, result.booking.endTime, TZ)}`,
        kind: result.booking.status === 'approved' ? 'success' : 'info',
      })
    } catch (domainError) {
      setError(domainError)
      setInspection((current) =>
        current
          ? {
              ...current,
              ok: false,
              hard: domainError.conflicts ?? current.hard,
              blackout: domainError.blackout ?? current.blackout,
              alternatives: domainError.alternatives ?? current.alternatives,
            }
          : current
      )
      shake(formRef.current)
    } finally {
      setSubmitting(false)
    }
  }

  const handleJoinWaitlist = async () => {
    try {
      setWaitlistBusy(true)
      const entry = {
        userId: user.id,
        resourceId,
        title: title || `${resource?.name} request`,
        purpose,
        eventType: eventType || 'club',
        attendees: attendeeCount || 1,
        start: startInstant,
        end: endInstant,
      }
      const { alreadyQueued } = server?.connected
        ? await joinWaitlistRemote(entry)
        : joinWaitlist(entry)
      push({
        title: alreadyQueued ? 'Already on the waitlist' : 'Waitlist joined',
        body: alreadyQueued
          ? 'You already have a matching entry for that window.'
          : 'We will offer the slot the moment it frees up, highest priority first.',
        kind: 'info',
      })
    } catch (waitlistError) {
      push({ title: 'Could not join', body: waitlistError.message, kind: 'error' })
    } finally {
      setWaitlistBusy(false)
    }
  }

  const canSubmit = Boolean(resourceId && title.length >= 3 && startInstant && endInstant)

  return (
    <div className="space-y-6">
      <SectionTitle
        icon={CalendarPlus}
        title="New booking"
        subtitle="Availability, conflicts and your priority score update as you type — before anything is written."
        action={
          <Button variant="secondary" leftIcon={LayoutList} onClick={() => navigate('/bookings')}>
            My bookings
          </Button>
        }
      />

      <form ref={formRef} onSubmit={handleSubmit} className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
        {/* ---------------- Form ---------------- */}
        <div className="space-y-6">
          <Card>
            <CardHeader
              icon={Timer}
              eyebrow="Step 1"
              title="What and when"
              subtitle="Pick a space, then a window. The check runs 400 ms after you stop typing."
            />

            <div className="mt-5 space-y-4">
              <Field label="Resource" required htmlFor="bf-resource">
                <Select
                  id="bf-resource"
                  value={resourceId}
                  onChange={(event) => setResourceId(event.target.value)}
                  required
                >
                  <option value="">Select a space…</option>
                  {RESOURCE_TYPES.map((type) => {
                    const options = db.resources.filter((r) => r.isActive && r.type === type.value)
                    if (!options.length) return null
                    return (
                      <optgroup key={type.value} label={type.label}>
                        {options.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name} · {r.capacity ? `${r.capacity} seats` : 'equipment'} · {r.location}
                          </option>
                        ))}
                      </optgroup>
                    )
                  })}
                </Select>
              </Field>

              {resource ? (
                <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/3 p-3">
                  <ResourceGlyph type={resource.type} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold text-white">{resource.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <MapPin className="size-3" />
                        {resource.location}
                      </span>
                      {resource.capacity ? (
                        <span className="flex items-center gap-1">
                          <Users className="size-3" />
                          seats {resource.capacity}
                        </span>
                      ) : null}
                      <span
                        className={cn(
                          'flex items-center gap-1',
                          resource.requiresApproval ? 'text-amber-450' : 'text-mint-400'
                        )}
                      >
                        <ShieldCheck className="size-3" />
                        {resource.requiresApproval ? `${resource.approverRole} approval` : 'instant'}
                      </span>
                    </p>
                  </div>
                  <Link to="/explore" className="text-[11.5px] font-medium text-brand-300 hover:text-brand-200">
                    Change
                  </Link>
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Date" required>
                  <input
                    type="date"
                    value={date}
                    min={dayKey(nowInstant, TZ)}
                    onChange={(event) => setDate(event.target.value)}
                    className="field"
                    required
                  />
                </Field>
                <Field label="Start" required>
                  <input
                    type="time"
                    value={start}
                    onChange={(event) => setStart(event.target.value)}
                    className="field"
                    required
                  />
                </Field>
                <Field label="End" required hint={durationLabel ? `Duration ${durationLabel}` : undefined}>
                  <input
                    type="time"
                    value={end}
                    onChange={(event) => setEnd(event.target.value)}
                    className="field"
                    required
                  />
                </Field>
              </div>

              {quietWindows.length && resourceId ? (
                <div>
                  <p className="field-label">Least contested windows for this space</p>
                  <div className="flex flex-wrap gap-1.5">
                    {quietWindows.slice(0, 5).map((window) => (
                      <button
                        key={window.start}
                        type="button"
                        onClick={() => {
                          setDate(toDateValue(window.start))
                          setStart(toTimeValue(window.start))
                          setEnd(toTimeValue(window.end))
                        }}
                        className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11.5px] font-medium text-slate-300 transition hover:border-brand-400/40 hover:text-white"
                      >
                        {window.label}
                        {window.offPeak ? <span className="ml-1.5 text-mint-400">+4</span> : null}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader
              icon={Sparkles}
              eyebrow="Step 2"
              title="What is it for"
              subtitle="The declared purpose drives the priority weight — and high-priority claims need verification."
            />

            <div className="mt-5 space-y-4">
              <Field label="Title" required hint="Shown on the calendar and to the approver">
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="e.g. Techfest core committee review"
                  minLength={3}
                  maxLength={120}
                  required
                />
              </Field>

              <Field
                label="Purpose (optional)"
                hint="Saved as data, never treated as instructions by the AI layer."
              >
                <Textarea
                  value={purpose}
                  onChange={(event) => setPurpose(event.target.value)}
                  placeholder="Who is it for, what will happen, any equipment the space needs to provide…"
                  maxLength={500}
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Attendees" required>
                  <Input
                    type="number"
                    min={1}
                    max={5000}
                    value={attendees}
                    onChange={(event) => setAttendees(event.target.value)}
                    placeholder="80"
                    required
                  />
                </Field>
                <Field label="Event type" hint="Defaults to a club meeting if you leave it blank">
                  <Select value={eventType} onChange={(event) => setEventType(event.target.value)}>
                    <option value="">Let Campus-ify classify it</option>
                    {EVENT_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label} · weight {type.weight}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div>
                <p className="field-label">Event type weights</p>
                <div className="flex flex-wrap gap-1.5">
                  {EVENT_TYPES.map((type) => (
                    <Tooltip key={type.value} content={type.description ?? type.label}>
                      <Chip
                        active={eventType === type.value}
                        onClick={() => setEventType(type.value)}
                      >
                        {type.label}
                        <span className="num ml-1 text-slate-500">{type.weight}</span>
                      </Chip>
                    </Tooltip>
                  ))}
                </div>
              </div>

              {suggestions ? (
                <div className="rounded-xl border border-aqua-400/25 bg-aqua-400/6 p-3.5">
                  <p className="flex items-center gap-2 text-[12.5px] font-semibold text-aqua-200">
                    <Wand2 className="size-3.5" />
                    Classifier suggests “{humanizeFeature(suggestions.eventType)}”
                    <span className="num text-[11px] text-aqua-400/80">
                      {Math.round(suggestions.confidence * 100)}% confident
                    </span>
                  </p>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-slate-300">
                    {suggestions.reasoning}
                  </p>
                  {suggestions.flags?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {suggestions.flags.map((flag) => (
                        <Badge key={flag} tone="amber">
                          {flag.replace(/_/g, ' ')}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  {eventType !== suggestions.eventType ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-2.5"
                      onClick={() => setEventType(suggestions.eventType)}
                    >
                      Accept “{humanizeFeature(suggestions.eventType)}”
                    </Button>
                  ) : null}
                </div>
              ) : null}

              {HIGH_PRIORITY_EVENTS.includes(eventType || 'club') ? (
                <p className="flex items-start gap-2 rounded-xl border border-amber-450/25 bg-amber-450/8 p-3 text-[12px] leading-relaxed text-amber-100">
                  <Info className="mt-0.5 size-3.5 shrink-0 text-amber-450" />
                  {humanizeFeature(eventType)} is capped at 60 points until an approver verifies it —
                  typing “exam” does not jump the queue.
                </p>
              ) : null}
            </div>
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="lg" loading={submitting} disabled={!canSubmit} leftIcon={CheckCircle2}>
              {resource?.requiresApproval ? 'Submit for approval' : 'Book now'}
            </Button>
            <Button
              type="button"
              size="lg"
              variant="secondary"
              leftIcon={Hourglass}
              loading={waitlistBusy}
              disabled={!canSubmit}
              onClick={handleJoinWaitlist}
            >
              Join waitlist instead
            </Button>
            <span className="text-[11.5px] text-slate-500">
              Nothing is written until you submit.
            </span>
          </div>
        </div>

        {/* ---------------- Live check ---------------- */}
        <div className="space-y-6 xl:sticky xl:top-24 xl:self-start">
          <Card>
            <CardHeader
              icon={Zap}
              eyebrow="Live check"
              title={checking ? 'Checking availability…' : 'Availability'}
              subtitle={
                startInstant && endInstant
                  ? `${fmtDayShort(startInstant, TZ)} · ${fmtRange(startInstant, endInstant, TZ)}`
                  : 'Choose a space, date and window'
              }
            />
            <div className="mt-4">
              {!resourceId || !startInstant || !endInstant ? (
                <EmptyState
                  compact
                  icon={Info}
                  title="Waiting for details"
                  description="Fill in the space and window on the left; the conflict engine runs instantly."
                />
              ) : (
                <ConflictPanel
                  inspection={inspection}
                  onApplyAlternative={applyAlternative}
                  onJoinWaitlist={handleJoinWaitlist}
                />
              )}
            </div>

            {error ? (
              <div className="mt-4 rounded-xl border border-rose-450/30 bg-rose-500/10 px-3.5 py-3">
                <p className="text-[12.5px] font-semibold text-rose-100">
                  {error.code === 'CONFLICT'
                    ? 'That slot was taken while you were filling the form'
                    : 'The engine refused that request'}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-rose-200/85">{error.message}</p>
              </div>
            ) : null}
          </Card>

          <Card>
            <CardHeader
              icon={Sparkles}
              eyebrow="Transparency"
              title="Your priority score"
              subtitle="You can see exactly what an approver will weigh — including the penalties."
            />
            <div className="mt-4">
              {scoring ? (
                <PriorityBreakdown
                  score={scoring.score}
                  breakdown={scoring.breakdown}
                  extras={scoring.extras}
                  notes={scoring.notes}
                />
              ) : (
                <p className="text-[12px] text-slate-500">Pick a date and time to score this request.</p>
              )}
            </div>
          </Card>

          {resource ? (
            <Card>
              <CardHeader
                icon={MapPin}
                eyebrow="About this space"
                title={resource.name}
                subtitle={resource.location}
              />
              <div className="mt-4 flex flex-wrap gap-1.5">
                {(resource.features ?? []).map((feature) => (
                  <span
                    key={feature}
                    className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10.5px] font-medium text-slate-400"
                  >
                    {humanizeFeature(feature)}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-[11.5px] leading-relaxed text-slate-500">
                Owner {resource.ownerDepartment}
                {resource.requiresApproval
                  ? ` · decided by a ${resource.approverRole}.`
                  : ' · books instantly with no approval step.'}
              </p>
            </Card>
          ) : null}
        </div>
      </form>

      {/* Success */}
      <Modal
        open={Boolean(created)}
        onClose={() => setCreated(null)}
        icon={created?.status === 'approved' ? CheckCircle2 : Hourglass}
        title={created?.status === 'approved' ? 'Booking confirmed' : 'Request submitted'}
        subtitle={
          created
            ? `${resource?.name} · ${fmtDayShort(created.startTime, TZ)} · ${fmtRange(
                created.startTime,
                created.endTime,
                TZ
              )}`
            : ''
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreated(null)}>
              Book another
            </Button>
            <Button rightIcon={ArrowRight} onClick={() => navigate('/bookings')}>
              View my bookings
            </Button>
          </>
        }
      >
        {created ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={created.status === 'approved' ? 'mint' : 'amber'} dot>
                {created.status}
              </Badge>
              <Badge tone="brand">priority {created.priorityScore}</Badge>
              <span className="text-[11.5px] text-slate-500">
                {created.attendees} attendee(s) · {humanizeFeature(created.eventType)}
              </span>
            </div>

            {created.status === 'approved' ? (
              <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/4 p-4">
                <div className="rounded-xl bg-white p-2.5">
                  <QRCodeSVG value={created.qrToken ?? created.id} size={104} level="M" />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-white">Your check-in code</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-slate-400">
                    Check-in opens 10 minutes before start and closes {db.settings.noShowGraceMin}{' '}
                    minutes after. Miss it and the slot is auto-released to the waitlist.
                  </p>
                  <p className="num mt-2 truncate text-[10.5px] text-slate-500">{created.id}</p>
                </div>
              </div>
            ) : (
              <p className="rounded-xl border border-white/10 bg-white/3 px-3.5 py-3 text-[12.5px] leading-relaxed text-slate-300">
                The approver received an AI brief with your score breakdown, any conflicts and your
                no-show history. You will be notified either way.
              </p>
            )}

            <div className="border-t border-white/8 pt-4">
              <PriorityBreakdown
                score={created.priorityScore}
                breakdown={created.priorityBreakdown}
                notes={created.aiMeta?.scoreNotes ?? []}
                verified={created.verified}
                dense
              />
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
