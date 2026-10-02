import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CalendarPlus,
  Compass,
  Filter,
  MapPin,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Timer,
  TrendingUp,
  Users,
  X,
} from 'lucide-react'
import {
  TZ,
  cn,
  dayKey,
  fmtDayShort,
  fmtRange,
  humanizeFeature,
  wallAt,
  wallNow,
} from '../../lib/utils'
import { FEATURES, RESOURCE_TYPES } from '../../lib/constants'
import { agendaForResource, detectConflicts } from '../../services/conflicts'
import { utilizationWindow } from '../../services/analytics'
import { decorate } from '../../services/bookings'
import { bestTimesFor } from '../../services/suggestions'
import { useDb } from '../../lib/query'
import { useStaggerIn } from '../../lib/gsap'
import { Card, SectionTitle } from '../../components/ui/Card'
import { Badge, Button, Chip, EmptyState, Input, Select, Tooltip } from '../../components/ui/primitives'
import { Drawer } from '../../components/ui/Modal'
import { ResourceGlyph, TYPE_LABEL } from '../../components/ResourceGlyph'
import { StatusBadge } from '../../components/StatusBadge'
import { ResourceCard } from './ResourceCard'

const SORTS = [
  { value: 'relevance', label: 'Most available' },
  { value: 'utilisation', label: 'Least contested' },
  { value: 'capacity', label: 'Largest first' },
  { value: 'name', label: 'A → Z' },
]

function toInstant(dateStr, timeStr) {
  const [y, mo, d] = String(dateStr).split('-').map(Number)
  const [h, mi] = String(timeStr).split(':').map(Number)
  return wallAt({ year: y, month: mo, day: d }, h, mi, TZ)
}

