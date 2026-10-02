import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CalendarPlus,
  Clock,
  Compass,
  Flame,
  Gauge,
  Hourglass,
  Inbox,
  LayoutDashboard,
  QrCode,
  Scale,
  Sparkles,
  Ticket,
  Timer,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Users,
} from 'lucide-react'
import { cn, fmtDayShort, fmtRange, fmtRelative, humanizeFeature } from '../../lib/utils'
import { TZ } from '../../lib/utils'
import { useDb, useNow } from '../../lib/query'
import { useAuth } from '../../app/AuthProvider'
import { useStaggerIn } from '../../lib/gsap'
import { digest, overview } from '../../services/analytics'
import {
  bookingsFor,
  canCheckIn,
  closeCallQueue,
  confirmWaitlistOffer,
  pendingForApprover,
} from '../../services/bookings'
import { fmtPct } from '../../lib/utils'
import { Button, EmptyState, Progress } from '../../components/ui/primitives'
import { Card, CardHeader, SectionTitle } from '../../components/ui/Card'
import { StatCard } from '../../components/ui/StatCard'
import { StatusBadge } from '../../components/StatusBadge'
import { Countdown } from '../../components/Countdown'
import { PriorityBreakdown } from '../../components/PriorityBreakdown'
import { UserChip } from '../../components/UserChip'
import { useToast } from '../../app/ToastProvider'

