import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, CloudOff, Layers, Radio, RefreshCw, Timer } from 'lucide-react'
import {
  TZ,
  cn,
  fmtDayShort,
  fmtRange,
  humanizeFeature,
  pad,
  wallAt,
  wallOf,
  dayKey,
} from '../../lib/utils'
import { CAMPUS, RESOURCE_TYPES } from '../../lib/constants'
import { useDb, useNow } from '../../lib/query'
import { useAuth } from '../../app/AuthProvider'
import { useStaggerIn } from '../../lib/gsap'
import { onEvent } from '../../lib/store'
import { syncAll } from '../../lib/sync'
import { decorate } from '../../services/bookings'
import { Card, SectionTitle } from '../../components/ui/Card'
import { Badge, Button, Chip, Segmented } from '../../components/ui/primitives'
import { Modal } from '../../components/ui/Modal'
import { StatusBadge } from '../../components/StatusBadge'
import { PriorityBreakdown } from '../../components/PriorityBreakdown'
import { UserChip } from '../../components/UserChip'
import { ResourceGlyph } from '../../components/ResourceGlyph'
import CampusGrid from './CampusGrid'

const VISIBLE_STATUSES = ['pending', 'approved', 'completed', 'no_show']

export default function WeekCalendar() {
  const db = useDb()
  const { user, server } = useAuth()
  const navigate = useNavigate()
  const scope = useStaggerIn([])
  const nowInstant = useNow(15000)

  const [colorMode, setColorMode] = useState('resource')
  const [mode, setMode] = useState('day')
  const [anchor, setAnchor] = useState(() => wallOf(nowInstant))
  const [typeFilter, setTypeFilter] = useState(null)
  const [resourceFilter, setResourceFilter] = useState('all')
  const [pulses, setPulses] = useState({})
  const [selected, setSelected] = useState(null)
  const [liveCount, setLiveCount] = useState(0)
  const [lastEvent, setLastEvent] = useState(null)
  const [syncing, setSyncing] = useState(false)

  // Realtime: the sync layer fires a pulse whenever the server's booking set
  // changes, so a booking made in another tab lights up its space here.
  useEffect(() => {
    return onEvent((event) => {
      if (event?.type !== 'pulse') return
      const resourceId = event.resourceId ?? event.pulse?.resourceId
      if (!resourceId) return
      setLiveCount((n) => n + 1)
      setLastEvent({ resourceId, at: Date.now(), reason: event.reason })
      setPulses((map) => ({ ...map, [resourceId]: Date.now() }))
      window.setTimeout(
        () =>
          setPulses((map) => {
            const next = { ...map }
            delete next[resourceId]
            return next
          }),
        2600
      )
    })
  }, [])

  const visibleResources = useMemo(
    () =>
      db.resources
        .filter((r) => r.isActive && (!typeFilter || r.type === typeFilter))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [db.resources, typeFilter]
  )

  const visibleBookings = useMemo(() => {
    const allowed = new Set(
      visibleResources
        .filter((r) => resourceFilter === 'all' || r.id === resourceFilter)
        .map((r) => r.id)
    )
    return db.bookings.filter(
      (b) => allowed.has(b.resourceId) && VISIBLE_STATUSES.includes(b.status)
    )
  }, [db.bookings, visibleResources, resourceFilter])

  const handleEventClick = useCallback(
    (booking) => setSelected(decorate(booking, db)),
    [db]
  )

  const handleSlotClick = useCallback(
    (resource, minutes, endMinutes, day = null) => {
      const wall = day ?? anchor
      const hour = day ? 10 : Math.floor(minutes / 60)
      const minute = day ? 0 : minutes % 60
      const endHour = day ? 11 : Math.floor(endMinutes / 60)
      const endMinute = day ? 0 : endMinutes % 60
      navigate('/book', {
        state: {
          prefill: {
            resourceId: resource.id,
            start: wallAt(wall, hour, minute).toISOString(),
            end: wallAt(wall, endHour, endMinute).toISOString(),
          },
        },
      })
    },
    [anchor, navigate]
  )

  const handleSync = useCallback(async () => {
    setSyncing(true)
    try {
      await syncAll()
    } finally {
      setSyncing(false)
    }
  }, [])

  const upcoming = useMemo(
    () =>
      db.bookings
        .filter(
          (b) =>
            ['pending', 'approved'].includes(b.status) && new Date(b.endTime) >= nowInstant
        )
        .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
        .slice(0, 6)
        .map((b) => decorate(b, db)),
    [db, nowInstant]
  )

  const viewLabel = mode === 'day' ? dayKey(wallAt(anchor, 0, 0)) : 'week'

  return (
    <div ref={scope} className="space-y-6">
      <SectionTitle
        icon={CalendarDays}
        title="Live campus calendar"
        subtitle="One row per space, time across — every booking gets its own block."
        action={
          <div className="flex items-center gap-2">
            <Badge tone={server.connected ? 'mint' : 'amber'} dot>
              {server.connected ? <Radio className="size-3" /> : <CloudOff className="size-3" />}
              {server.connected ? 'live · server' : 'demo data'}
            </Badge>
            <Button variant="secondary" onClick={handleSync} loading={syncing}>
              <RefreshCw className="size-3.5" />
              Sync
            </Button>
            <Button onClick={() => navigate('/book')}>New booking</Button>
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_18rem]">
        <Card className="reveal overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">
                Colour by
              </span>
              <Segmented
                value={colorMode}
                onChange={setColorMode}
                options={[
                  { value: 'resource', label: 'Space type' },
                  { value: 'status', label: 'Status' },
                ]}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={resourceFilter}
                onChange={(event) => setResourceFilter(event.target.value)}
                className="field w-auto py-1.5 text-[12px]"
                aria-label="Filter by resource"
              >
                <option value="all">All spaces ({visibleResources.length})</option>
                {db.resources
                  .filter((r) => r.isActive)
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
              </select>
              <Chip active={!typeFilter} onClick={() => setTypeFilter(null)}>
                Everything
              </Chip>
              {RESOURCE_TYPES.map((type) => (
                <Chip
                  key={type.value}
                  active={typeFilter === type.value}
                  onClick={() => setTypeFilter(typeFilter === type.value ? null : type.value)}
                >
                  {type.short}
                </Chip>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <CampusGrid
              bookings={visibleBookings}
              resources={visibleResources}
              anchor={anchor}
              onAnchorChange={setAnchor}
              mode={mode}
              onModeChange={setMode}
              colorMode={colorMode}
              onEventClick={handleEventClick}
              onSlotClick={handleSlotClick}
              now={nowInstant}
              pulses={pulses}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/8 pt-4 text-[11.5px] text-slate-400">
            {colorMode === 'status'
              ? [
                  ['Approved', 'bg-emerald-400'],
                  ['Pending', 'bg-amber-400'],
                  ['Completed', 'bg-brand-400'],
                  ['No-show', 'bg-rose-400'],
                ].map(([label, tone]) => (
                  <span key={label} className="flex items-center gap-1.5">
                    <span className={cn('size-2.5 rounded-[3px]', tone)} />
                    {label}
                  </span>
                ))
              : RESOURCE_TYPES.map((type) => (
                  <span key={type.value} className="flex items-center gap-1.5">
                    <span
                      className="size-2.5 rounded-[3px]"
                      style={{ background: type.accent }}
                    />
                    {type.short}
                  </span>
                ))}
            <span className="ml-auto flex items-center gap-1.5 text-slate-500">
              <Timer className="size-3" />
              {CAMPUS.zoneLabel} · {viewLabel}
            </span>
          </div>
        </Card>

        {/* Side rail */}
        <div className="space-y-6">
          <Card className="reveal">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-xl border border-brand-400/25 bg-brand-500/12 text-brand-300">
                <Radio className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-white">Live feed</p>
                <p className="truncate text-[11px] text-slate-500">
                  {lastEvent
                    ? `${db.resources.find((r) => r.id === lastEvent.resourceId)?.name ?? 'Campus'} · ${lastEvent.reason}`
                    : server.connected
                      ? 'Watching the server for changes…'
                      : 'Not connected — showing seed data'}
                </p>
              </div>
            </div>
            <p className="mt-3 text-[11.5px] leading-relaxed text-slate-400">
              {server.connected
                ? 'Bookings are polled from the Express API every few seconds. Create one in this tab or another and it lands on the grid immediately.'
                : 'Sign in to load resources and bookings from the backend. Until then this grid is driven by the local demo seed.'}
            </p>
            <div className="mt-3 flex items-center justify-between rounded-xl border border-white/8 bg-white/3 px-3 py-2">
              <span className="text-[11.5px] text-slate-500">Updates since load</span>
              <span className="num text-[13px] font-semibold text-white">{liveCount}</span>
            </div>
            {server.lastSyncAt ? (
              <p className="num mt-2 text-[10.5px] text-slate-600">
                Last sync {fmtTimeOf(server.lastSyncAt)}
              </p>
            ) : null}
          </Card>

          <Card className="reveal">
            <div className="flex items-center gap-2">
              <Layers className="size-4 text-aqua-400" />
              <p className="text-[13.5px] font-semibold text-white">Coming up</p>
            </div>
            <div className="mt-3 space-y-2.5">
              {upcoming.map((booking) => (
                <button
                  key={booking.id}
                  type="button"
                  onClick={() => setSelected(booking)}
                  className="flex w-full items-start gap-3 rounded-xl border border-white/8 bg-white/3 px-3 py-2.5 text-left transition hover:border-white/18"
                >
                  <ResourceGlyph type={booking.resource?.type} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold text-white">
                      {booking.title}
                    </span>
                    <span className="num block text-[10.5px] text-slate-500">
                      {fmtDayShort(booking.startTime, TZ)} ·{' '}
                      {fmtRange(booking.startTime, booking.endTime, TZ)}
                    </span>
                  </span>
                  <StatusBadge status={booking.status} showIcon={false} />
                </button>
              ))}
              {!upcoming.length ? (
                <p className="rounded-xl border border-dashed border-white/12 px-3 py-6 text-center text-[12px] text-slate-500">
                  Calendar is clear.
                </p>
              ) : null}
            </div>
          </Card>
        </div>
      </div>

      {/* Booking detail */}
      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.title ?? ''}
        subtitle={
          selected
            ? `${selected.resource?.name} · ${fmtDayShort(selected.startTime, TZ)} · ${fmtRange(
                selected.startTime,
                selected.endTime,
                TZ
              )}`
            : ''
        }
        footer={
          selected ? (
            <>
              <Button variant="ghost" onClick={() => setSelected(null)}>
                Close
              </Button>
              {selected.userId === user?.id ? (
                <Button onClick={() => navigate('/bookings')}>Manage booking</Button>
              ) : (
                <Button
                  onClick={() =>
                    navigate('/book', {
                      state: {
                        prefill: {
                          resourceId: selected.resourceId,
                          start: selected.startTime,
                          end: selected.endTime,
                        },
                      },
                    })
                  }
                >
                  Request same slot
                </Button>
              )}
            </>
          ) : null
        }
      >
        {selected ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={selected.status} />
              <Badge tone="brand">{humanizeFeature(selected.eventType)}</Badge>
              <span className="text-[11.5px] text-slate-500">
                {selected.attendees} attendee(s)
              </span>
            </div>

            <UserChip user={selected.user} />

            {selected.purpose ? (
              <p className="rounded-xl border border-white/8 bg-white/3 px-3.5 py-3 text-[12.5px] leading-relaxed text-slate-300">
                {selected.purpose}
              </p>
            ) : null}

            <div className="border-t border-white/8 pt-4">
              <PriorityBreakdown
                score={selected.priorityScore}
                breakdown={selected.priorityBreakdown}
                notes={selected.aiMeta?.scoreNotes ?? []}
                verified={selected.verified}
                dense
              />
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}

function fmtTimeOf(iso) {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}