export default function ResourceExplorer() {
  const db = useDb()
  const navigate = useNavigate()
  const scope = useStaggerIn([])

  const today = dayKey(wallNow(TZ), TZ)

  const [query, setQuery] = useState('')
  const [types, setTypes] = useState([])
  const [minCapacity, setMinCapacity] = useState('')
  const [features, setFeatures] = useState([])
  const [sort, setSort] = useState('relevance')
  const [useWindow, setUseWindow] = useState(false)
  const [date, setDate] = useState(today)
  const [start, setStart] = useState('10:00')
  const [end, setEnd] = useState('12:00')
  const [active, setActive] = useState(null)

  const utilization = useMemo(() => utilizationWindow(28, db), [db])
  const statsById = useMemo(
    () => Object.fromEntries(utilization.perResource.map((r) => [r.id, r])),
    [utilization]
  )

  const windowRange = useMemo(() => {
    if (!useWindow) return null
    try {
      const s = toInstant(date, start)
      const e = toInstant(date, end)
      if (e <= s) return null
      return { start: s.toISOString(), end: e.toISOString() }
    } catch {
      return null
    }
  }, [useWindow, date, start, end])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()

    return db.resources
      .filter((r) => r.isActive)
      .filter((r) => (types.length ? types.includes(r.type) : true))
      .filter((r) =>
        r.type === 'equipment' || !minCapacity ? true : r.capacity >= Number(minCapacity)
      )
      .filter((r) => (features.length ? features.every((f) => (r.features ?? []).includes(f)) : true))
      .filter((r) => {
        if (!q) return true
        return (
          r.name.toLowerCase().includes(q) ||
          String(r.location).toLowerCase().includes(q) ||
          (r.features ?? []).some((f) => f.includes(q)) ||
          r.type.includes(q)
        )
      })
      .map((resource) => {
        let availability = null
        if (windowRange) {
          const { hard, soft, blackout } = detectConflicts({
            resourceId: resource.id,
            start: windowRange.start,
            end: windowRange.end,
            db,
          })
          const capacityIssue =
            resource.type !== 'equipment' &&
            minCapacity &&
            resource.capacity < Number(minCapacity)
          availability = {
            free: !hard.length && !blackout && !capacityIssue,
            contested: soft.length,
            reason: blackout ? 'Blacked out' : hard.length ? 'Already booked' : null,
          }
        }
        return { resource, stats: statsById[resource.id], availability }
      })
      .sort((a, b) => {
        if (sort === 'capacity') return b.resource.capacity - a.resource.capacity
        if (sort === 'name') return a.resource.name.localeCompare(b.resource.name)
        if (sort === 'utilisation')
          return (a.stats?.utilization ?? 0) - (b.stats?.utilization ?? 0)
        // relevance: free first, then by utilisation
        const aFree = a.availability?.free ? 0 : 1
        const bFree = b.availability?.free ? 0 : 1
        if (aFree !== bFree) return aFree - bFree
        return (a.stats?.utilization ?? 0) - (b.stats?.utilization ?? 0)
      })
  }, [db, query, types, minCapacity, features, sort, windowRange, statsById])

  const freeCount = rows.filter((r) => r.availability?.free).length
  const anyFilter =
    Boolean(query) || types.length > 0 || Boolean(minCapacity) || features.length > 0 || useWindow

  const clearAll = () => {
    setQuery('')
    setTypes([])
    setMinCapacity('')
    setFeatures([])
    setUseWindow(false)
    setSort('relevance')
  }

  const bookResource = (resource) => {
    navigate('/book', {
      state: {
        prefill: {
          resourceId: resource.id,
          start: windowRange?.start,
          end: windowRange?.end,
        },
      },
    })
  }

  return (
    <div ref={scope} className="space-y-6">
      <SectionTitle
        icon={Compass}
        title="Resource explorer"
        subtitle="Filter the real inventory, then check it against any window before you commit."
        action={
          <Button leftIcon={CalendarPlus} onClick={() => navigate('/book')}>
            New booking
          </Button>
        }
      />

      <Card className="reveal">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name, block, feature or type…"
                className="pl-9"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-500 hover:text-white"
                  aria-label="Clear search"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={sort} onChange={(event) => setSort(event.target.value)} className="w-auto">
                {SORTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    Sort: {option.label}
                  </option>
                ))}
              </Select>
              <Select
                value={minCapacity}
                onChange={(event) => setMinCapacity(event.target.value)}
                className="w-auto"
              >
                <option value="">Any capacity</option>
                {[20, 40, 60, 80, 120, 300, 500].map((n) => (
                  <option key={n} value={n}>
                    {n}+ seats
                  </option>
                ))}
              </Select>
              <Button
                variant={useWindow ? 'primary' : 'secondary'}
                leftIcon={Timer}
                onClick={() => setUseWindow((v) => !v)}
              >
                {useWindow ? 'Checking a window' : 'Check a window'}
              </Button>
              {anyFilter ? (
                <Tooltip content="Clear every filter">
                  <Button variant="ghost" leftIcon={RotateCcw} onClick={clearAll}>
                    Reset
                  </Button>
                </Tooltip>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Filter className="size-3.5 text-slate-500" />
            {RESOURCE_TYPES.map((type) => {
              const selected = types.includes(type.value)
              return (
                <Chip
                  key={type.value}
                  active={selected}
                  onClick={() =>
                    setTypes((list) =>
                      selected ? list.filter((t) => t !== type.value) : [...list, type.value]
                    )
                  }
                >
                  {type.label}
                </Chip>
              )
            })}
            <span className="mx-1 h-4 w-px bg-white/10" />
            {FEATURES.slice(0, 7).map((feature) => {
              const selected = features.includes(feature)
              return (
                <Chip
                  key={feature}
                  active={selected}
                  onClick={() =>
                    setFeatures((list) =>
                      selected ? list.filter((f) => f !== feature) : [...list, feature]
                    )
                  }
                >
                  {humanizeFeature(feature)}
                </Chip>
              )
            })}
          </div>

          {useWindow ? (
            <div className="flex flex-col gap-3 rounded-xl border border-brand-400/20 bg-brand-500/6 p-3 sm:flex-row sm:items-end">
              <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <label className="field-label" htmlFor="exp-date">
                    Date
                  </label>
                  <input
                    id="exp-date"
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    className="field"
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="exp-start">
                    From
                  </label>
                  <input
                    id="exp-start"
                    type="time"
                    value={start}
                    onChange={(event) => setStart(event.target.value)}
                    className="field"
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="exp-end">
                    To
                  </label>
                  <input
                    id="exp-end"
                    type="time"
                    value={end}
                    onChange={(event) => setEnd(event.target.value)}
                    className="field"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={freeCount ? 'mint' : 'rose'} dot>
                  {freeCount} of {rows.length} free
                </Badge>
                <Button variant="ghost" size="sm" onClick={() => setUseWindow(false)}>
                  Stop checking
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-slate-500">
          Showing <span className="num font-semibold text-slate-300">{rows.length}</span> of{' '}
          <span className="num">{db.resources.filter((r) => r.isActive).length}</span> resources
          {windowRange ? (
            <>
              {' '}
              for{' '}
              <span className="font-medium text-slate-300">
                {fmtDayShort(windowRange.start, TZ)} · {fmtRange(windowRange.start, windowRange.end, TZ)}
              </span>
            </>
          ) : null}
        </p>
        <span className="text-[11.5px] text-slate-500">
          Campus utilisation {Math.round(utilization.overallUtilization * 100)}% over{' '}
          {utilization.days} days
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No resource matches those filters"
          description="Loosen the capacity or feature requirements, or clear the filters and start again."
          action={
            <Button variant="secondary" leftIcon={RotateCcw} onClick={clearAll}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row, index) => (
            <ResourceCard
              key={row.resource.id}
              resource={row.resource}
              stats={row.stats}
              availability={row.availability}
              index={index}
              onBook={bookResource}
              onOpen={setActive}
            />
          ))}
        </div>
      )}

      <ResourceDrawer
        resource={active}
        windowRange={windowRange}
        stats={active ? statsById[active.id] : null}
        onClose={() => setActive(null)}
        onBook={(resource, range) => {
          setActive(null)
          navigate('/book', { state: { prefill: { resourceId: resource.id, start: range?.start, end: range?.end } } })
        }}
      />
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Detail drawer
 * ------------------------------------------------------------------------- */

