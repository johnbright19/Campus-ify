import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import {
  ArrowRight,
  Ban,
  CalendarPlus,
  CheckCheck,
  ClipboardList,
  MapPin,
  QrCode,
  Receipt,
  Sparkles,
  Ticket,
  Timer,
  TriangleAlert,
  Undo2,
  Users,
} from 'lucide-react'
import { cn, fmtDayShort, fmtRange, humanizeFeature } from '../../lib/utils'
import { TZ } from '../../lib/utils'
import { ROLE_LABEL } from '../../lib/constants'
import { useDb, useNow } from '../../lib/query'
import { useAuth } from '../../app/AuthProvider'
import { useToast } from '../../app/ToastProvider'
import { useStaggerIn } from '../../lib/gsap'
import { canCheckIn, bookingsFor, cancelBooking, cancelBookingRemote, checkIn, checkInWindow } from '../../services/bookings'
import { Card, SectionTitle } from '../../components/ui/Card'
import { Badge, Button, EmptyState, Segmented, Tooltip } from '../../components/ui/primitives'
import { ConfirmDialog, Modal } from '../../components/ui/Modal'
import { StatusBadge } from '../../components/StatusBadge'
import { Countdown } from '../../components/Countdown'
import { PriorityBreakdown } from '../../components/PriorityBreakdown'
import { ResourceGlyph } from '../../components/ResourceGlyph'

const TABS = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'pending', label: 'Awaiting approval' },
  { value: 'waitlisted', label: 'Waitlist' },
  { value: 'past', label: 'History' },
  { value: 'cancelled', label: 'Released' },
]

