import { useEffect, useState } from 'react'
import { Timer, TriangleAlert } from 'lucide-react'
import { cn, fmtCountdown } from '../lib/utils'
import { useNow } from '../lib/query'

/**
 * Live countdown to an instant. Reads the simulated campus clock, so the demo
 * time-warp moves every countdown in the UI at once.
 */
export function Countdown({
  to,
  className,
  prefix = null,
  onExpire,
  warnBelowMs = 5 * 60000,
  showIcon = true,
  compact = false,
}) {
  const nowInstant = useNow(1000)
  const target = to ? new Date(to).getTime() : null
  const remaining = target ? target - nowInstant.getTime() : null
  const [fired, setFired] = useState(false)

  useEffect(() => {
    if (remaining != null && remaining <= 0 && !fired) {
      setFired(true)
      onExpire?.()
    }
    if (remaining != null && remaining > 0 && fired) setFired(false)
  }, [remaining, fired, onExpire])

  if (remaining == null) return null

  const expired = remaining <= 0
  const urgent = !expired && remaining <= warnBelowMs

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 font-mono text-[11.5px] font-semibold tabular-nums',
        expired && 'border-rose-450/35 bg-rose-500/12 text-rose-450',
        !expired && urgent && 'border-amber-450/35 bg-amber-450/12 text-amber-450',
        !expired && !urgent && 'border-white/12 bg-white/6 text-slate-300',
        className
      )}
    >
      {showIcon ? (
        urgent || expired ? (
          <TriangleAlert className="size-3.5" />
        ) : (
          <Timer className="size-3.5" />
        )
      ) : null}
      {prefix ? <span className="font-sans font-medium opacity-80">{prefix}</span> : null}
      {expired ? 'expired' : fmtCountdown(remaining)}
      {!compact && !expired ? null : null}
    </span>
  )
}