function ResourceDrawer({ resource, stats, windowRange, onClose, onBook }) {
  const db = useDb()

  const agenda = useMemo(() => {
    if (!resource) return []
    const from = new Date()
    const to = new Date(from.getTime() + 7 * 86400000)
    return agendaForResource(resource.id, from.toISOString(), to.toISOString(), db)
      .slice(0, 6)
      .map((booking) => decorate(booking, db))
  }, [db, resource])

  const quiet = useMemo(() => (resource ? bestTimesFor(resource.id, 120, 6, db) : []), [db, resource])

  if (!resource) return null

  return (
    <Drawer
      open={Boolean(resource)}
      onClose={onClose}
      title={resource.name}
      subtitle={`${TYPE_LABEL[resource.type]} · ${resource.location}`}
      footer={
        <div className="flex items-center gap-2">
          <Button className="flex-1" leftIcon={CalendarPlus} onClick={() => onBook(resource, windowRange)}>
            Book this space
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex items-start gap-4">
          <ResourceGlyph type={resource.type} size={56} />
          <dl className="grid flex-1 grid-cols-2 gap-3">
            <div>
              <dt className="text-[10.5px] font-semibold tracking-[0.13em] text-slate-500 uppercase">
                Capacity
              </dt>
              <dd className="num mt-1 flex items-center gap-1.5 text-sm font-semibold text-white">
                <Users className="size-3.5 text-slate-500" />
                {resource.capacity || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[10.5px] font-semibold tracking-[0.13em] text-slate-500 uppercase">
                28-day utilisation
              </dt>
              <dd className="num mt-1 flex items-center gap-1.5 text-sm font-semibold text-white">
                <TrendingUp className="size-3.5 text-slate-500" />
                {Math.round((stats?.utilization ?? 0) * 100)}%
              </dd>
            </div>
            <div>
              <dt className="text-[10.5px] font-semibold tracking-[0.13em] text-slate-500 uppercase">
                Approval
              </dt>
              <dd className="mt-1 flex items-center gap-1.5 text-[12.5px] font-medium text-slate-300">
                <ShieldCheck
                  className={cn('size-3.5', resource.requiresApproval ? 'text-amber-450' : 'text-mint-400')}
                />
                {resource.requiresApproval ? `${resource.approverRole} approval` : 'Instant'}
              </dd>
            </div>
            <div>
              <dt className="text-[10.5px] font-semibold tracking-[0.13em] text-slate-500 uppercase">
                Owner
              </dt>
              <dd className="mt-1 truncate text-[12.5px] font-medium text-slate-300">
                {resource.ownerDepartment}
              </dd>
            </div>
          </dl>
        </div>

        <div>
          <p className="field-label">Features</p>
          <div className="flex flex-wrap gap-1.5">
            {(resource.features ?? []).map((feature) => (
              <span
                key={feature}
                className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-medium text-slate-300"
              >
                {humanizeFeature(feature)}
              </span>
            ))}
            {!resource.features?.length ? (
              <span className="text-[12px] text-slate-500">No listed features.</span>
            ) : null}
          </div>
        </div>

        <div className="surface-sunken p-3.5">
          <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-white">
            <Sparkles className="size-3.5 text-brand-300" />
            Least contested windows
          </p>
          <p className="mt-1 text-[11.5px] text-slate-500">
            Two-hour slots with the least competition in the next six days.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {quiet.length ? (
              quiet.map((window) => (
                <button
                  key={window.start}
                  type="button"
                  onClick={() => onBook(resource, { start: window.start, end: window.end })}
                  className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11.5px] font-medium text-slate-300 transition hover:border-brand-400/40 hover:text-white"
                >
                  {window.label}
                  {window.contested ? (
                    <span className="ml-1.5 text-slate-500">{window.contested} pending</span>
                  ) : (
                    <span className="ml-1.5 text-mint-400">free</span>
                  )}
                </button>
              ))
            ) : (
              <span className="text-[12px] text-slate-500">Fully booked for the next week.</span>
            )}
          </div>
        </div>

        <div>
          <p className="field-label">Next seven days</p>
          {agenda.length ? (
            <ul className="space-y-2">
              {agenda.map((booking) => (
                <li
                  key={booking.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-white/8 bg-white/3 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-semibold text-white">{booking.title}</p>
                    <p className="num mt-0.5 text-[11px] text-slate-500">
                      {fmtDayShort(booking.startTime, TZ)} · {fmtRange(booking.startTime, booking.endTime, TZ)}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">
                      {booking.user?.fullName ?? 'Unknown'} · {booking.user?.club || booking.user?.department}
                    </p>
                  </div>
                  <StatusBadge status={booking.status} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-white/12 px-3 py-6 text-center text-[12px] text-slate-500">
              Wide open for the next week.
            </p>
          )}
        </div>

        <p className="flex items-start gap-2 text-[11px] text-slate-500">
          <MapPin className="mt-0.5 size-3.5 shrink-0" />
          Times are shown in the campus timezone and stored as UTC instants — a booking that ends at
          14:00 and one that starts at 14:00 do not collide.
        </p>
      </div>
    </Drawer>
  )
}
