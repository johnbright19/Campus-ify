import { useMemo } from 'react'
import { Gavel, Scale, Sparkles, TrendingUp } from 'lucide-react'
import { fmtDayShort, fmtRange } from '../../lib/utils'
import { TZ } from '../../lib/utils'
import { useDb } from '../../lib/query'
import { useStaggerIn } from '../../lib/gsap'
import { closeCallQueue } from '../../services/bookings'
import { conflictHotspots } from '../../services/analytics'
import { Card, CardHeader, SectionTitle } from '../../components/ui/Card'
import { Badge, EmptyState, Progress } from '../../components/ui/primitives'
import { ConflictComparison } from './ConflictComparison'

export default function MediatorPage() {
  const db = useDb()
  const scope = useStaggerIn([])

  const pairs = useMemo(() => closeCallQueue(db), [db])
  const hotspots = useMemo(() => conflictHotspots(28, db), [db])
  const widest = pairs.length ? pairs[pairs.length - 1] : null

  return (
    <div ref={scope} className="space-y-6">
      <SectionTitle
        icon={Gavel}
        title="Mediator desk"
        subtitle="Where the engine refuses to decide. Two requests, the same window, a gap too small to be fair automatically."
        action={
          <Badge tone={pairs.length ? 'rose' : 'mint'} dot>
            {pairs.length ? `${pairs.length} unresolved` : 'nothing to mediate'}
          </Badge>
        }
      />

      <div className="reveal grid gap-4 sm:grid-cols-3">
        <Card className="flex items-center gap-3.5">
          <span className="flex size-10 items-center justify-center rounded-xl border border-rose-450/25 bg-rose-450/10 text-rose-450">
            <Scale className="size-4.5" />
          </span>
          <div>
            <p className="num text-xl font-bold text-white">{pairs.length}</p>
            <p className="text-[11.5px] text-slate-500">close calls pending</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3.5">
          <span className="flex size-10 items-center justify-center rounded-xl border border-brand-400/25 bg-brand-500/10 text-brand-300">
            <TrendingUp className="size-4.5" />
          </span>
          <div>
            <p className="num text-xl font-bold text-white">
              {widest ? widest.gap.toFixed(1) : '—'}
            </p>
            <p className="text-[11.5px] text-slate-500">widest gap (still too close)</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3.5">
          <span className="flex size-10 items-center justify-center rounded-xl border border-amber-450/25 bg-amber-450/10 text-amber-450">
            <Sparkles className="size-4.5" />
          </span>
          <div>
            <p className="num text-xl font-bold text-white">
              {db.settings.priority.closeCallMargin}
            </p>
            <p className="text-[11.5px] text-slate-500">point margin (configurable)</p>
          </div>
        </Card>
      </div>

      {pairs.length === 0 ? (
        <EmptyState
          className="reveal"
          icon={Scale}
          title="No ties in the current window"
          description="Whenever two pending requests overlap and their scores land inside the margin, they queue up here side by side."
        />
      ) : (
        <div className="space-y-6">
          {pairs.map((pair) => (
            <div key={`${pair.a.id}-${pair.b.id}`} className="reveal space-y-3">
              <p className="text-[12px] text-slate-500">
                Overlap of{' '}
                <span className="num font-semibold text-slate-300">
                  {Math.round(pair.overlapMs / 60000)} min
                </span>{' '}
                on {pair.resource?.name} · {fmtDayShort(pair.a.startTime, TZ)}{' '}
                {fmtRange(pair.a.startTime, pair.b.endTime, TZ)}
              </p>
              <ConflictComparison pair={pair} />
            </div>
          ))}
        </div>
      )}

      <Card className="reveal">
        <CardHeader
          icon={TrendingUp}
          accent="amber"
          eyebrow="Diagnostics"
          title="Where collisions cluster"
          subtitle="Resources with the most overlapping active requests over the last 28 days."
        />
        <div className="mt-4 space-y-3">
          {hotspots.length ? (
            hotspots.slice(0, 6).map((row) => {
              const max = hotspots[0].conflicts || 1
              return (
                <div key={row.resourceId} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 truncate text-[12.5px] font-medium text-slate-300">
                    {row.name}
                  </span>
                  <div className="flex-1">
                    <Progress value={row.conflicts} max={max} tone="rose" thin />
                  </div>
                  <span className="num w-8 shrink-0 text-right text-[12px] font-semibold text-slate-400">
                    {row.conflicts}
                  </span>
                </div>
              )
            })
          ) : (
            <p className="text-[12px] text-slate-500">No overlaps recorded in this window.</p>
          )}
        </div>
      </Card>
    </div>
  )
}
