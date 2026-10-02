import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  BadgeCheck,
  Check,
  CheckCheck,
  Clock,
  HelpCircle,
  Inbox,
  Layers,
  ListChecks,
  Scale,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Users,
  X,
} from 'lucide-react'
import { TZ, cn, fmtDayShort, fmtRange, fmtRelative, humanizeFeature } from '../../lib/utils'
import { ROLE_LABEL } from '../../lib/constants'
import { useDb, useNow } from '../../lib/query'
import { useAuth } from '../../app/AuthProvider'
import { useToast } from '../../app/ToastProvider'
import { useStaggerIn } from '../../lib/gsap'
import {
  approveBooking,
  approveBookingRemote,
  closeCallQueue,
  pendingForApprover,
  rejectBooking,
  rejectBookingRemote,
  requestChanges,
  verifyHighPriority,
} from '../../services/bookings'
import { summarizeRequestForApprover } from '../../services/ai'
import { Card, SectionTitle } from '../../components/ui/Card'
import { Badge, Button, Checkbox, EmptyState, Segmented, Tooltip } from '../../components/ui/primitives'
import { Modal } from '../../components/ui/Modal'
import { StatusBadge } from '../../components/StatusBadge'
import { Countdown } from '../../components/Countdown'
import { PriorityBreakdown } from '../../components/PriorityBreakdown'
import { UserChip } from '../../components/UserChip'
import { ResourceGlyph } from '../../components/ResourceGlyph'
import { ConflictComparison } from './ConflictComparison'

