import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Activity,
  BadgeCheck,
  Bot,
  CalendarRange,
  CheckCheck,
  Flame,
  Gauge,
  Hourglass,
  Radio,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  TriangleAlert,
  Users,
} from 'lucide-react'
import { cn, fmtDayShort, fmtPct, humanizeFeature } from '../../lib/utils'
import { TZ } from '../../lib/utils'
import { useDb } from '../../lib/query'
import { useAuth } from '../../app/AuthProvider'
import { useStaggerIn } from '../../lib/gsap'
import {
  aiFeed,
  demandForecast,
  digest,
  fairnessLedger,
  heatmap,
  hoarding,
  overview,
  waitlistPressure,
  weekdayProfile,
} from '../../services/analytics'
import { Card, CardHeader, SectionTitle } from '../../components/ui/Card'
import { StatCard } from '../../components/ui/StatCard'
import { Badge, Button, EmptyState, Progress, Segmented, Tooltip } from '../../components/ui/primitives'
import { UserChip } from '../../components/UserChip'
import { UtilizationHeatmap } from './UtilizationHeatmap'
import { InsightsDigest } from './InsightsDigest'
import { AutomationPanel } from './AutomationPanel'

const DAYS_OPTIONS = [
  { value: 7, label: '7 days' },
  { value: 28, label: '28 days' },
  { value: 56, label: '56 days' },
]

