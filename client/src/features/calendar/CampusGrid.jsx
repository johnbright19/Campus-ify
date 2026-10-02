import { useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  TZ,
  cn,
  dayKey,
  dayShift,
  dowOfWall,
  fmtTime,
  minutesOfDay,
  wallAt,
  wallOf,
} from '../../lib/utils'
import { TYPE_ACCENT } from '../../components/ResourceGlyph'
import { Button, Segmented } from '../../components/ui/primitives'

// ---------------------------------------------------------------------------
// Space-lane timetable.
//
// The stock week grid puts every space in the same day column, so a busy
// campus squeezes dozens of bookings into slivers. Here a ROW is a space and
// time runs left to right: each booking gets its own block with a readable
// label, and only genuinely contested slots (two pending requests on the same
// space) share horizontal room.
// ---------------------------------------------------------------------------

const DAY_START_HOUR = 7
const DAY_END_HOUR = 22
const SLOT_MIN = 30
const SLOT_W = 48
const ROW_H = 38
const LABEL_W = 216

const TOTAL_MIN = (DAY_END_HOUR - DAY_START_HOUR) * 60
const PX_PER_MIN = SLOT_W / SLOT_MIN
const TRACK_W = TOTAL_MIN * PX_PER_MIN

const STATUS_STYLE = {
  approved: { dot: '#34d399', label: 'Approved' },
  pending: { dot: '#fbbf24', label: 'Pending' },
  completed: { dot: '#6d5ef8', label: 'Completed' },
  no_show: { dot: '#fb7185', label: 'No-show' },
  rejected: { dot: '#f43f5e', label: 'Rejected' },
  cancelled: { dot: '#64748b', label: 'Cancelled' },
}

const hours = Array.from(
  { length: DAY_END_HOUR - DAY_START_HOUR + 1 },
  (_, i) => DAY_START_HOUR + i
)

/** Items are `{ booking, start, end }` with start/end already clamped to the day. */
function overlaps(a, b) {
  return a.start < b.end && a.end > b.start
}

/**
 * Give each booking a horizontal lane. A booking is only ever narrowed by
 * bookings that genuinely overlap it in the same space, so a quiet space always
 * renders at full width.
 */
function layoutLanes(items) {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end)
  return sorted.map((item) => {
    const peers = sorted.filter((other) => overlaps(item, other))
    return { ...item, lane: peers.indexOf(item), lanes: Math.max(1, peers.length) }
  })
}

function clampToDay(booking, wall) {
  const dayStart = wallAt(wall, 0, 0)
  const dayEnd = wallAt(wall, 24, 0)
  const start = new Date(Math.max(new Date(booking.startTime), dayStart))
  const endDate = new Date(Math.min(new Date(booking.endTime), dayEnd))
  return { start, end: endDate, visible: endDate > start }
}