export default function ApprovalsInbox() {
  const db = useDb()
  const { user, server } = useAuth()
  const { push } = useToast()
  const navigate = useNavigate()
  const nowInstant = useNow(30000)
  const scope = useStaggerIn([])

  const [tab, setTab] = useState('queue')
  const [open, setOpen] = useState(null)
  const [selected, setSelected] = useState([])
  const [rejectFor, setRejectFor] = useState(null)
  const [rejectReason, setRejectReason] = useState('')

  const queue = useMemo(() => pendingForApprover(user.id, db), [db, user.id])
  const closeCalls = useMemo(
    () => (['hod', 'admin'].includes(user.role) ? closeCallQueue(db, user.id) : []),
    [db, user.role]
  )
  const approvedRecently = useMemo(
    () =>
      db.bookings
        .filter((b) => b.status === 'approved')
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, 12)
        .map((b) => ({
          ...b,
          user: db.profiles.find((p) => p.id === b.userId),
          resource: db.resources.find((r) => r.id === b.resourceId),
        })),
    [db]
  )

  const actionable = tab === 'queue' ? queue : approvedRecently

  const toggle = (id) =>
    setSelected((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))

  const briefs = useMemo(() => {
    const map = {}
    for (const booking of queue) {
      map[booking.id] = summarizeRequestForApprover(booking, { log: false })
    }
    return map
  }, [queue])

  const busyByBooking = useMemo(() => {
    const map = {}
    for (const booking of queue) {
      const conflicts = db.bookings.filter(
        (b) =>
          b.id !== booking.id &&
          b.resourceId === booking.resourceId &&
          ['pending', 'approved'].includes(b.status) &&
          new Date(b.startTime) < new Date(booking.endTime) &&
          new Date(b.endTime) > new Date(booking.startTime)
      )
      map[booking.id] = conflicts
    }
    return map
  }, [db.bookings, queue])

  const decide = async (booking, action) => {
    try {
      if (action === 'approve') {
        if (server?.connected) {
          await approveBookingRemote(booking.id, booking.verified)
          push({ title: 'Approved', body: `${booking.title} is confirmed.`, kind: 'success' })
        } else {
          const result = approveBooking(booking.id, user.id, { verified: booking.verified })
          push({
            title: 'Approved',
            body: result.bumped?.length
              ? `${result.bumped.length} competing request(s) notified with alternatives.`
              : `${booking.title} is confirmed.`,
            kind: 'success',
          })
        }
      }
      if (action === 'changes') {
        requestChanges(booking.id, user.id, 'Please confirm the headcount and equipment needs.')
        push({ title: 'Changes requested', body: booking.title, kind: 'info' })
      }
      if (action === 'verify') {
        const score = verifyHighPriority(booking.id, user.id)
        push({ title: 'Claim verified', body: `New priority score ${score}.`, kind: 'success' })
      }
      setOpen(null)
    } catch (error) {
      if (error.code === 'CONFLICT') {
        push({
          title: 'Blocked by a conflict',
          body: 'Another approved booking now owns that slot. Ranked alternatives are shown in the detail view.',
          kind: 'conflict',
        })
      } else {
        push({ title: 'Decision failed', body: error.message, kind: 'error' })
      }
    }
  }

  const approveAll = async () => {
    let done = 0
    let blocked = 0
    for (const id of selected) {
      try {
        if (server?.connected) await approveBookingRemote(id)
        else approveBooking(id, user.id)
        done += 1
      } catch {
        blocked += 1
      }
    }
    setSelected([])
    push({
      title: `Approved ${done} request(s)`,
      body: blocked ? `${blocked} were blocked by a hard conflict.` : 'All clean.',
      kind: blocked ? 'warning' : 'success',
    })
  }

  const doReject = async () => {
    if (!rejectFor) return
    try {
      if (server?.connected) {
        await rejectBookingRemote(rejectFor.id, rejectReason || 'Not specified')
      } else {
        rejectBooking(rejectFor.id, user.id, rejectReason || 'Not specified')
      }
      push({ title: 'Declined', body: `${rejectFor.title} was declined.`, kind: 'warning' })
    } catch (error) {
      push({ title: 'Could not decline', body: error.message, kind: 'error' })
    } finally {
      setRejectFor(null)
      setRejectReason('')
      setOpen(null)
    }
  }

  return (
    <div ref={scope} className="space-y-6">
      <SectionTitle
        icon={Inbox}
        title="Approvals inbox"
        subtitle={user.role === 'hod'
          ? `${user.department} department · review requests for your branch and resolve close calls.`
          : 'Every request arrives with its conflict picture and the risk flags that matter.'}
        action={
          selected.length ? (
            <Button leftIcon={CheckCheck} onClick={approveAll}>
              Approve {selected.length} selected
            </Button>
          ) : (
            <Badge tone={queue.length ? 'amber' : 'mint'} dot>
              {queue.length ? `${queue.length} waiting` : 'queue clear'}
            </Badge>
          )
        }
      />

      {user.role === 'hod' ? (
        <div className="reveal flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/3 px-4 py-3">
          <div>
            <p className="text-[10.5px] font-semibold uppercase text-slate-500">Department review</p>
            <p className="mt-0.5 text-[13px] font-semibold text-white">{user.department}</p>
            <p className="text-[11.5px] text-slate-400">Only this branch's requests and close calls are shown.</p>
          </div>
          <Badge tone={queue.length ? 'amber' : 'mint'} dot>
            {queue.length ? `${queue.length} awaiting review` : 'No pending requests'}
          </Badge>
        </div>
      ) : null}

      <div className="reveal grid gap-4 sm:grid-cols-3">
        <Card className="flex items-center gap-3.5">
          <span className="flex size-10 items-center justify-center rounded-xl border border-amber-450/25 bg-amber-450/10 text-amber-450">
            <Clock className="size-4.5" />
          </span>
          <div>
            <p className="num text-xl font-bold text-white">{queue.length}</p>
            <p className="text-[11.5px] text-slate-500">in your queue</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3.5">
          <span className="flex size-10 items-center justify-center rounded-xl border border-rose-450/25 bg-rose-450/10 text-rose-450">
            <Scale className="size-4.5" />
          </span>
          <div>
            <p className="num text-xl font-bold text-white">{closeCalls.length}</p>
            <p className="text-[11.5px] text-slate-500">close calls for a human</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3.5">
          <span className="flex size-10 items-center justify-center rounded-xl border border-mint-400/25 bg-mint-400/10 text-mint-400">
            <BadgeCheck className="size-4.5" />
          </span>
          <div>
            <p className="num text-xl font-bold text-white">
              {db.settings.approvalSlaHours}h
            </p>
            <p className="text-[11.5px] text-slate-500">SLA before escalation</p>
          </div>
        </Card>
      </div>

      {closeCalls.length ? (
        <Card className="reveal border-rose-450/25 bg-rose-500/6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-9 items-center justify-center rounded-xl border border-rose-450/30 bg-rose-450/12 text-rose-450">
                <Scale className="size-4.5" />
              </span>
              <div>
                <p className="text-[14px] font-semibold text-rose-100">
                  {closeCalls.length} contest the same windows and are too close to call
                </p>
                <p className="mt-0.5 text-[12px] text-rose-200/80">
                  The gap is inside the configured margin, so the engine refuses to pick a winner.
                </p>
              </div>
            </div>
            <Button size="sm" variant="secondary" rightIcon={ArrowRight} onClick={() => navigate('/mediator')}>
              Open mediator desk
            </Button>
          </div>
        </Card>
      ) : null}

      <div className="reveal">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'queue', label: 'Awaiting you', count: queue.length },
            { value: 'approved', label: 'Recently approved', count: approvedRecently.length },
          ]}
        />
      </div>

      {actionable.length === 0 ? (
        <EmptyState
          className="reveal"
          icon={ListChecks}
          title={tab === 'queue' ? 'Nothing waiting on you' : 'No decisions yet'}
          description={
            tab === 'queue'
              ? 'Requests routed to your role or department will appear here with their AI brief.'
              : 'Once you approve or decline something it shows up here for a quick re-check.'
          }
        />
      ) : (
        <ul className="space-y-4">
          {actionable.map((booking) => {
            const brief = briefs[booking.id]
            const conflicts = busyByBooking[booking.id] ?? []
            const closePair = closeCalls.find((p) => p.a.id === booking.id || p.b.id === booking.id)
            const waitingHours = (nowInstant - new Date(booking.createdAt)) / 3600000
            const stale = waitingHours > db.settings.approvalSlaHours

            return (
              <li key={booking.id} className="reveal">
                <Card hover className="overflow-hidden">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3.5">
                      {tab === 'queue' ? (
                        <Checkbox
                          checked={selected.includes(booking.id)}
                          onChange={() => toggle(booking.id)}
                          label={`Select ${booking.title}`}
                          className="mt-1"
                        />
                      ) : null}
                      <ResourceGlyph type={booking.resource?.type} size={46} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={booking.status} />
                          <Badge tone="brand">{humanizeFeature(booking.eventType)}</Badge>
                          {['exam', 'placement'].includes(booking.eventType) ? (
                            <Badge tone={booking.verified ? 'mint' : 'amber'}>
                              {booking.verified ? 'verified' : 'unverified claim'}
                            </Badge>
                          ) : null}
                          {conflicts.length ? (
                            <Badge tone="amber" icon={Layers}>
                              {conflicts.length} overlapping
                            </Badge>
                          ) : null}
                          {stale ? (
                            <Badge tone="rose" icon={TriangleAlert}>
                              SLA breach
                            </Badge>
                          ) : null}
                        </div>

                        <h3 className="mt-2 text-[16px] font-semibold text-white">{booking.title}</h3>
                        <p className="mt-1 text-[12.5px] text-slate-400">
                          {booking.resource?.name} · {booking.resource?.location} ·{' '}
                          {booking.attendees} people
                        </p>
                        <p className="num mt-1 text-[12.5px] font-medium text-slate-300">
                          {fmtDayShort(booking.startTime, TZ)} ·{' '}
                          {fmtRange(booking.startTime, booking.endTime, TZ)}
                        </p>

                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <UserChip user={booking.user} size={28} />
                          <span className="text-[11.5px] text-slate-500">
                            requested {fmtRelative(booking.createdAt, nowInstant, TZ)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <Tooltip content="Transparent priority score — click for the full breakdown">
                        <button
                          type="button"
                          onClick={() => setOpen(booking)}
                          className="num rounded-xl border border-brand-400/30 bg-brand-500/10 px-3 py-1.5 text-lg font-bold text-brand-200 transition hover:bg-brand-500/18"
                        >
                          {booking.priorityScore}
                        </button>
                      </Tooltip>
                      <Countdown to={booking.startTime} prefix="starts" />

                      {tab === 'queue' ? (
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Button size="sm" leftIcon={Check} onClick={() => decide(booking, 'approve')}>
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            leftIcon={X}
                            onClick={() => {
                              setRejectFor(booking)
                              setRejectReason('')
                            }}
                          >
                            Decline
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setOpen(booking)}>
                            Brief
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => setOpen(booking)}>
                          View record
                        </Button>
                      )}
                    </div>
                  </div>

                  {brief && tab === 'queue' ? (
                    <div className="mt-4 rounded-xl border border-aqua-400/20 bg-aqua-400/5 p-3.5">
                      <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-slate-200">
                        <Sparkles className="mt-0.5 size-3.5 shrink-0 text-aqua-400" />
                        <span>{brief.summary}</span>
                      </p>
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <Badge tone={brief.suggestedAction === 'approve' ? 'mint' : 'amber'}>
                          suggests {brief.suggestedAction.replace(/_/g, ' ')}
                        </Badge>
                        <span className="text-[11.5px] text-slate-400">{brief.reason}</span>
                      </div>
                      {brief.riskFlags?.length ? (
                        <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-white/8 pt-2.5">
                          {brief.riskFlags.map((flag) => (
                            <span
                              key={flag}
                              className="flex items-center gap-1 rounded-md border border-amber-450/25 bg-amber-450/10 px-2 py-0.5 text-[10.5px] font-medium text-amber-450"
                            >
                              <TriangleAlert className="size-3" />
                              {flag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {closePair && tab === 'queue' ? (
                    <div className="mt-3">
                      <ConflictComparison pair={closePair} compact />
                    </div>
                  ) : null}
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      {/* Detail modal */}
      <Modal
        open={Boolean(open)}
        onClose={() => setOpen(null)}
        icon={HelpCircle}
        title={open?.title ?? ''}
        subtitle={
          open
            ? `${open.resource?.name} · ${fmtDayShort(open.startTime, TZ)} · ${fmtRange(open.startTime, open.endTime, TZ)}`
            : ''
        }
        footer={
          open && tab === 'queue' ? (
            <>
              {['exam', 'placement'].includes(open.eventType) && !open.verified ? (
                <Button variant="success" leftIcon={ShieldCheck} onClick={() => decide(open, 'verify')}>
                  Verify claim
                </Button>
              ) : null}
              <Button variant="secondary" onClick={() => decide(open, 'changes')}>
                Ask for changes
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setRejectFor(open)
                  setOpen(null)
                }}
              >
                Decline
              </Button>
              <Button leftIcon={Check} onClick={() => decide(open, 'approve')}>
                Approve
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setOpen(null)}>
              Close
            </Button>
          )
        }
      >
        {open ? (
          <div className="space-y-5">
            <UserChip user={open.user} />

            {open.purpose ? (
              <p className="rounded-xl border border-white/8 bg-white/3 px-3.5 py-3 text-[12.5px] leading-relaxed text-slate-300">
                {open.purpose}
              </p>
            ) : null}

            {briefs[open.id] ? (
              <div className="rounded-xl border border-aqua-400/20 bg-aqua-400/5 p-3.5">
                <p className="flex items-center gap-1.5 text-[12px] font-semibold text-aqua-200">
                  <Sparkles className="size-3.5" />
                  Approval copilot brief
                </p>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-300">
                  {briefs[open.id].summary}
                </p>
                {briefs[open.id].riskFlags?.length ? (
                  <ul className="mt-2 space-y-1">
                    {briefs[open.id].riskFlags.map((flag) => (
                      <li key={flag} className="flex items-center gap-1.5 text-[11.5px] text-amber-450">
                        <TriangleAlert className="size-3" />
                        {flag}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1.5 text-[11.5px] text-mint-400">No risk flags on this request.</p>
                )}
              </div>
            ) : null}

            <div className="border-t border-white/8 pt-4">
              <p className="mb-3 flex items-center gap-1.5 text-[12.5px] font-semibold text-white">
                <Users className="size-3.5 text-slate-500" />
                Overlapping activity
              </p>
              {(busyByBooking[open.id] ?? []).length ? (
                <ul className="space-y-2">
                  {(busyByBooking[open.id] ?? []).map((other) => (
                    <li
                      key={other.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/3 px-3 py-2.5"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[12.5px] font-medium text-slate-200">
                          {other.title}
                        </span>
                        <span className="num block text-[11px] text-slate-500">
                          {fmtRange(other.startTime, other.endTime, TZ)}
                        </span>
                      </span>
                      <StatusBadge status={other.status} showIcon={false} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-xl border border-dashed border-white/12 px-3 py-5 text-center text-[12px] text-slate-500">
                  Nothing else overlaps this window.
                </p>
              )}
            </div>

            <div className="border-t border-white/8 pt-4">
              <PriorityBreakdown
                score={open.priorityScore}
                breakdown={open.priorityBreakdown}
                notes={open.aiMeta?.scoreNotes ?? []}
                verified={open.verified}
              />
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Reject modal */}
      <Modal
        open={Boolean(rejectFor)}
        onClose={() => setRejectFor(null)}
        icon={X}
        title="Decline this request"
        subtitle={rejectFor ? `${rejectFor.title} · by ${rejectFor.user?.fullName}` : ''}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectFor(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={doReject}>
              Decline with reason
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-[12.5px] leading-relaxed text-slate-400">
            The reason is delivered to the requester and written to the audit trail. Say what would
            make it approvable — that is what turns a rejection into a rebooking.
          </p>
          <textarea
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            rows={3}
            placeholder="e.g. Hall A is reserved for the examination; try Seminar Hall B the same afternoon."
            className="field resize-none"
          />
          <div className="flex flex-wrap gap-1.5">
            {[
              'Space already committed to an examination',
              'Headcount exceeds the safe limit for this room',
              'Needs an HOD sign-off first',
              'Please move to another slot',
            ].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setRejectReason(preset)}
                className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-400 transition hover:border-white/20 hover:text-white"
              >
                {preset}
              </button>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  )
}