export default function MyBookings() {
  const db = useDb()
  const { user, server } = useAuth()
  const { push } = useToast()
  const navigate = useNavigate()
  const nowInstant = useNow(1000)
  const scope = useStaggerIn([])

  const [tab, setTab] = useState('upcoming')
  const [confirmCancel, setConfirmCancel] = useState(null)
  const [detail, setDetail] = useState(null)
  const [qrFor, setQrFor] = useState(null)

  const mine = useMemo(() => bookingsFor(user.id, db), [db, user.id])

  const buckets = useMemo(() => {
    const upcoming = mine.filter(
      (b) => ['approved', 'pending'].includes(b.status) && new Date(b.endTime) >= nowInstant
    )
    const pending = mine.filter((b) => b.status === 'pending')
    const waitlisted = db.waitlist
      .filter((w) => w.userId === user.id)
      .map((w) => ({
        ...w,
        status: w.status === 'offered' ? 'offered' : 'waitlisted',
        resource: db.resources.find((r) => r.id === w.resourceId),
        isWaitlist: true,
      }))
    const past = mine.filter(
      (b) =>
        ['completed', 'no_show'].includes(b.status) ||
        (b.status === 'approved' && new Date(b.endTime) < nowInstant)
    )
    const cancelled = mine.filter((b) => ['cancelled', 'rejected'].includes(b.status))
    return { upcoming, pending, waitlisted, past, cancelled }
  }, [mine, nowInstant, db.waitlist, db.resources, user.id])

  const rows = buckets[tab] ?? []
  const counts = {
    upcoming: buckets.upcoming.length,
    pending: buckets.pending.length,
    waitlisted: buckets.waitlisted.length,
    past: buckets.past.length,
    cancelled: buckets.cancelled.length,
  }

  const doCheckIn = (booking) => {
    try {
      checkIn(booking.id, user.id)
      push({ title: 'Checked in ✔', body: `${booking.title} is secured.`, kind: 'success' })
    } catch (error) {
      push({ title: 'Cannot check in', body: error.message, kind: 'warning' })
    }
  }

  const doCancel = async () => {
    if (!confirmCancel) return
    try {
      // With a backend session the API cancels and the database constraint
      // releases the slot; otherwise the in-browser engine does it.
      const result = server?.connected
        ? await cancelBookingRemote(confirmCancel.id)
        : cancelBooking(confirmCancel.id, user.id)
      push({
        title: 'Booking released',
        body: result.offered
          ? `The waitlist was offered that slot instantly.`
          : 'The slot is back in the pool.',
        kind: 'info',
      })
    } catch (error) {
      push({ title: 'Could not cancel', body: error.message, kind: 'error' })
    } finally {
      setConfirmCancel(null)
    }
  }

  return (
    <div ref={scope} className="space-y-6">
      <SectionTitle
        icon={Ticket}
        title="My bookings"
        subtitle="Check in on time, release what you no longer need, and see exactly how each decision was scored."
        action={
          <Button leftIcon={CalendarPlus} onClick={() => navigate('/book')}>
            New booking
          </Button>
        }
      />

      <div className="reveal flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={tab}
          onChange={setTab}
          options={TABS.map((t) => ({ ...t, count: counts[t.value] }))}
        />
        <p className="text-[11.5px] text-slate-500">
          {buckets.upcoming.length} live · {buckets.pending.length} waiting ·{' '}
          {db.waitlist.filter((w) => w.userId === user.id && w.status === 'offered').length} offer(s)
          open
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          className="reveal"
          icon={ClipboardList}
          title={
            tab === 'upcoming'
              ? 'No upcoming bookings'
              : tab === 'pending'
                ? 'Nothing waiting on an approver'
                : tab === 'past'
                  ? 'No history yet'
                  : 'Nothing released'
          }
          description={
            tab === 'upcoming'
              ? 'Use the concierge or the explorer to grab a space — you will see the priority score before you commit.'
              : 'Once activity happens it will show up here with its full decision record.'
          }
          action={
            <Button variant="secondary" onClick={() => navigate(tab === 'upcoming' ? '/explore' : '/book')}>
              {tab === 'upcoming' ? 'Explore spaces' : 'New booking'}
            </Button>
          }
        />
      ) : (
        <ul className="space-y-4">
          {rows.map((booking) => {
            const checkable = canCheckIn(booking, db.settings, nowInstant)
            const window = checkInWindow(booking, db.settings)
            const isPast = new Date(booking.endTime) < nowInstant
            return (
              <li key={booking.id} className="reveal">
                <Card hover className="overflow-hidden">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3.5">
                      <ResourceGlyph type={booking.resource?.type} size={46} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={booking.status} />
                          <Badge tone="brand">{humanizeFeature(booking.eventType)}</Badge>
                          {booking.verified ? (
                            <Badge tone="mint">verified</Badge>
                          ) : null}
                          {booking.source !== 'web' ? (
                            <span className="text-[10.5px] tracking-wide text-slate-500 uppercase">
                              via {booking.source}
                            </span>
                          ) : null}
                        </div>
                        <h3 className="mt-2 truncate text-[16px] font-semibold text-white">
                          {booking.title}
                        </h3>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-slate-400">
                          <span className="flex items-center gap-1.5">
                            <MapPin className="size-3.5 text-slate-500" />
                            {booking.resource?.name} · {booking.resource?.location}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Users className="size-3.5 text-slate-500" />
                            {booking.attendees}
                          </span>
                        </p>
                        <p className="num mt-1.5 text-[13px] font-medium text-slate-300">
                          {fmtDayShort(booking.startTime, TZ)} ·{' '}
                          {fmtRange(booking.startTime, booking.endTime, TZ)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      {booking.status === 'approved' && !isPast ? (
                        <Countdown to={booking.startTime} prefix="starts" />
                      ) : null}
                      {booking.status === 'pending' ? (
                        <span className="flex items-center gap-1.5 text-[11.5px] text-slate-500">
                          <Timer className="size-3.5" />
                          waiting since {fmtDayShort(booking.createdAt, TZ)}
                        </span>
                      ) : null}

                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {checkable ? (
                          <Button size="sm" leftIcon={CheckCheck} onClick={() => doCheckIn(booking)}>
                            Check in
                          </Button>
                        ) : null}
                        {booking.status === 'approved' && booking.qrToken && !isPast ? (
                          <Tooltip content="Show the check-in QR">
                            <Button size="sm" variant="secondary" leftIcon={QrCode} onClick={() => setQrFor(booking)}>
                              QR
                            </Button>
                          </Tooltip>
                        ) : null}
                        <Button size="sm" variant="secondary" onClick={() => setDetail(booking)}>
                          Decision
                        </Button>
                        {['approved', 'pending'].includes(booking.status) && !isPast ? (
                          <Button
                            size="sm"
                            variant="danger"
                            leftIcon={Undo2}
                            onClick={() => setConfirmCancel(booking)}
                          >
                            Release
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {booking.status === 'no_show' ? (
                    <p className="mt-4 flex items-start gap-2 rounded-xl border border-rose-450/25 bg-rose-500/8 px-3.5 py-3 text-[12px] leading-relaxed text-rose-200">
                      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                      Auto-released: no check-in within {db.settings.noShowGraceMin} minutes of start.
                      This added a strike and −5 priority points.
                    </p>
                  ) : null}

                  {booking.status === 'approved' && !checkable && !booking.checkedInAt && !isPast ? (
                    <p className="mt-4 text-[11.5px] text-slate-500">
                      Check-in opens{' '}
                      <span className="num text-slate-300">{fmtRange(window.opensAt, window.closesAt, TZ)}</span>{' '}
                      — missing it releases the slot to this resource's waitlist.
                    </p>
                  ) : null}

                  {booking.checkedInAt ? (
                    <p className="mt-4 flex items-center gap-1.5 text-[11.5px] text-mint-400">
                      <CheckCheck className="size-3.5" />
                      Checked in {fmtDayShort(booking.checkedInAt, TZ)} at {fmtRange(booking.checkedInAt, booking.checkedInAt, TZ)}
                    </p>
                  ) : null}
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      {/* Cancel confirm */}
      <ConfirmDialog
        open={Boolean(confirmCancel)}
        onClose={() => setConfirmCancel(null)}
        onConfirm={doCancel}
        title="Release this booking?"
        description={
          confirmCancel
            ? `${confirmCancel.title} · ${fmtRange(confirmCancel.startTime, confirmCancel.endTime, TZ)}. The waitlist is promoted immediately, highest priority first.`
            : ''
        }
        confirmLabel="Release booking"
      />

      {/* QR */}
      <Modal
        open={Boolean(qrFor)}
        onClose={() => setQrFor(null)}
        icon={QrCode}
        title="Check-in code"
        subtitle={qrFor ? `${qrFor.title} · ${fmtRange(qrFor.startTime, qrFor.endTime, TZ)}` : ''}
        size="sm"
      >
        {qrFor ? (
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-2xl bg-white p-4">
              <QRCodeSVG value={qrFor.qrToken ?? qrFor.id} size={180} level="M" />
            </div>
            <p className="num text-[11px] break-all text-slate-500">{qrFor.qrToken}</p>
            <p className="text-center text-[12px] leading-relaxed text-slate-400">
              Signed token containing the booking id and expiry. An organiser scans it, or taps
              Check in, between {fmtRange(checkInWindow(qrFor, db.settings).opensAt, checkInWindow(qrFor, db.settings).closesAt, TZ)}.
            </p>
          </div>
        ) : null}
      </Modal>

      {/* Decision detail */}
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        icon={Receipt}
        title="How this was decided"
        subtitle={detail ? `${detail.title} · priority ${detail.priorityScore}` : ''}
        footer={
          detail ? (
            <>
              <Button variant="secondary" onClick={() => setDetail(null)}>
                Close
              </Button>
              <Button
                leftIcon={ArrowRight}
                onClick={() => {
                  setDetail(null)
                  navigate('/waitlist')
                }}
              >
                Waitlist options
              </Button>
            </>
          ) : null
        }
      >
        {detail ? (
          <div className="space-y-4">
            <PriorityBreakdown
              score={detail.priorityScore}
              breakdown={detail.priorityBreakdown}
              notes={detail.aiMeta?.scoreNotes ?? []}
              verified={detail.verified}
            />
            <div className="grid grid-cols-2 gap-3 border-t border-white/8 pt-4 text-[12px]">
              <div>
                <p className="text-slate-500">Status</p>
                <p className="mt-0.5 font-medium text-slate-200">{detail.status}</p>
              </div>
              <div>
                <p className="text-slate-500">Event type</p>
                <p className="mt-0.5 font-medium text-slate-200">{humanizeFeature(detail.eventType)}</p>
              </div>
              <div>
                <p className="text-slate-500">Requester role weight</p>
                <p className="mt-0.5 font-medium text-slate-200">
                  {ROLE_LABEL[detail.user?.role] ?? detail.user?.role}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Created</p>
                <p className="mt-0.5 font-medium text-slate-200">
                  {fmtDayShort(detail.createdAt, TZ)}
                </p>
              </div>
            </div>
            {detail.aiMeta?.changesRequested ? (
              <p className="flex items-start gap-2 rounded-xl border border-amber-450/25 bg-amber-450/8 px-3 py-2.5 text-[12px] text-amber-100">
                <Sparkles className="mt-0.5 size-3.5 shrink-0" />
                Approver asked for changes: {detail.aiMeta.changesRequested}
              </p>
            ) : null}
            {detail.status === 'rejected' ? (
              <p className="flex items-start gap-2 rounded-xl border border-rose-450/25 bg-rose-500/8 px-3 py-2.5 text-[12px] text-rose-200">
                <Ban className="mt-0.5 size-3.5 shrink-0" />
                Declined — review the breakdown above; the factor that lost you the slot is the
                largest negative difference.
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
