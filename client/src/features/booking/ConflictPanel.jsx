import {
  Ban,
  CalendarX2,
  CheckCircle2,
  Clock3,
  Hourglass,
  Info,
  TriangleAlert,
  Users,
} from 'lucide-react'
import { cn, fmtDayShort, fmtRange, humanizeFeature } from '../../lib/utils'
import { TZ } from '../../lib/utils'
import { Badge, Button } from '../../components/ui/primitives'
import { AlternativesList } from './AlternativesList'

/**
 * The inline feedback the booking form shows *before* the user submits, and the
 * richer panel it shows when the API refuses the write. Same information, two
 * moments — matching the "inline conflict check" requirement in Build.md §11.
 */
export function ConflictPanel({
  inspection,
  onApplyAlternative,
  onJoinWaitlist,
  onForceBook,
  className,
  busy = false,
}) {
  if (!inspection) return null

  if (inspection.past) {
    return (
      <Banner
        tone="amber"
        icon={Clock3}
        title="That slot is in the past"
        body="Pick a start time after the campus clock and the conflict check will run again."
        className={className}
      />
    )
  }

  if (inspection.invalidRange) {
    return (
      <Banner
        tone="amber"
        icon={Info}
        title="End time must be after start time"
        body="Adjust the window so it has a positive duration."
        className={className}
      />
    )
  }

  if (inspection.blackout) {
    return (
      <Banner
        tone="rose"
        icon={Ban}
        title="Resource is blocked"
        body={`${inspection.blackout.reason} · ${fmtRange(inspection.blackout.startTime, inspection.blackout.endTime, TZ)}`}
        className={className}
        footer={
          inspection.alternatives?.length ? (
            <AlternativesList alternatives={inspection.alternatives} onApply={onApplyAlternative} />
          ) : null
        }
      />
    )
  }

  if (inspection.capacityIssue) {
    return (
      <Banner
        tone="amber"
        icon={Users}
        title="Not enough seats"
        body={inspection.capacityIssue}
        className={className}
      />
    )
  }

  if (inspection.hard?.length) {
    const holder = inspection.hard[0]
    return (
      <div
        className={cn(
          'rounded-2xl border border-rose-450/30 bg-rose-500/8 p-4',
          className
        )}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-rose-450/35 bg-rose-450/12 text-rose-450">
            <CalendarX2 className="size-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-rose-100">
              That slot is already approved
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-rose-200/80">
              {holder.title} holds {inspection.resource?.name} for{' '}
              {fmtDayShort(holder.startTime, TZ)} · {fmtRange(holder.startTime, holder.endTime, TZ)}.
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <Badge tone="rose">
                {inspection.hard.length} blocking booking{inspection.hard.length > 1 ? 's' : ''}
              </Badge>
              <Badge tone="slate">{humanizeFeature(holder.eventType)}</Badge>
              <span className="num text-[11.5px] text-rose-200/70">
                their priority {holder.priorityScore}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 border-t border-rose-450/20 pt-4">
          <p className="mb-3 text-[12.5px] font-semibold text-rose-100">
            Ranked alternatives for the same request
          </p>
          <AlternativesList alternatives={inspection.alternatives ?? []} onApply={onApplyAlternative} />
        </div>

        {onJoinWaitlist ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-rose-450/20 pt-4">
            <Button size="sm" variant="secondary" leftIcon={Hourglass} onClick={onJoinWaitlist}>
              Join the waitlist for this slot
            </Button>
            <span className="text-[11.5px] text-rose-200/70">
              Highest priority score gets a 30-minute offer if it frees up.
            </span>
          </div>
        ) : null}
      </div>
    )
  }

  if (inspection.soft?.length) {
    return (
      <div className={cn('rounded-2xl border border-amber-450/30 bg-amber-450/8 p-4', className)}>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-amber-450/35 bg-amber-450/12 text-amber-450">
            <TriangleAlert className="size-4.5" />
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-amber-100">
              {inspection.soft.length} pending request
              {inspection.soft.length > 1 ? 's' : ''} overlap this window
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-amber-100/80">
              You can still submit. Both requests stay pending; the Conflict Mediator compares
              priority scores and, if the gap is inside the margin, a human decides.
            </p>
            <ul className="mt-3 space-y-1.5">
              {inspection.soft.map((other) => (
                <li
                  key={other.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-ink-950/40 px-2.5 py-2"
                >
                  <span className="min-w-0 text-[12px] text-slate-300">
                    <span className="font-semibold text-white">{other.title}</span> ·{' '}
                    {fmtRange(other.startTime, other.endTime, TZ)}
                  </span>
                  <span className="num shrink-0 text-[11.5px] font-semibold text-amber-450">
                    score {other.priorityScore}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    )
  }

  return (
    <Banner
      tone="mint"
      icon={CheckCircle2}
      title="Clear to book"
      body={`${inspection.resource?.name} is free for the whole window. ${
        inspection.resource?.requiresApproval
          ? `This space needs ${inspection.resource.approverRole} approval, so it will land as pending.`
          : 'This space books instantly.'
      }`}
      className={className}
    />
  )
}

function Banner({ tone, icon: Icon, title, body, footer, className }) {
  const tones = {
    mint: {
      wrap: 'border-mint-400/30 bg-mint-400/8',
      icon: 'border-mint-400/35 bg-mint-400/12 text-mint-400',
      title: 'text-mint-100',
      body: 'text-mint-100/80',
    },
    rose: {
      wrap: 'border-rose-450/30 bg-rose-500/8',
      icon: 'border-rose-450/35 bg-rose-450/12 text-rose-450',
      title: 'text-rose-100',
      body: 'text-rose-200/80',
    },
    amber: {
      wrap: 'border-amber-450/30 bg-amber-450/8',
      icon: 'border-amber-450/35 bg-amber-450/12 text-amber-450',
      title: 'text-amber-100',
      body: 'text-amber-100/80',
    },
  }
  const style = tones[tone] ?? tones.amber

  return (
    <div className={cn('rounded-2xl border p-4', style.wrap, className)}>
      <div className="flex items-start gap-3">
        <span className={cn('mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border', style.icon)}>
          <Icon className="size-4.5" />
        </span>
        <div className="min-w-0">
          <p className={cn('text-[14px] font-semibold', style.title)}>{title}</p>
          <p className={cn('mt-1 text-[12.5px] leading-relaxed', style.body)}>{body}</p>
        </div>
      </div>
      {footer ? <div className="mt-4 border-t border-white/10 pt-4">{footer}</div> : null}
    </div>
  )
}
