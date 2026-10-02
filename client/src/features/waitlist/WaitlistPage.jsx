import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  CircleDashed,
  Hourglass,
  Info,
  ListOrdered,
  Search,
  Sparkles,
  Trash2,
  Trophy,
  Users,
} from 'lucide-react'
import { cn, fmtDayShort, fmtRange, fmtRelative, humanizeFeature } from '../../lib/utils'
import { TZ } from '../../lib/utils'
import { useDb, useNow } from '../../lib/query'
import { useAuth } from '../../app/AuthProvider'
import { useToast } from '../../app/ToastProvider'
import { useStaggerIn } from '../../lib/gsap'
import { confirmWaitlistOffer } from '../../services/bookings'
import { queueDepthFor, waitlistFor, withdrawWaitlist } from '../../services/waitlist'
import { Card, CardHeader, SectionTitle } from '../../components/ui/Card'
import { Badge, Button, EmptyState, Progress, Segmented, Tooltip } from '../../components/ui/primitives'
import { StatusBadge } from '../../components/StatusBadge'
import { Countdown } from '../../components/Countdown'
import { PriorityBreakdown } from '../../components/PriorityBreakdown'
import { ResourceGlyph } from '../../components/ResourceGlyph'

export default function WaitlistPage() {
  const db = useDb()
  const { user } = useAuth()
  const { push } = useToast()
  const navigate = useNavigate()
  const nowInstant = useNow(1000)
  const scope = useStaggerIn([])

  const [tab, setTab] = useState('active')
  const [expanded, setExpanded] = useState(null)

  const mine = useMemo(() => waitlistFor(user.id, db), [db, user.id])
  const offers = mine.filter((w) => w.status === 'offered')
  const waiting = mine.filter((w) => w.status === 'waiting')
  const history = mine.filter((w) => ['expired', 'confirmed', 'cancelled'].includes(w.status))

  const rows = tab === 'active' ? [...offers, ...waiting] : history

  const claim = (entry) => {
    try {
      const booking = confirmWaitlistOffer(entry.id, user.id)
      push({
        title: 'Slot claimed 🎉',
        body: `${booking.title} is confirmed with a fresh check-in QR.`,
        kind: 'success',
      })
      navigate('/bookings')
    } catch (error) {
      push({ title: 'Could not claim', body: error.message, kind: 'error' })
    }
  }

  const withdraw = (entry) => {
    try {
      withdrawWaitlist(entry.id, user.id)
      push({ title: 'Withdrawn', body: 'You are out of that queue.', kind: 'info' })
    } catch (error) {
      push({ title: 'Could not withdraw', body: error.message, kind: 'error' })
    }
  }

  return (
    <div ref={scope} className="space-y-6">
      <SectionTitle
        icon={Hourglass}
        title="Waitlist"
        subtitle="Queue for a slot that is taken. When it frees, the highest-scoring entry gets a 30-minute offer — then it rolls on."
        action={
          <Button variant="secondary" leftIcon={Search} onClick={() => navigate('/explore')}>
            Find another space
          </Button>
        }
      />

      {/* Ranking explainer */}
      <Card className="reveal border-brand-400/20 bg-brand-500/5">
        <div className="flex flex-wrap items-start gap-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-brand-400/30 bg-brand-500/12 text-brand-300">
            <ListOrdered className="size-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-white">How the queue is ordered</p>
            <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-slate-400">
              By priority score first (the same transparent factors as a booking), then by who joined
              earliest. You can see the people in front of you and what they scored — nothing about
              this queue is hidden.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11.5px] text-slate-500">
              {[
                ['1', 'Highest priority score'],
                ['2', 'Earliest request time'],
                ['3', 'Re-checked for conflicts'],
                ['4', '30-minute window to claim'],
              ].map(([n, label]) => (
                <span key={n} className="flex items-center gap-1.5 rounded-lg border border-white/8 bg-white/4 px-2 py-1">
                  <span className="num font-semibold text-brand-300">{n}</span>
                  {label}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge tone={offers.length ? 'amber' : 'slate'} dot>
              {offers.length} offer(s) open
            </Badge>
            <span className="num text-[11.5px] text-slate-500">{waiting.length} waiting</span>
          </div>
        </div>
      </Card>

      <div className="reveal">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'active', label: 'Active queues', count: offers.length + waiting.length },
            { value: 'history', label: 'History', count: history.length },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          className="reveal"
          icon={Hourglass}
          title={tab === 'active' ? 'You are not queuing for anything' : 'No waitlist history'}
          description={
            tab === 'active'
              ? 'When a slot you wanted is taken, join its waitlist and the engine will promote you automatically the moment it frees.'
              : 'Offers you claimed, missed or withdrew will appear here.'
          }
          action={
            <Button variant="secondary" onClick={() => navigate('/explore')}>
              Browse spaces
            </Button>
          }
        />
      ) : (
        <ul className="space-y-4">
          {rows.map((entry) => {
            const resource = db.resources.find((r) => r.id === entry.resourceId)
            const depth = queueDepthFor(entry.resourceId, entry.startTime, entry.endTime, db)
            const rivals = db.waitlist
              .filter(
                (w) =>
                  w.resourceId === entry.resourceId &&
                  w.status === 'waiting' &&
                  w.id !== entry.id &&
                  new Date(w.startTime) < new Date(entry.endTime) &&
                  new Date(w.endTime) > new Date(entry.startTime)
              )
              .sort((a, b) => b.priorityScore - a.priorityScore)
            const ahead = rivals.filter((r) => r.priorityScore > entry.priorityScore).length
            const isOffer = entry.status === 'offered'

            return (
              <li key={entry.id} className="reveal">
                <Card
                  hover
                  className={cn(isOffer && 'border-amber-450/35 bg-amber-450/6')}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3.5">
                      <ResourceGlyph type={resource?.type} size={46} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={entry.status} kind="waitlist" />
                          <Badge tone="brand">{humanizeFeature(entry.eventType)}</Badge>
                          {isOffer ? (
                            <Badge tone="amber" icon={CircleDashed}>
                              claim before it rolls
                            </Badge>
                          ) : null}
                        </div>
                        <h3 className="mt-2 truncate text-[15.5px] font-semibold text-white">
                          {entry.title}
                        </h3>
                        <p className="mt-1 text-[12.5px] text-slate-400">
                          {resource?.name} · {resource?.location} · {entry.attendees} people
                        </p>
                        <p className="num mt-1 text-[12.5px] font-medium text-slate-300">
                          {fmtDayShort(entry.startTime, TZ)} ·{' '}
                          {fmtRange(entry.startTime, entry.endTime, TZ)}
                        </p>
                        <p className="mt-1 text-[11.5px] text-slate-500">
                          joined {fmtRelative(entry.createdAt, nowInstant, TZ)} · queue depth{' '}
                          <span className="num">{depth}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      {isOffer ? (
                        <>
                          <Countdown to={entry.offerExpiresAt} prefix="expires in" />
                          <div className="flex items-center gap-2">
                            <Button size="sm" onClick={() => claim(entry)}>
                              Claim slot
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => withdraw(entry)}>
                              Pass
                            </Button>
                          </div>
                        </>
                      ) : entry.status === 'waiting' ? (
                        <>
                          <Tooltip content={`${ahead} entr${ahead === 1 ? 'y' : 'ies'} score higher than you`}>
                            <span className="num rounded-xl border border-white/10 bg-white/4 px-3 py-1.5 text-[12px] font-semibold text-slate-300">
                              {ahead === 0 ? '#1 in line' : `#${ahead + 1} in line`}
                            </span>
                          </Tooltip>
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="secondary" onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}>
                              {expanded === entry.id ? 'Hide' : 'Why this score'}
                            </Button>
                            <Tooltip content="Leave this queue">
                              <Button size="sm" variant="danger" onClick={() => withdraw(entry)}>
                                <Trash2 className="size-3.5" />
                              </Button>
                            </Tooltip>
                          </div>
                        </>
                      ) : (
                        <span className="text-[11.5px] text-slate-500">
                          {entry.status === 'confirmed'
                            ? 'Converted into a booking'
                            : entry.status === 'expired'
                              ? 'Offer expired before it was claimed'
                              : 'Withdrawn'}
                        </span>
                      )}
                    </div>
                  </div>

                  {expanded === entry.id ? (
                    <div className="mt-4 space-y-4 border-t border-white/8 pt-4">
                      <PriorityBreakdown
                        score={entry.priorityScore}
                        breakdown={entry.breakdown ?? {}}
                        dense
                      />

                      <div>
                        <p className="field-label">Ranking in this window</p>
                        <ul className="space-y-1.5">
                          <li className="flex items-center gap-3 rounded-lg border border-brand-400/25 bg-brand-500/8 px-2.5 py-2">
                            <Trophy className="size-3.5 shrink-0 text-brand-300" />
                            <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-white">
                              You
                            </span>
                            <span className="num shrink-0 text-[12px] font-semibold text-brand-300">
                              {entry.priorityScore}
                            </span>
                          </li>
                          {rivals.slice(0, 4).map((rival) => {
                            const person = db.profiles.find((p) => p.id === rival.userId)
                            return (
                              <li
                                key={rival.id}
                                className="flex items-center gap-3 rounded-lg border border-white/8 bg-white/3 px-2.5 py-2"
                              >
                                <Users className="size-3.5 shrink-0 text-slate-500" />
                                <span className="min-w-0 flex-1 truncate text-[12px] text-slate-300">
                                  {person?.fullName ?? 'Someone'} ·{' '}
                                  <span className="text-slate-500">{person?.club || person?.department}</span>
                                </span>
                                <span className="num shrink-0 text-[12px] font-semibold text-slate-400">
                                  {rival.priorityScore}
                                </span>
                              </li>
                            )
                          })}
                          {!rivals.length ? (
                            <li className="rounded-lg border border-dashed border-white/12 px-2.5 py-4 text-center text-[11.5px] text-slate-500">
                              You are the only entry for this window.
                            </li>
                          ) : null}
                        </ul>
                      </div>
                    </div>
                  ) : null}

                  {isOffer ? (
                    <div className="mt-4 space-y-2 border-t border-white/8 pt-4">
                      <p className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-450">
                        <Sparkles className="size-3.5" />
                        You are being offered this right now
                      </p>
                      <p className="text-[12px] leading-relaxed text-slate-400">
                        Claiming re-checks for conflicts and writes a confirmed booking with a
                        check-in QR. Letting it expire moves the offer to the next entry in line
                        ({Math.max(0, depth - 1)} behind you).
                      </p>
                      <div className="flex items-center gap-3 pt-1">
                        <div className="w-32">
                          <Progress value={0.75} max={1} tone="amber" thin />
                        </div>
                        <span className="text-[11px] text-slate-500">
                          claiming freezes the slot for you
                        </span>
                      </div>
                    </div>
                  ) : null}
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      <Card className="reveal">
        <CardHeader
          icon={Info}
          accent="slate"
          title="What happens when you do nothing"
          subtitle="The automation decides for you, deterministically."
        />
        <ol className="mt-4 space-y-2.5">
          {[
            'A booking is cancelled, released by an admin, or auto-released as a no-show.',
            'promote_waitlist finds every waiting entry that overlaps the freed window.',
            'It orders them by priority score, then by creation time.',
            'Each candidate is re-checked for conflicts and blackouts before it is offered.',
            'The winner gets a 30-minute offer; if it lapses, the next person is offered it immediately.',
          ].map((step, index) => (
            <li key={step} className="flex items-start gap-3">
              <span className="num mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/4 text-[11px] font-semibold text-slate-400">
                {index + 1}
              </span>
              <span className="text-[12.5px] leading-relaxed text-slate-300">{step}</span>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex items-center gap-2 border-t border-white/8 pt-4">
          <span className="text-[11.5px] text-slate-500">
            Offer window is currently
            <span className="num mx-1 font-semibold text-slate-300">
              {db.settings.offerWindowMin} minutes
            </span>
            — administrators can change it in Settings.
          </span>
          <Button size="sm" variant="ghost" rightIcon={ArrowRight} onClick={() => navigate('/explore')}>
            Explore
          </Button>
        </div>
      </Card>
    </div>
  )
}
