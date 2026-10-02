import { ArrowRight, CalendarClock, DoorOpen, MapPin, Users } from 'lucide-react'
import { cn, fmtDayShort, fmtRange } from '../../lib/utils'
import { TZ } from '../../lib/utils'
import { Badge, Button, Progress } from '../../components/ui/primitives'

const TYPE_META = {
  other_time: { label: 'Same space, another time', icon: CalendarClock, tone: 'brand' },
  other_day: { label: 'Same space, another day', icon: CalendarClock, tone: 'aqua' },
  other_resource: { label: 'Similar space, same time', icon: DoorOpen, tone: 'mint' },
}

/**
 * S3 output, rendered. Deliberately shows *why* each option fits, so the user
 * can trade time against features with their eyes open.
 */
export function AlternativesList({ alternatives = [], onApply, className, compact = false }) {
  if (!alternatives.length) {
    return (
      <p className={cn('rounded-xl border border-dashed border-white/12 px-3 py-5 text-center text-[12px] text-slate-500', className)}>
        No alternative fits the same constraints. Try a different day, or join the waitlist.
      </p>
    )
  }

  return (
    <ul className={cn('space-y-2.5', className)} data-stagger>
      {alternatives.map((option) => {
        const meta = TYPE_META[option.type] ?? TYPE_META.other_time
        const Icon = meta.icon
        return (
          <li
            key={`${option.resourceId}-${option.start}-${option.type}`}
            className="rounded-xl border border-white/10 bg-ink-950/50 p-3.5 transition hover:border-white/20"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span
                  className={cn(
                    'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border',
                    meta.tone === 'brand' && 'border-brand-400/25 bg-brand-500/12 text-brand-300',
                    meta.tone === 'aqua' && 'border-aqua-400/25 bg-aqua-400/12 text-aqua-400',
                    meta.tone === 'mint' && 'border-mint-400/25 bg-mint-400/12 text-mint-400'
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-semibold text-white">{option.name}</p>
                  <p className="num mt-0.5 text-[12px] text-slate-400">
                    {fmtDayShort(option.start, TZ)} · {fmtRange(option.start, option.end, TZ)}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                    {option.location ? (
                      <span className="flex items-center gap-1">
                        <MapPin className="size-3" />
                        {option.location}
                      </span>
                    ) : null}
                    {option.capacity ? (
                      <span className="flex items-center gap-1">
                        <Users className="size-3" />
                        seats {option.capacity}
                      </span>
                    ) : null}
                    {option.warnedSoft ? <span className="text-amber-450">soft overlap</span> : null}
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-2">
                <div className="w-24">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-500">fit</span>
                    <span className="num font-semibold text-slate-300">
                      {Math.round(option.matchScore * 100)}%
                    </span>
                  </div>
                  <div className="mt-1">
                    <Progress
                      value={option.matchScore}
                      max={1}
                      tone={option.matchScore > 0.8 ? 'mint' : option.matchScore > 0.6 ? 'brand' : 'amber'}
                      thin
                    />
                  </div>
                </div>
                <Button size="sm" variant="secondary" rightIcon={ArrowRight} onClick={() => onApply(option)}>
                  Use this
                </Button>
              </div>
            </div>

            {!compact && option.reasons?.length ? (
              <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-white/6 pt-2.5">
                <Badge tone="slate">{meta.label}</Badge>
                {option.reasons.map((reason) => (
                  <span
                    key={reason}
                    className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10.5px] font-medium text-slate-400"
                  >
                    {reason}
                  </span>
                ))}
                {option.tradeoff ? (
                  <span className="rounded-md border border-amber-450/25 bg-amber-450/10 px-1.5 py-0.5 text-[10.5px] font-medium text-amber-450">
                    {option.tradeoff}
                  </span>
                ) : null}
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
