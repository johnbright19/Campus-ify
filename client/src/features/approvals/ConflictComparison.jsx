import { useMemo, useState } from 'react'
import { Check, Gavel, Scale, Sparkles, TriangleAlert, Users } from 'lucide-react'
import { cn, fmtDayShort, fmtRange, humanizeFeature } from '../../lib/utils'
import { TZ } from '../../lib/utils'
import { useAuth } from '../../app/AuthProvider'
import { useToast } from '../../app/ToastProvider'
import { approveBooking, rejectBooking } from '../../services/bookings'
import { explainConflict, recommendResolution } from '../../services/ai'
import { Badge, Button, Progress } from '../../components/ui/primitives'
import { PriorityBreakdown } from '../../components/PriorityBreakdown'
import { UserChip } from '../../components/UserChip'

/**
 * A2 — the Conflict Mediator's close-call card.
 *
 * Shown only when the score gap is inside the configured margin, because that
 * is the one case where the engine refuses to pick a winner on its own. The
 * deterministic logic supplies the options; the model only ranks and explains.
 */
export function ConflictComparison({ pair, compact = false, onResolved }) {
  const { user } = useAuth()
  const { push } = useToast()
  const [busy, setBusy] = useState(null)

  const explanation = useMemo(
    () =>
      explainConflict({
        requester: pair.a,
        other: pair.b,
        decision: 'other_wins',
        requesterUserId: user?.id,
        log: false,
      }),
    [pair.a, pair.b, user?.id]
  )

  const resolution = useMemo(
    () => recommendResolution(pair.a, pair.b, { userId: user?.id, log: false }),
    [pair.a, pair.b, user?.id]
  )

  const resolve = (winnerId, loserId, label) => {
    setBusy(winnerId)
    try {
      approveBooking(winnerId, user.id)
      rejectBooking(
        loserId,
        user.id,
        `Resolved by mediator: the competing request scored ${label} in the same window. You keep priority on your next attempt.`
      )
      push({
        title: 'Clash resolved',
        body: 'The winner is confirmed; the other requester was notified with a reason.',
        kind: 'success',
      })
      onResolved?.()
    } catch (error) {
      push({ title: 'Could not resolve', body: error.message, kind: 'error' })
    } finally {
      setBusy(null)
    }
  }

  const maxScore = Math.max(pair.a.priorityScore, pair.b.priorityScore, 1)

  return (
    <div
      className={cn(
        'rounded-2xl border border-rose-450/25 bg-rose-500/5 p-4',
        compact && 'p-3.5'
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-rose-450/30 bg-rose-450/12 text-rose-450">
            <Scale className="size-4.5" />
          </span>
          <div>
            <p className="text-[14px] font-semibold text-rose-100">
              Too close to call — gap of {pair.gap.toFixed(1)} points
            </p>
            <p className="mt-0.5 text-[12px] text-rose-200/80">
              {pair.resource?.name} · {fmtDayShort(pair.a.startTime, TZ)} ·{' '}
              {fmtRange(pair.a.startTime, pair.b.endTime, TZ)}
            </p>
          </div>
        </div>
        <Badge tone="rose" icon={Gavel}>
          human decision required
        </Badge>
      </div>

      <div className={cn('mt-4 grid gap-3', compact ? 'sm:grid-cols-2' : 'lg:grid-cols-2')}>
        {[pair.a, pair.b].map((side, index) => {
          const other = index === 0 ? pair.b : pair.a
          const leads = side.priorityScore >= other.priorityScore
          return (
            <div
              key={side.id}
              className={cn(
                'rounded-xl border bg-ink-950/50 p-3.5',
                leads ? 'border-mint-400/30' : 'border-white/10'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <Badge tone={leads ? 'mint' : 'slate'}>{leads ? 'higher score' : 'challenger'}</Badge>
                <span className="num text-lg font-bold text-white">{side.priorityScore}</span>
              </div>

              <p className="mt-2.5 text-[13.5px] font-semibold text-white">{side.title}</p>
              <p className="num mt-1 text-[11.5px] text-slate-400">
                {fmtRange(side.startTime, side.endTime, TZ)} · {side.attendees}
                <span className="ml-1 inline-flex items-center">
                  <Users className="ml-0.5 size-3" />
                </span>
              </p>

              <div className="mt-2.5">
                <Progress value={side.priorityScore} max={maxScore} tone={leads ? 'mint' : 'amber'} />
              </div>

              <div className="mt-3">
                <UserChip user={side.user} size={26} showMeta />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Badge tone="brand">{humanizeFeature(side.eventType)}</Badge>
                {side.verified ? <Badge tone="mint">verified</Badge> : null}
                {side.user?.noShowCount >= 2 ? (
                  <Badge tone="rose" icon={TriangleAlert}>
                    {side.user.noShowCount} no-shows
                  </Badge>
                ) : null}
              </div>

              {!compact ? (
                <div className="mt-3 border-t border-white/8 pt-3">
                  <PriorityBreakdown
                    score={side.priorityScore}
                    breakdown={side.priorityBreakdown}
                    notes={side.aiMeta?.scoreNotes ?? []}
                    verified={side.verified}
                    dense
                  />
                </div>
              ) : null}

              <Button
                size="sm"
                className="mt-3 w-full"
                leftIcon={Check}
                loading={busy === side.id}
                onClick={() => resolve(side.id, other.id, `${side.priorityScore} vs ${other.priorityScore}`)}
              >
                Award this slot
              </Button>
            </div>
          )
        })}
      </div>

      <div className="mt-4 space-y-3 border-t border-rose-450/20 pt-4">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 size-3.5 shrink-0 text-aqua-400" />
          <div>
            <p className="text-[12.5px] font-semibold text-slate-200">Why it is this close</p>
            <p className="mt-1 text-[12px] leading-relaxed text-slate-400">
              {explanation.forOther}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-white/8 bg-white/3 p-3">
          <p className="text-[12px] font-semibold text-slate-200">Recommended paths</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-slate-400">{resolution.rationale}</p>
          {!compact ? (
            <ul className="mt-2.5 space-y-1.5">
              {resolution.options.map((option) => (
                <li
                  key={option.id}
                  className={cn(
                    'flex items-start justify-between gap-3 rounded-lg border px-2.5 py-2',
                    option.recommended
                      ? 'border-mint-400/30 bg-mint-400/8'
                      : 'border-white/8 bg-ink-950/40'
                  )}
                >
                  <span className="min-w-0">
                    <span className="block text-[12px] font-medium text-slate-200">
                      {option.description}
                    </span>
                    <span className="block text-[11px] text-slate-500">{option.impact}</span>
                  </span>
                  {option.recommended ? <Badge tone="mint">ranked first</Badge> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  )
}
