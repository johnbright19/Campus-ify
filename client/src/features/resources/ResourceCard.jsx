import { CalendarPlus, ChevronRight, Clock, MapPin, ShieldCheck, Users } from 'lucide-react'
import { cn, humanizeFeature } from '../../lib/utils'
import { Badge, Button, Progress, Tooltip } from '../../components/ui/primitives'
import { ResourceGlyph, TYPE_LABEL } from '../../components/ResourceGlyph'

/**
 * One space, at a glance: what it seats, what it has, how contested it is, and
 * whether it is free in the window the visitor is looking at.
 */
export function ResourceCard({ resource, stats, availability, onBook, onOpen, className, index = 0 }) {
  const utilization = stats?.utilization ?? 0
  const contested = availability?.contested ? availability.contested > 0 : false
  const free = availability?.free

  return (
    <article
      className={cn(
        'reveal card card-hover card-pad group flex flex-col',
        className
      )}
      style={{ '--reveal-index': index }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <ResourceGlyph type={resource.type} size={42} />
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold text-white">{resource.name}</h3>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11.5px] text-slate-500">
              <MapPin className="size-3 shrink-0" />
              {resource.location}
            </p>
          </div>
        </div>
        <Badge tone="slate" className="shrink-0">
          {TYPE_LABEL[resource.type] ?? resource.type}
        </Badge>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-slate-400">
        {resource.capacity > 0 ? (
          <span className="flex items-center gap-1.5">
            <Users className="size-3.5 text-slate-500" />
            <span className="num font-medium text-slate-300">{resource.capacity}</span> seats
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-slate-500" />
            Equipment loan
          </span>
        )}
        <span className="flex items-center gap-1.5">
          {resource.requiresApproval ? (
            <>
              <Clock className="size-3.5 text-amber-450" />
              Needs approval
            </>
          ) : (
            <>
              <ShieldCheck className="size-3.5 text-mint-400" />
              Instant booking
            </>
          )}
        </span>
      </div>

      {resource.features?.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {resource.features.slice(0, 4).map((feature) => (
            <span
              key={feature}
              className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10.5px] font-medium text-slate-400"
            >
              {humanizeFeature(feature)}
            </span>
          ))}
          {resource.features.length > 4 ? (
            <Tooltip content={resource.features.slice(4).map(humanizeFeature).join(', ')}>
              <span className="num rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10.5px] font-semibold text-slate-500">
                +{resource.features.length - 4}
              </span>
            </Tooltip>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-medium text-slate-500">28-day utilisation</span>
          <span className="num font-semibold text-slate-300">{Math.round(utilization * 100)}%</span>
        </div>
        <Progress
          value={utilization}
          max={1}
          tone={utilization > 0.65 ? 'rose' : utilization > 0.35 ? 'amber' : 'mint'}
        />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        {availability ? (
          availability.free ? (
            <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-mint-400">
              <span className="size-1.5 rounded-full bg-mint-400" />
              Free in your window
              {contested ? <span className="text-slate-500">· {availability.contested} pending</span> : null}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-rose-450">
              <span className="size-1.5 rounded-full bg-rose-450" />
              {availability.reason ?? 'Busy in your window'}
            </span>
          )
        ) : (
          <span className="text-[11.5px] text-slate-500">
            {stats?.upcoming ? `${stats.upcoming} upcoming booking(s)` : 'No upcoming bookings'}
          </span>
        )}

        <ChevronRight className="size-4 shrink-0 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-slate-400" />
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-white/6 pt-4">
        <Button size="sm" className="flex-1" leftIcon={CalendarPlus} onClick={() => onBook(resource)}>
          Book
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onOpen(resource)}>
          Details
        </Button>
      </div>
    </article>
  )
}