export default function AdminDashboard() {
  const db = useDb()
  const { user } = useAuth()
  const navigate = useNavigate()
  const scope = useStaggerIn([])

  const [days, setDays] = useState(28)
  const [selectedResource, setSelectedResource] = useState(null)

  const aggregates = useMemo(() => overview(days, db), [days, db])
  const card = useMemo(() => heatmap(days, db), [days, db])
  const profile = useMemo(() => weekdayProfile(days, db), [days, db])
  const forecast = useMemo(() => demandForecast(db), [db])
  const flags = useMemo(() => hoarding(30, db), [db])
  const queue = useMemo(() => waitlistPressure(db), [db])
  const fairness = useMemo(() => fairnessLedger(db), [db])
  const runs = useMemo(() => aiFeed(8, db), [db])
  const insight = useMemo(() => digest(days, db), [days, db])

  const k = aggregates.kpis

  return (
    <div ref={scope} className="space-y-6">
      <SectionTitle
        icon={Activity}
        title="Operations room"
        subtitle="Utilisation, fairness, automation and the AI's own decisions — measured from the same rows everything else reads."
        action={
          <div className="flex items-center gap-2">
            <Segmented value={days} onChange={setDays} options={DAYS_OPTIONS} size="sm" />
            <Button variant="secondary" leftIcon={Radio} onClick={() => navigate('/calendar')}>
              Live calendar
            </Button>
          </div>
        }
      />

      <div className="reveal flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/3 px-4 py-3">
        <div>
          <p className="text-[10.5px] font-semibold uppercase text-slate-500">Administrator</p>
          <p className="mt-0.5 text-[13px] font-semibold text-white">{user.fullName}</p>
          <p className="text-[11.5px] text-slate-400">{user.department}</p>
        </div>
        <Badge tone={db.server?.connected ? 'mint' : 'amber'} dot>
          {db.server?.connected ? 'Database connected' : 'Demo data'}
        </Badge>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Campus utilisation"
          value={Math.round(aggregates.overallUtilization * 100)}
          suffix="%"
          icon={Gauge}
          tone="brand"
          hint={`${aggregates.totalHours} booked hours of ${aggregates.capacityHours} available`}
          trend={{ direction: aggregates.overallUtilization > 0.4 ? 'up' : 'down', value: `${days}d window` }}
        />
        <StatCard
          label="Bookings in window"
          value={k.totalBookings}
          icon={CalendarRange}
          tone="aqua"
          hint={`${k.activeBookings} still active · ${k.liveNow} in progress right now`}
        />
        <StatCard
          label="No-show rate"
          value={Math.round(k.noShowRate * 100)}
          suffix="%"
          icon={TriangleAlert}
          tone={k.noShowRate > 0.08 ? 'rose' : 'slate'}
          hint={`${k.wastedHours} booked hours released unused`}
        />
        <StatCard
          label="Decision latency"
          value={aggregates.avgApprovalHours}
          decimals={1}
          suffix="h"
          icon={CheckCheck}
          tone={aggregates.avgApprovalHours > aggregates.slaHours ? 'rose' : 'mint'}
          hint={`SLA ${aggregates.slaHours} h · ${k.pendingCount} pending now`}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="reveal">
          <CardHeader
            icon={TrendingUp}
            accent="brand"
            title="The shape of the campus week"
            subtitle={`Bookings and hours by weekday, last ${days} days`}
          />
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={profile} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <RechartsTooltip
                  contentStyle={{
                    background: 'rgba(8,11,22,0.96)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 12,
                    fontSize: 12,
                    color: '#e2e8f0',
                  }}
                  labelStyle={{ color: '#fff', fontWeight: 600 }}
                  formatter={(value, name) => [value, name === 'bookings' ? 'bookings' : 'hours']}
                />
                <Bar dataKey="bookings" radius={[6, 6, 0, 0]}>
                  {profile.map((entry) => (
                    <Cell
                      key={entry.label}
                      fill={entry.index === 0 || entry.index === 6 ? 'rgba(34,211,238,0.65)' : 'rgba(109,94,248,0.85)'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-[11.5px] text-slate-500">
            Weekends (cyan) carry a fraction of the load — prime weekday windows are where
            everything collides.
          </p>
        </Card>

        <Card className="reveal">
          <CardHeader
            icon={TrendingUp}
            accent="aqua"
            title="7-day demand forecast"
            subtitle={forecast.narrative}
          />
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={forecast.days.map((day) => ({
                  ...day,
                  pct: Math.round(day.expectedUtilization * 100),
                }))}
                margin={{ top: 4, right: 4, bottom: 0, left: -18 }}
              >
                <defs>
                  <linearGradient id="cf-forecast" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38e0f0" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#38e0f0" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis
                  dataKey="weekday"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  domain={[0, 100]}
                  unit="%"
                />
                <RechartsTooltip
                  contentStyle={{
                    background: 'rgba(8,11,22,0.96)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 12,
                    fontSize: 12,
                    color: '#e2e8f0',
                  }}
                  labelStyle={{ color: '#fff', fontWeight: 600 }}
                  formatter={(value) => [`${value}%`, 'expected demand']}
                />
                <Area
                  type="monotone"
                  dataKey="pct"
                  stroke="#38e0f0"
                  strokeWidth={2}
                  fill="url(#cf-forecast)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-[11.5px] text-slate-500">
            Trailing three-week average by weekday. The narrative restates these numbers only — it
            never invents one.
          </p>
        </Card>
      </div>

      {/* Heatmap */}
      <Card className="reveal">
        <CardHeader
          icon={Flame}
          accent="rose"
          title="Utilisation heatmap"
          subtitle="Where capacity is genuinely consumed, hour by hour."
        />
        <div className="mt-4">
          <UtilizationHeatmap data={card} selectedId={selectedResource} onSelectResource={setSelectedResource} />
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        {/* Digest */}
        <Card className="reveal">
          <CardHeader
            icon={Sparkles}
            accent="aqua"
            title="AI insights digest"
            subtitle="Generated from the aggregates above; every quoted number exists in the input."
          />
          <div className="mt-4">
            <InsightsDigest digest={insight} aggregates={aggregates} />
          </div>
        </Card>

        {/* Right column stacks */}
        <div className="space-y-6">
          {/* Hoarding */}
          <Card className="reveal">
            <CardHeader
              icon={ShieldAlert}
              accent="amber"
              title="Hoarding & abuse watch"
              subtitle="Flags only — a human decides on penalties."
              action={<Badge tone={flags.length ? 'amber' : 'mint'}>{flags.length} flagged</Badge>}
            />
            <div className="mt-4 space-y-2.5">
              {flags.length ? (
                flags.slice(0, 4).map((flag) => (
                  <div key={flag.userId} className="rounded-xl border border-white/10 bg-white/3 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <UserChip user={flag.user} size={30} />
                      <Badge tone={flag.severity === 'high' ? 'rose' : 'amber'}>{flag.severity}</Badge>
                    </div>
                    <ul className="mt-2 space-y-1">
                      {flag.reasons.map((reason) => (
                        <li key={reason} className="flex items-center gap-1.5 text-[11.5px] text-amber-450">
                          <TriangleAlert className="size-3" />
                          {reason}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1.5 text-[11px] text-slate-500">{flag.note}</p>
                  </div>
                ))
              ) : (
                <p className="rounded-xl border border-dashed border-white/12 px-3 py-6 text-center text-[12px] text-slate-500">
                  No unusual reservation patterns.
                </p>
              )}
            </div>
          </Card>

          {/* Waitlist pressure */}
          <Card className="reveal">
            <CardHeader
              icon={Hourglass}
              accent="brand"
              title="Waitlist pressure"
              subtitle={`${k.waitlistWaiting} waiting · ${k.waitlistOffers} live offer(s)`}
            />
            <div className="mt-4 space-y-2.5">
              {queue.length ? (
                queue.slice(0, 5).map((row) => (
                  <div key={row.resourceId} className="flex items-center gap-3">
                    <span className="w-36 shrink-0 truncate text-[12px] font-medium text-slate-300">
                      {row.name}
                    </span>
                    <div className="flex-1">
                      <Progress
                        value={row.waiting}
                        max={Math.max(1, queue[0].waiting)}
                        tone="amber"
                        thin
                      />
                    </div>
                    <span className="num w-16 shrink-0 text-right text-[11.5px] text-slate-400">
                      {row.waiting} waiting
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-[12px] text-slate-500">Nobody is queuing right now.</p>
              )}
            </div>
          </Card>

          {/* Fairness */}
          <Card className="reveal">
            <CardHeader
              icon={Users}
              accent="mint"
              title="Fairness ledger"
              subtitle="Approved hours per group — the input to the fairness bonus."
            />
            <div className="mt-4 space-y-2.5">
              {fairness.slice(0, 6).map((row) => (
                <div key={row.group} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 truncate text-[12px] font-medium text-slate-300">
                    {row.group}
                  </span>
                  <div className="flex-1">
                    <Progress
                      value={row.hours}
                      max={Math.max(1, fairness[0].hours)}
                      tone="mint"
                      thin
                    />
                  </div>
                  <span className="num w-14 shrink-0 text-right text-[11.5px] text-slate-400">
                    {row.hours} h
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-slate-500">
              The lightest group gets up to +{db.settings.priority.fairnessCap} points on its next
              request, so long-running bookings do not crowd everyone else out.
            </p>
          </Card>
        </div>
      </div>

      {/* Automation */}
      <Card className="reveal">
        <CardHeader
          icon={Bot}
          accent="mint"
          title="Ops automator"
          subtitle="No-show release, waitlist promotion, reminders, escalation and the live campus simulation."
          action={<Badge tone="mint" dot>{db.workerLog.length} log entries</Badge>}
        />
        <div className="mt-4">
          <AutomationPanel db={db} />
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Hotspots */}
        <Card className="reveal">
          <CardHeader
            icon={Flame}
            accent="rose"
            title="Conflict hotspots"
            subtitle="Overlaps between active requests — where the mediator keeps getting called."
          />
          <div className="mt-4 space-y-2.5">
            {aggregates.hotspots.length ? (
              aggregates.hotspots.slice(0, 6).map((row) => (
                <div key={row.resourceId} className="flex items-center gap-3">
                  <span className="w-36 shrink-0 truncate text-[12px] font-medium text-slate-300">
                    {row.name}
                  </span>
                  <div className="flex-1">
                    <Progress value={row.conflicts} max={aggregates.hotspots[0].conflicts || 1} tone="rose" thin />
                  </div>
                  <span className="num w-20 shrink-0 text-right text-[11px] text-slate-400">
                    {row.conflicts} clash · {row.prime} prime
                  </span>
                </div>
              ))
            ) : (
              <p className="text-[12px] text-slate-500">No collisions in this window.</p>
            )}
          </div>
        </Card>

        {/* AI runs */}
        <Card className="reveal">
          <CardHeader
            icon={Bot}
            accent="brand"
            title="AI activity log"
            subtitle="Every skill call, its latency and whether it fell back to the deterministic path."
            action={
              <Tooltip content="Open the full audit trail">
                <Button size="sm" variant="ghost" onClick={() => navigate('/audit')}>
                  Audit trail
                </Button>
              </Tooltip>
            }
          />
          <div className="mt-4">
            {runs.length ? (
              <ul className="space-y-1.5">
                {runs.map((run) => (
                  <li
                    key={run.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-white/3 px-2.5 py-2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-[11.5px] text-slate-300">
                        {run.name}
                      </span>
                      <span className="block text-[10.5px] text-slate-500">
                        {fmtDayShort(run.createdAt, TZ)} · {run.latencyMs} ms
                      </span>
                    </span>
                    <Badge tone={run.usedFallback ? 'amber' : 'mint'}>
                      {run.usedFallback ? 'fallback' : 'model'}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                compact
                icon={Bot}
                title="No AI activity yet"
                description="Ask the concierge or open the approvals inbox — every skill call is logged here."
              />
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="reveal flex items-center gap-3.5">
          <span className="flex size-10 items-center justify-center rounded-xl border border-mint-400/25 bg-mint-400/10 text-mint-400">
            <BadgeCheck className="size-4.5" />
          </span>
          <div>
            <p className="num text-xl font-bold text-white">{k.checkInsToday}</p>
            <p className="text-[11.5px] text-slate-500">check-ins today</p>
          </div>
        </Card>
        <Card className="reveal flex items-center gap-3.5">
          <span className="flex size-10 items-center justify-center rounded-xl border border-rose-450/25 bg-rose-450/10 text-rose-450">
            <TriangleAlert className="size-4.5" />
          </span>
          <div>
            <p className="num text-xl font-bold text-white">{k.noShowCount}</p>
            <p className="text-[11.5px] text-slate-500">auto-released no-shows</p>
          </div>
        </Card>
        <Card className="reveal flex items-center gap-3.5">
          <span className="flex size-10 items-center justify-center rounded-xl border border-brand-400/25 bg-brand-500/10 text-brand-300">
            <Gauge className="size-4.5" />
          </span>
          <div>
            <p className="num text-xl font-bold text-white">
              {fmtPct(aggregates.primeSlotDemand.share / 100, 0)}
            </p>
            <p className="text-[11.5px] text-slate-500">
              requests land in {aggregates.primeSlotDemand.window}
            </p>
          </div>
        </Card>
      </div>

      <p className={cn('text-[11px]', 'text-slate-600')}>
        Automation cadences are compressed ({' '}
        {Object.entries(db.settings.workers)
          .filter(([, enabled]) => enabled)
          .length}{' '}
        jobs enabled ) so the effects are visible in a live demo. Use the demo clock to advance
        time and watch the no-show sweep and offer expiry fire.
      </p>
    </div>
  )
}
