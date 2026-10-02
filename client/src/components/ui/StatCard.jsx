import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useCountUp } from '../../lib/gsap'
import { TONE_CHIP } from '../../lib/constants'
import { Card } from './Card'

/**
 * KPI tile with a GSAP count-up (Architecture.md §9: "Dashboard numbers —
 * count-up on KPIs"). String values render as-is.
 */
export function StatCard({
  label,
  value,
  decimals = 0,
  suffix = '',
  prefix = '',
  hint,
  icon: Icon,
  tone = 'brand',
  trend,
  className,
  footer,
}) {
  const numeric = typeof value === 'number' && Number.isFinite(value)
  const ref = useCountUp(numeric ? value : 0, { decimals })

  return (
    <Card hover className={cn('reveal overflow-hidden', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-slate-500 uppercase">{label}</p>
        {Icon ? (
          <span
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-xl border',
              TONE_CHIP[tone] ?? TONE_CHIP.brand
            )}
          >
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex items-end gap-2">
        <p className="num text-3xl leading-none font-bold tracking-tight text-white">
          {prefix}
          {numeric ? <span ref={ref}>0</span> : value}
          {numeric ? suffix : ''}
        </p>
        {trend ? (
          <span
            className={cn(
              'num mb-0.5 inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10.5px] font-semibold',
              trend.direction === 'up'
                ? 'border-mint-400/30 bg-mint-400/12 text-mint-400'
                : 'border-rose-450/30 bg-rose-450/12 text-rose-450'
            )}
          >
            {trend.direction === 'up' ? (
              <ArrowUpRight className="size-3" />
            ) : (
              <ArrowDownRight className="size-3" />
            )}
            {trend.value}
          </span>
        ) : null}
      </div>

      {hint ? <p className="mt-2 text-[12.5px] leading-snug text-slate-400">{hint}</p> : null}
      {footer ? <div className="mt-3 border-t border-white/6 pt-3">{footer}</div> : null}
    </Card>
  )
}