export default function CampusGrid({
  bookings,
  resources,
  anchor,
  onAnchorChange,
  mode,
  onModeChange,
  colorMode,
  onEventClick,
  onSlotClick,
  now,
  pulses,
}) {
  const today = useMemo(() => dayKey(wallOf(now)), [now])

  /** bookings grouped by resource, filtered to the visible window per mode. */
  const byResource = useMemo(() => {
    const days =
      mode === 'day'
        ? [dayKey(wallAt(anchor, 0, 0))]
        : Array.from({ length: 7 }, (_, i) => dayKey(wallAt(dayShift(anchor, i - offsetOf(anchor)), 0, 0)))
    const daySet = new Set(days)
    const map = new Map(resources.map((r) => [r.id, []]))
    for (const booking of bookings) {
      if (!daySet.has(dayKey(booking.startTime))) continue
      const list = map.get(booking.resourceId)
      if (list) list.push(booking)
    }
    return map
  }, [bookings, resources, anchor, mode])

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => dayShift(anchor, i - offsetOf(anchor))),
    [anchor]
  )

  const step = (delta) => onAnchorChange(dayShift(anchor, mode === 'day' ? delta : delta * 7))

  const nowMinutes = minutesOfDay(now)

  return (
    <div className="overflow-hidden rounded-xl border border-white/8">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 bg-white/2 px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => step(-1)} aria-label="Previous">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onAnchorChange(wallOf(now))}>
            Today
          </Button>
          <Button variant="ghost" size="sm" onClick={() => step(1)} aria-label="Next">
            <ChevronRight className="size-4" />
          </Button>
          <span className="num ml-2 text-[12.5px] font-semibold text-white">
            {mode === 'day'
              ? new Intl.DateTimeFormat('en-IN', {
                  timeZone: TZ,
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                }).format(wallAt(anchor, 12))
              : `Week of ${new Intl.DateTimeFormat('en-IN', {
                  timeZone: TZ,
                  day: 'numeric',
                  month: 'short',
                }).format(wallAt(weekDays[0], 12))}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="num text-[11.5px] text-slate-500">
            {bookings.length} booking{bookings.length === 1 ? '' : 's'} in view
          </span>
          <Segmented
            value={mode}
            onChange={onModeChange}
            options={[
              { value: 'day', label: 'Day · by space' },
              { value: 'week', label: 'Week' },
            ]}
          />
        </div>
      </div>

      {mode === 'day' ? (
        <DayLanes
          resources={resources}
          byResource={byResource}
          anchor={anchor}
          nowMinutes={nowMinutes}
          colorMode={colorMode}
          pulses={pulses}
          onEventClick={onEventClick}
          onSlotClick={onSlotClick}
        />
      ) : (
        <WeekCells
          resources={resources}
          byResource={byResource}
          weekDays={weekDays}
          today={today}
          colorMode={colorMode}
          pulses={pulses}
          onEventClick={onEventClick}
          onSlotClick={onSlotClick}
        />
      )}
    </div>
  )
}

/** Monday-first offset of the anchor date within its week. */
function offsetOf(anchor) {
  const dow = dowOfWall(anchor) // 0 = Sunday
  return (dow + 6) % 7
}

/* ---------------------------------------------------------------------------
 * Day view — one row per space, time left to right.
 * ------------------------------------------------------------------------- */
function DayLanes({
  resources,
  byResource,
  anchor,
  nowMinutes,
  colorMode,
  pulses,
  onEventClick,
  onSlotClick,
}) {
  const showNow = nowMinutes >= DAY_START_HOUR * 60 && nowMinutes <= DAY_END_HOUR * 60
  const nowLeft = (nowMinutes - DAY_START_HOUR * 60) * PX_PER_MIN

  return (
    <div className="max-h-[68vh] overflow-auto">
      <div className="flex min-w-max">
        {/* Sticky space labels */}
        <div className="sticky left-0 z-20 shrink-0 border-r border-white/8 bg-ink-900/95 backdrop-blur">
          <div
            className="flex items-end border-b border-white/8 px-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500"
            style={{ width: LABEL_W, height: 34 }}
          >
            Spaces
          </div>
          {resources.map((resource) => (
            <div
              key={resource.id}
              className="flex items-center gap-2 border-b border-white/5 px-3"
              style={{ width: LABEL_W, height: ROW_H }}
            >
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: TYPE_ACCENT[resource.type] ?? '#6d5ef8' }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11.5px] font-semibold text-slate-200">
                  {resource.name}
                </span>
                <span className="num block truncate text-[10px] text-slate-500">
                  {resource.capacity ? `${resource.capacity} seats` : resource.type}
                </span>
              </span>
            </div>
          ))}
        </div>

        {/* Timeline */}
        <div className="relative" style={{ width: TRACK_W }}>
          {/* Hour ruler */}
          <div
            className="sticky top-0 z-10 flex border-b border-white/8 bg-ink-900/95 backdrop-blur"
            style={{ height: 34 }}
          >
            {hours.map((hour) => (
              <div
                key={hour}
                className="num shrink-0 border-l border-white/8 pl-1.5 pt-1 text-[10.5px] font-semibold text-slate-500"
                style={{ width: SLOT_W * 2 }}
              >
                {String(hour).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* One lane per space */}
          {resources.map((resource) => {
            const items = (byResource.get(resource.id) ?? [])
              .map((booking) => ({ booking, ...clampToDay(booking, anchor) }))
              .filter((entry) => entry.visible)
            const placed = layoutLanes(items)

            return (
              <div
                key={resource.id}
                className="relative border-b border-white/5"
                style={{ height: ROW_H }}
                onClick={(event) => {
                  if (event.target !== event.currentTarget) return
                  const rect = event.currentTarget.getBoundingClientRect()
                  const minutes = (event.clientX - rect.left) / PX_PER_MIN + DAY_START_HOUR * 60
                  const snapped = Math.floor(minutes / SLOT_MIN) * SLOT_MIN
                  onSlotClick(resource, snapped, snapped + SLOT_MIN)
                }}
              >
                {/* Half-hour gridlines */}
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="pointer-events-none absolute inset-y-0 border-l border-white/6"
                    style={{ left: (hour - DAY_START_HOUR) * 60 * PX_PER_MIN }}
                  />
                ))}

                {placed.map(({ booking, start, end: stop, lane, lanes }) => {
                  const left = (minutesOfDay(start) - DAY_START_HOUR * 60) * PX_PER_MIN
                  const width = Math.max(
                    26,
                    (minutesOfDay(stop) - minutesOfDay(start)) * PX_PER_MIN - 3
                  )
                  const share = 100 / lanes
                  const status = STATUS_STYLE[booking.status] ?? STATUS_STYLE.approved
                  const accent =
                    colorMode === 'resource'
                      ? TYPE_ACCENT[resource.type] ?? '#6d5ef8'
                      : status.dot
                  const pulsing = Boolean(pulses?.[booking.resourceId])
                  const compact = width < 92
                  const tiny = width < 54

                  return (
                    <button
                      key={booking.id}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        onEventClick(booking)
                      }}
                      title={`${booking.title} · ${fmtTime(booking.startTime)}–${fmtTime(
                        booking.endTime
                      )} · ${status.label}`}
                      className={cn(
                        'absolute top-1/2 flex -translate-y-1/2 items-center overflow-hidden rounded-md border text-left transition hover:z-10 hover:brightness-115',
                        pulsing && 'animate-pulse'
                      )}
                      style={{
                        left: left + lane * (width * share) / 100 + 1.5,
                        width: `calc(${width * share}% - 3px)`,
                        height: ROW_H - 10,
                        borderColor: `${accent}66`,
                        background: `linear-gradient(180deg, ${accent}3d, ${accent}1f)`,
                        boxShadow: `inset 2px 0 0 ${accent}`,
                      }}
                    >
                      <span className="min-w-0 px-1.5 py-0.5">
                        {!tiny ? (
                          <span className="num block text-[9.5px] font-semibold text-white/70">
                            {fmtTime(booking.startTime)}
                          </span>
                        ) : null}
                        <span
                          className={cn(
                            'block truncate text-[11px] font-semibold text-white',
                            tiny && 'text-[9.5px]'
                          )}
                        >
                          {compact && !tiny ? `${fmtTime(booking.startTime)} ` : ''}
                          {booking.title}
                        </span>
                      </span>
                      {lanes > 1 ? (
                        <span className="num ml-auto shrink-0 pr-1 text-[9px] text-white/60">
                          +{lanes - 1}
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            )
          })}

          {/* Now indicator */}
          {showNow ? (
            <div
              className="pointer-events-none absolute inset-y-0 z-10 border-l-2 border-rose-400/80"
              style={{ left: nowLeft }}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Week view — rows are still spaces, but each cell lists that day's bookings,
 * so nothing is hidden behind a "+3 more" popover.
 * ------------------------------------------------------------------------- */
function WeekCells({
  resources,
  byResource,
  weekDays,
  today,
  colorMode,
  pulses,
  onEventClick,
  onSlotClick,
}) {
  return (
    <div className="max-h-[68vh] overflow-auto">
      <div className="min-w-[900px]">
        <div className="sticky top-0 z-20 flex border-b border-white/8 bg-ink-900/95 backdrop-blur">
          <div className="sticky left-0 z-10 shrink-0 border-r border-white/8 bg-ink-900/95 px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500" style={{ width: LABEL_W }}>
            Spaces
          </div>
          {weekDays.map((wall) => {
            const key = dayKey(wallAt(wall, 0, 0))
            const isToday = key === today
            return (
              <div key={key} className={cn('flex-1 px-2 py-1.5', isToday && 'bg-brand-500/10')}>
                <div className={cn('text-[11.5px] font-semibold', isToday ? 'text-brand-200' : 'text-slate-300')}>
                  {new Intl.DateTimeFormat('en-IN', { timeZone: TZ, weekday: 'short' }).format(
                    wallAt(wall, 12)
                  )}
                </div>
                <div className="num text-[10.5px] text-slate-500">
                  {new Intl.DateTimeFormat('en-IN', { timeZone: TZ, day: 'numeric', month: 'short' }).format(
                    wallAt(wall, 12)
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {resources.map((resource) => (
          <div key={resource.id} className="flex border-b border-white/5">
            <div
              className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-white/8 bg-ink-900/95 px-3"
              style={{ width: LABEL_W, minHeight: 44 }}
            >
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: TYPE_ACCENT[resource.type] ?? '#6d5ef8' }}
              />
              <span className="truncate text-[11.5px] font-semibold text-slate-200">
                {resource.name}
              </span>
            </div>

            {weekDays.map((wall) => {
              const key = dayKey(wallAt(wall, 0, 0))
              const isToday = key === today
              const items = (byResource.get(resource.id) ?? []).filter(
                (b) => dayKey(b.startTime) === key
              )
              return (
                <div
                  key={key}
                  className={cn(
                    'flex-1 space-y-1 border-l border-white/5 p-1',
                    isToday && 'bg-brand-500/6'
                  )}
                  onClick={() => onSlotClick(resource, wall, null)}
                >
                  {items.map((booking) => {
                    const status = STATUS_STYLE[booking.status] ?? STATUS_STYLE.approved
                    const accent =
                      colorMode === 'resource'
                        ? TYPE_ACCENT[resource.type] ?? '#6d5ef8'
                        : status.dot
                    return (
                      <button
                        key={booking.id}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          onEventClick(booking)
                        }}
                        className={cn(
                          'block w-full rounded-md border px-1.5 py-1 text-left transition hover:brightness-115',
                          pulses?.[booking.resourceId] && 'animate-pulse'
                        )}
                        style={{
                          borderColor: `${accent}55`,
                          background: `linear-gradient(180deg, ${accent}30, ${accent}18)`,
                        }}
                        title={`${booking.title} · ${status.label}`}
                      >
                        <span className="num block text-[9.5px] font-semibold text-white/70">
                          {fmtTime(booking.startTime)}
                        </span>
                        <span className="block truncate text-[10.5px] font-semibold text-white">
                          {booking.title}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}