export default function DashboardPage() {
  const db = useDb()
  const nowInstant = useNow(1000)
  const { user, role } = useAuth()
  const navigate = useNavigate()
  const { push } = useToast()
  const scope = useStaggerIn([user?.id])

  const mine = useMemo(() => bookingsFor(user.id, db), [db, user.id])

  const nextBooking = useMemo(
    () =>
      mine
        .filter((b) => ['approved', 'pending'].includes(b.status) && new Date(b.endTime) >= nowInstant)
        .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))[0] ?? null,
    [mine, nowInstant]
  )

  const pendingMine = mine.filter((b) => b.status === 'pending')
  const offers = useMemo(
    () => db.waitlist.filter((w) => w.userId === user.id && w.status === 'offered'),
    [db.waitlist, user.id]
  )
  const myWaitlist = useMemo(
    () => db.waitlist.filter((w) => w.userId === user.id && w.status === 'waiting'),
    [db.waitlist, user.id]
  )

  const inbox = useMemo(
    () => (['faculty', 'hod', 'admin'].includes(role) ? pendingForApprover(user.id, db) : []),
    [db, role, user.id]
  )
  const closeCalls = useMemo(
    () => (['hod', 'admin'].includes(role) ? closeCallQueue(db) : []),
    [db, role]
  )

  const aggregates = useMemo(
    () => (role === 'admin' ? overview(28, db) : null),
    [db, role]
  )
  const insight = useMemo(() => (role === 'admin' ? digest(28, db) : null), [db, role])

  const utilisationForMine = mine.filter((b) => b.status === 'completed').length

  return (
    <div ref={scope} className="space-y-6">
      {/* Greeting */}
      <div className="reveal flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">
            {fmtDayShort(nowInstant, db.settings.timezone)} · {db.settings.campusName}
          </p>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Welcome back, {user.fullName.split(' ')[0]}.
          </h1>
          <p className="mt-1.5 text-sm text-slate-400">
            {role === 'admin'
              ? 'Campus pressure, automation and fairness — all in one room.'
              : ['faculty', 'hod'].includes(role)
                ? `${inbox.length} request(s) need you. ${closeCalls.length} close call(s) are waiting on the mediator desk.`
                : 'Your bookings, offers and next check-in — plus a concierge that books by description.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" leftIcon={Compass} onClick={() => navigate('/explore')}>
            Explore spaces
          </Button>
          <Button leftIcon={CalendarPlus} onClick={() => navigate('/book')}>
            New booking
          </Button>
        </div>
      </div>

      {/* Personal stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active bookings" value={mine.filter((b) => ['approved', 'pending'].includes(b.status)).length} icon={Ticket} tone="brand" hint={`${pendingMine.length} awaiting an approver`} />
        <StatCard label="Completed" value={utilisationForMine} icon={BadgeCheck} tone="mint" hint="Lifetime sessions you attended" />
        <StatCard
          label="Waitlist"
          value={myWaitlist.length + offers.length}
          icon={Hourglass}
          tone="amber"
          hint={offers.length ? `${offers.length} live offer(s) — claim them` : 'Nothing on offer right now'}
        />
        <StatCard
          label="No-shows"
          value={user.noShowCount ?? 0}
          icon={TriangleAlert}
          tone={user.noShowCount >= 2 ? 'rose' : 'slate'}
          hint={user.noShowCount ? '−5 priority points per strike' : 'Clean record'}
        />
      </div>

      {/* Offers need immediate attention */}
      {offers.length ? (
        <Card className="reveal border-amber-450/25 bg-amber-450/6">
          <CardHeader
            icon={Hourglass}
            accent="amber"
            title="A slot opened up and it is yours for now"
            subtitle="Offers roll to the next person the moment they expire."
          />
          <div className="mt-4 space-y-3">
            {offers.map((offer) => (
              <div
                key={offer.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-ink-950/50 p-3.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-semibold text-white">{offer.title}</p>
                  <p className="num mt-0.5 text-[12px] text-slate-400">
                    {db.resources.find((r) => r.id === offer.resourceId)?.name} ·{' '}
                    {fmtRange(offer.startTime, offer.endTime, TZ)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Countdown to={offer.offerExpiresAt} prefix="expires in" />
                  <Button
                    size="sm"
                    onClick={() => {
                      try {
                        confirmWaitlistOffer(offer.id, user.id)
                        push({ title: 'Slot claimed', body: 'Your booking is confirmed.', kind: 'success' })
                      } catch (error) {
                        push({ title: 'Could not claim', body: error.message, kind: 'error' })
                      }
                    }}
                  >
                    Claim now
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: up next + requests */}
        <div className="space-y-6 lg:col-span-2">
          <Card className="reveal">
            <CardHeader
              icon={CalendarClock}
              accent="brand"
              title="Up next"
              subtitle="The next thing on your calendar."
              action={
                <Link to="/bookings" className="btn-ghost text-[12px]">
                  All bookings <ArrowRight className="size-3.5" />
                </Link>
              }
            />
            <div className="mt-4">
              {nextBooking ? (
                <div className="rounded-2xl border border-white/10 bg-ink-950/50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={nextBooking.status} />
                        <span className="text-[11.5px] text-slate-500">
                          {humanizeFeature(nextBooking.eventType)}
                        </span>
                      </div>
                      <p className="mt-2 truncate text-[16px] font-semibold text-white">
                        {nextBooking.title}
                      </p>
                      <p className="mt-1 text-[12.5px] text-slate-400">
                        {nextBooking.resource?.name} · {nextBooking.resource?.location}
                      </p>
                      <p className="num mt-1 text-[12.5px] font-medium text-slate-300">
                        {fmtDayShort(nextBooking.startTime, TZ)} ·{' '}
                        {fmtRange(nextBooking.startTime, nextBooking.endTime, TZ)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Countdown to={nextBooking.startTime} prefix="starts" />
                      {canCheckIn(nextBooking, db.settings, nowInstant) ? (
                        <Button size="sm" leftIcon={QrCode} onClick={() => navigate('/bookings')}>
                          Check in
                        </Button>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => navigate('/bookings')}>
                          Details
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 border-t border-white/8 pt-4">
                    <PriorityBreakdown
                      score={nextBooking.priorityScore}
                      breakdown={nextBooking.priorityBreakdown}
                      notes={nextBooking.aiMeta?.scoreNotes ?? []}
                      verified={nextBooking.verified}
                      dense
                    />
                  </div>
                </div>
              ) : (
                <EmptyState
                  compact
                  icon={CalendarPlus}
                  title="Nothing booked yet"
                  description="Describe what you need in the concierge, or browse the explorer."
                  action={
                    <Button size="sm" onClick={() => navigate('/explore')}>
                      Explore spaces
                    </Button>
                  }
                />
              )}
            </div>
          </Card>

          <Card className="reveal">
            <CardHeader
              icon={Sparkles}
              accent="aqua"
              title="Smart suggestions"
              subtitle="Generated from where the campus actually has slack."
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(aggregates?.idleResources ?? db.resources.slice(0, 4)).slice(0, 4).map((resource) => {
                const full = db.resources.find((r) => r.id === (resource.id ?? resource)) ?? resource
                if (!full?.name) return null
                return (
                  <button
                    key={full.id}
                    type="button"
                    onClick={() => navigate('/book', { state: { prefill: { resourceId: full.id } } })}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/3 px-3.5 py-3 text-left transition hover:border-brand-400/40 hover:bg-white/6"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-white">
                        {full.name}
                      </span>
                      <span className="block truncate text-[11.5px] text-slate-500">
                        {full.location} · seats {full.capacity || '—'}
                      </span>
                    </span>
                    <span className="num shrink-0 text-[11px] font-semibold text-mint-400">
                      {resource.utilization != null
                        ? `${Math.round((1 - resource.utilization) * 100)}% slack`
                        : 'open'}
                    </span>
                  </button>
                )
              })}
            </div>
          </Card>
        </div>

        {/* Right: role console */}
        <div className="space-y-6">
          {['faculty', 'hod', 'admin'].includes(role) ? (
            <div className="group relative rounded-2xl bg-gradient-to-b from-brand-400/20 to-transparent p-[1px] shadow-2xl transition-all duration-500 hover:shadow-brand-500/20">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-white/5 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
              <Card className="reveal relative h-full rounded-[15px] border-0 bg-ink-950/90 backdrop-blur-2xl">
              <CardHeader
                icon={Inbox}
                accent="amber"
                title="Approvals waiting"
                subtitle={`${inbox.length} request(s) in your queue`}
                action={
                  <Button size="sm" variant="secondary" onClick={() => navigate('/approvals')} className="shadow-lg hover:shadow-brand-500/20 transition-all">
                    Open inbox
                  </Button>
                }
              />
              <div className="mt-4 space-y-3">
                {inbox.length ? (
                  inbox.slice(0, 4).map((booking) => (
                    <div
                      key={booking.id}
                      className="group/item flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/5 px-4 py-3 shadow-inner transition-all hover:scale-[1.02] hover:bg-white/10 hover:shadow-xl"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-white group-hover/item:text-brand-300 transition-colors">{booking.title}</p>
                        <p className="truncate text-[11.5px] text-slate-400">
                          {booking.resource?.name} · {fmtRange(booking.startTime, booking.endTime, TZ)}
                        </p>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="num shrink-0 text-[13px] font-bold text-brand-400 drop-shadow-md">
                          {booking.priorityScore}
                        </span>
                        <span className="text-[10px] text-slate-500">score</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="rounded-xl border border-dashed border-brand-500/20 bg-brand-500/5 px-3 py-8 text-center text-[13px] text-brand-300 font-medium">
                    Queue is clear. Nice. ✨
                  </p>
                )}
              </div>
            </Card>
            </div>
          ) : null}

          {['hod', 'admin'].includes(role) ? (
            <div className="group relative rounded-2xl bg-gradient-to-b from-rose-500/20 to-transparent p-[1px] shadow-2xl transition-all duration-500 hover:shadow-rose-500/20">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-white/5 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
            <Card className="reveal relative h-full rounded-[15px] border-0 bg-ink-950/90 backdrop-blur-2xl">
              <CardHeader
                icon={Scale}
                accent="rose"
                title="Mediator desk"
                subtitle="Close calls a human must settle."
                action={
                  <Button size="sm" variant="secondary" onClick={() => navigate('/mediator')} className="shadow-lg hover:shadow-rose-500/20 transition-all">
                    Compare
                  </Button>
                }
              />
              <div className="mt-4 space-y-3">
                {closeCalls.length ? (
                  closeCalls.slice(0, 3).map((pair) => (
                    <div key={`${pair.a.id}-${pair.b.id}`} className="group/item rounded-xl border border-white/5 bg-white/5 px-4 py-3 shadow-inner transition-all hover:scale-[1.02] hover:bg-white/10 hover:shadow-xl">
                      <p className="truncate text-[13px] font-semibold text-white group-hover/item:text-rose-300 transition-colors">{pair.resource?.name}</p>
                      <p className="num mt-0.5 text-[11.5px] text-slate-400">
                        gap {pair.gap.toFixed(1)} pts · {fmtDayShort(pair.a.startTime, TZ)}
                      </p>
                      <div className="mt-3 flex items-center justify-between rounded-lg bg-ink-950/50 px-3 py-2">
                        <span className="num text-[12px] font-semibold text-brand-400">{pair.a.priorityScore}</span>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">vs</span>
                        <span className="num text-[12px] font-semibold text-aqua-400">{pair.b.priorityScore}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="rounded-xl border border-dashed border-rose-500/20 bg-rose-500/5 px-3 py-8 text-center text-[13px] text-rose-300 font-medium">
                    No ties in the current window.
                  </p>
                )}
              </div>
            </Card>
            </div>
          ) : null}

          {role === 'admin' && aggregates ? (
            <>
              <Card className="reveal">
                <CardHeader
                  icon={Gauge}
                  accent="mint"
                  title="Campus pressure"
                  subtitle={`${aggregates.days}-day utilisation across every space`}
                  action={
                    <Button size="sm" variant="secondary" onClick={() => navigate('/admin')}>
                      Operations
                    </Button>
                  }
                />
                <div className="mt-4 space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-[11.5px]">
                      <span className="text-slate-400">Overall utilisation</span>
                      <span className="num font-semibold text-white">
                        {fmtPct(aggregates.overallUtilization)}
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <Progress value={aggregates.overallUtilization} max={1} tone="brand" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="surface-sunken px-3 py-2.5">
                      <p className="flex items-center gap-1.5 text-[10.5px] font-semibold tracking-[0.12em] text-slate-500 uppercase">
                        <TrendingUp className="size-3" /> Peak
                      </p>
                      <p className="mt-1 truncate text-[12.5px] font-semibold text-white">
                        {aggregates.busiestResource?.name ?? '—'}
                      </p>
                      <p className="num text-[11px] text-rose-450">
                        {fmtPct(aggregates.busiestResource?.utilization ?? 0)}
                      </p>
                    </div>
                    <div className="surface-sunken px-3 py-2.5">
                      <p className="flex items-center gap-1.5 text-[10.5px] font-semibold tracking-[0.12em] text-slate-500 uppercase">
                        <TrendingDown className="size-3" /> Slack
                      </p>
                      <p className="mt-1 truncate text-[12.5px] font-semibold text-white">
                        {aggregates.idleResources?.[0]?.name ?? '—'}
                      </p>
                      <p className="num text-[11px] text-mint-400">
                        {fmtPct(aggregates.idleResources?.[0]?.utilization ?? 0)}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 border-t border-white/8 pt-3 text-center">
                    <div>
                      <p className="num text-[15px] font-bold text-white">
                        {fmtPct(aggregates.noShowRate)}
                      </p>
                      <p className="text-[10.5px] text-slate-500">no-show rate</p>
                    </div>
                    <div>
                      <p className="num text-[15px] font-bold text-white">{aggregates.pendingCount}</p>
                      <p className="text-[10.5px] text-slate-500">pending</p>
                    </div>
                    <div>
                      <p className="num text-[15px] font-bold text-white">
                        {aggregates.avgApprovalHours.toFixed(1)}h
                      </p>
                      <p className="text-[10.5px] text-slate-500">to decide</p>
                    </div>
                  </div>
                </div>
              </Card>

              {insight ? (
                <Card className="reveal">
                  <CardHeader
                    icon={Sparkles}
                    accent="aqua"
                    title="AI digest"
                    subtitle="Every number below is drawn from the aggregates above."
                  />
                  <ul className="mt-4 space-y-2">
                    {insight.insights.slice(0, 3).map((line) => (
                      <li key={line} className="flex items-start gap-2 text-[12.5px] leading-relaxed text-slate-300">
                        <Activity className="mt-0.5 size-3.5 shrink-0 text-aqua-400" />
                        <span
                          dangerouslySetInnerHTML={{
                            __html: line
                              .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')
                              .replace(/^\*\s*/, ''),
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}
            </>
          ) : null}

          <Card className="reveal">
            <CardHeader icon={Flame} accent="brand" title="Your fairness ledger" subtitle="Hours your group has used this month." />
            <div className="mt-4 space-y-2.5">
              {[
                { label: 'Consumed hours', value: `${mine.filter((b) => ['approved', 'completed'].includes(b.status)).reduce((acc, b) => acc + (new Date(b.endTime) - new Date(b.startTime)) / 3600000, 0).toFixed(1)} h` },
                { label: 'No-show strikes', value: `${user.noShowCount ?? 0} / 4` },
                { label: 'Group', value: user.club || user.department },
                { label: 'Role weight', value: user.role },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-3 border-b border-white/6 pb-2 last:border-0">
                  <span className="text-[12px] text-slate-500">{row.label}</span>
                  <span className="num truncate text-[12.5px] font-semibold text-slate-200">{row.value}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-slate-500">
              <Clock className="mt-0.5 size-3.5 shrink-0" />
              Groups with fewer approved hours this month earn up to +15 fairness points on their next
              request.
            </p>
          </Card>

          <Card className="reveal">
            <CardHeader icon={Users} accent="slate" title="Who else is on campus" subtitle="Recent activity from the live feed." />
            <div className="mt-4 space-y-2.5">
              {db.bookings
                .filter((b) => ['approved', 'pending'].includes(b.status) && new Date(b.endTime) >= nowInstant)
                .slice(0, 4)
                .map((booking) => {
                  const person = db.profiles.find((p) => p.id === booking.userId)
                  return (
                    <div key={booking.id} className="flex items-center gap-3">
                      <UserChip user={person} size={30} showMeta={false} roleBadge={false} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-medium text-slate-200">{booking.title}</p>
                        <p className="truncate text-[11px] text-slate-500">
                          {person?.fullName} · {fmtRelative(booking.startTime, nowInstant, TZ)}
                        </p>
                      </div>
                      <StatusBadge status={booking.status} showIcon={false} />
                    </div>
                  )
                })}
            </div>
          </Card>
        </div>
      </div>

      <p className={cn('text-[11px]', 'text-slate-600')}>
        Tip: press <span className="kbd">⌘</span> <span className="kbd">K</span> from anywhere to jump
        consoles, run a no-show sweep or fast-forward the demo clock.
      </p>
    </div>
  )
}
